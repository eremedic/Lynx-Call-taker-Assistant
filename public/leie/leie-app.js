// Lynx EMS LEIE screening: page behavior, local storage, and printable reports.
// Everything runs in this browser. The LEIE database is kept in IndexedDB and
// the search history in localStorage; nothing is sent over the network.
(function () {
  'use strict';
  const C = window.LeieCore;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HISTORY_KEY = 'lynx-leie-history';
  const SCREENER_KEY = 'lynx-leie-screener';
  const HIT_LEVELS = new Set(['strong', 'name']);

  const state = { index: null, meta: null, roster: null, rosterResults: null, lastSingle: null };

  // ------------------------------------------------------------ storage

  const idb = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('lynx-leie', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error || new Error('Storage was blocked.')); };
      });
    },
    get(key) { return this.run('readonly', (s) => s.get(key)); },
    set(key, value) { return this.run('readwrite', (s) => s.put(value, key)); },
    del(key) { return this.run('readwrite', (s) => s.delete(key)); },
  };

  const local = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  };

  // ------------------------------------------------------------ helpers

  function show(el, on) { el.hidden = !on; }
  function setError(id, msg) { const el = $(id); el.textContent = msg || ''; show(el, !!msg); }
  const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const fmtNum = (n) => Number(n).toLocaleString();
  const screener = () => $('#screener').value.trim();

  async function readTable(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xls')) throw new Error('Older .xls files are not supported. In Excel, use File → Save As → CSV or Excel Workbook (.xlsx), then try again.');
    if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .xlsx files. Save the file as CSV, or use a current version of Chrome, Edge, Firefox, or Safari.');
      return window.LeieXlsx.readFirstSheet(await file.arrayBuffer());
    }
    return C.parseCSV(await file.text());
  }

  function wireDropzone(zone, input, onFile) {
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
    zone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); input.value = ''; });
  }

  function download(name, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------ tabs

  function selectTab(name) {
    $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.panel').forEach((p) => show(p, p.dataset.panel === name));
    if (name === 'history') renderHistory();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

  // ------------------------------------------------------------ LEIE database

  function isStale(meta) {
    const days = (Date.now() - new Date(meta.loadedAt).getTime()) / 86400000;
    return days > 35;
  }

  function renderDb() {
    const pill = $('#db-pill');
    const meta = state.meta;
    if (!meta) {
      pill.dataset.state = 'empty';
      $('#db-pill-text').textContent = 'No LEIE file loaded';
      show($('#db-card'), false);
      return;
    }
    const stale = isStale(meta);
    pill.dataset.state = stale ? 'stale' : 'ready';
    $('#db-pill-text').textContent = `LEIE loaded · ${fmtNum(meta.total)} records${stale ? ' · update due' : ''}`;
    $('#db-file').textContent = meta.fileName;
    $('#db-loaded').textContent = fmtDateTime(meta.loadedAt);
    $('#db-latest').textContent = C.formatDate(meta.latestExclusion) || '—';
    $('#db-total').textContent = fmtNum(meta.total);
    $('#db-ind').textContent = fmtNum(meta.individuals);
    $('#db-ent').textContent = fmtNum(meta.entities);
    const staleEl = $('#db-stale');
    staleEl.textContent = 'This LEIE file was loaded more than a month ago. The OIG publishes updates monthly — download the latest file and load it here before screening.';
    show(staleEl, stale);
    show($('#db-card'), true);
  }

  async function loadLeieFile(file) {
    setError('#leie-error', '');
    show($('#leie-progress'), true);
    $('#leie-progress-text').textContent = `Reading ${file.name}…`;
    await new Promise((r) => setTimeout(r, 30));
    try {
      const table = await readTable(file);
      $('#leie-progress-text').textContent = 'Building search index…';
      await new Promise((r) => setTimeout(r, 10));
      const records = C.buildRecords(table);
      const meta = {
        fileName: file.name,
        fileModified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
        loadedAt: new Date().toISOString(),
        ...C.summarize(records),
      };
      state.index = C.buildIndex(records);
      state.meta = meta;
      $('#leie-progress-text').textContent = 'Saving to this computer…';
      try { await idb.set('leie', { meta, records }); }
      catch { setError('#leie-error', 'The LEIE file was loaded for this session, but this browser blocked saving it. You will need to load it again next time.'); }
      renderDb();
      refreshResultsForNewDb();
    } catch (err) {
      setError('#leie-error', err.message || String(err));
    } finally {
      show($('#leie-progress'), false);
    }
  }

  function refreshResultsForNewDb() {
    show($('#single-results'), false);
    show($('#roster-results'), false);
  }

  wireDropzone($('#leie-drop'), $('#leie-file'), loadLeieFile);
  $('#leie-clear').addEventListener('click', async () => {
    if (!confirm('Remove the stored LEIE database from this computer?')) return;
    try { await idb.del('leie'); } catch { /* nothing stored */ }
    state.index = null; state.meta = null;
    renderDb();
    refreshResultsForNewDb();
  });

  function requireDb(errorId) {
    if (state.index) return true;
    setError(errorId, 'Load the LEIE database first (step 1). Download UPDATED.csv from the OIG website and open it on the "LEIE Database" tab.');
    return false;
  }

  // ------------------------------------------------------------ result rendering

  function recordCard(hit) {
    const r = hit.record;
    const loc = [r.ADDRESS, [r.CITY, r.STATE].filter(Boolean).join(', '), r.ZIP].filter(Boolean).join(' ');
    const typeDesc = C.describeExclusion(r.EXCLTYPE);
    const field = (label, v) => (v ? `<div><dt>${label}</dt><dd>${esc(v)}</dd></div>` : '');
    return `<article class="hit-card" data-level="${hit.level}">
      <header><span class="badge ${hit.level}">${esc(hit.label)}</span><h4>${esc(C.recordName(r))}</h4>
        <span class="muted">${r.LASTNAME ? 'Individual' : 'Entity'}</span></header>
      <dl>
        ${r.LASTNAME && r.BUSNAME ? field('Business', r.BUSNAME) : ''}
        ${field('Date of birth', C.formatDate(r.DOB))}
        ${field('NPI', C.normalizeNPI(r.NPI))}
        ${field('UPIN', r.UPIN)}
        ${field('General', r.GENERAL)}
        ${field('Specialty', r.SPECIALTY)}
        ${field('Address', loc)}
        ${field('Exclusion type', r.EXCLTYPE + (typeDesc ? ' — ' + typeDesc : ''))}
        ${field('Exclusion date', C.formatDate(r.EXCLDATE))}
        ${field('Reinstated', C.formatDate(r.REINDATE))}
        ${field('Waiver', [C.formatDate(r.WAIVERDATE), r.WVRSTATE].filter(Boolean).join(' · '))}
      </dl>
      <div class="why">Matched on: ${esc(hit.why.join(', '))}</div>
    </article>`;
  }

  const ICON_OK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
  const ICON_ALERT = '<svg viewBox="0 0 24 24"><path d="M12 7v6m0 4h.01"/></svg>';
  const PRINT_BTN = '<svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>';

  // ------------------------------------------------------------ single search

  let mode = 'person';
  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    $$('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    show($('.person-fields'), mode === 'person');
    show($('.business-fields'), mode === 'business');
    setError('#single-error', '');
    (mode === 'person' ? $('#q-first') : $('#q-business')).focus();
  }));

  $('#single-form').addEventListener('reset', () => { show($('#single-results'), false); setError('#single-error', ''); });

  $('#single-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setError('#single-error', '');
    if (!requireDb('#single-error')) return;
    const f = Object.fromEntries(new FormData(e.target).entries());
    let query, hits;
    if (mode === 'person') {
      query = { type: 'Individual', first: f.first.trim(), middle: f.middle.trim(), last: f.last.trim(), dob: f.dob, npi: f.npi.trim() };
      if (!query.last && !C.normalizeNPI(query.npi)) return setError('#single-error', 'Enter at least a last name (first name recommended).');
      hits = C.searchIndividual(state.index, query);
    } else {
      query = { type: 'Business / Entity', business: f.business.trim() };
      if (!C.businessKey(query.business)) return setError('#single-error', 'Enter a business or entity name.');
      hits = C.searchBusiness(state.index, query.business);
    }
    const result = { query, hits, at: new Date().toISOString(), meta: state.meta };
    state.lastSingle = result;
    renderSingle(result);
    addHistory({
      at: result.at, kind: query.type, subject: C.displayName(query) || 'NPI ' + query.npi,
      outcome: hits.length ? `${hits.length} possible match${hits.length > 1 ? 'es' : ''}` : 'No results found', flagged: hits.length > 0,
    });
  });

  function criteriaRows(q) {
    const rows = [['Search type', q.type]];
    if (q.type === 'Individual') {
      rows.push(['First name', q.first || '—'], ['Middle', q.middle || '—'], ['Last name', q.last || '—'],
        ['Date of birth', C.formatDate(q.dob) || '—'], ['NPI', q.npi || '—']);
    } else rows.push(['Business / entity name', q.business]);
    return rows;
  }

  function renderSingle(res) {
    const el = $('#single-results');
    const name = C.displayName(res.query) || 'NPI ' + res.query.npi;
    const banner = res.hits.length
      ? `<div class="result-banner hit"><div class="icon">${ICON_ALERT}</div><div>
          <h3>${res.hits.length} possible match${res.hits.length > 1 ? 'es' : ''} found</h3>
          <p>for <strong>${esc(name)}</strong>. Review each record below and verify through the OIG online search before taking action.</p></div>
          <div class="actions"><button class="btn btn-dark" data-print-single>${PRINT_BTN} Print results</button></div></div>`
      : `<div class="result-banner clear"><div class="icon">${ICON_OK}</div><div>
          <h3>No results found</h3>
          <p><strong>${esc(name)}</strong> does not appear on the LEIE file loaded ${esc(fmtDateTime(res.meta.loadedAt))}.</p></div>
          <div class="actions"><button class="btn btn-dark" data-print-single>${PRINT_BTN} Print “No results found”</button></div></div>`;
    el.innerHTML = banner + res.hits.map(recordCard).join('');
    show(el, true);
    $('[data-print-single]', el).addEventListener('click', () => printSingle(res));
  }

  // ------------------------------------------------------------ roster

  const FIELD_LABELS = { id: 'Employee ID', first: 'First name', middle: 'Middle', last: 'Last name', full: 'Full name (one column)', dob: 'Date of birth', npi: 'NPI', business: 'Business name' };

  async function loadRoster(file) {
    setError('#roster-error', '');
    show($('#roster-results'), false);
    try {
      const table = await readTable(file);
      if (table.length < 2) throw new Error('The file needs a header row and at least one employee.');
      const header = table[0].map((h, i) => String(h).trim() || `Column ${i + 1}`);
      const rows = table.slice(1);
      const map = C.detectColumns(header);
      state.roster = { fileName: file.name, header, rows, map };
      renderRosterSetup();
    } catch (err) {
      show($('#roster-setup'), false);
      setError('#roster-error', err.message || String(err));
    }
  }

  function renderRosterSetup() {
    const { header, rows, map, fileName } = state.roster;
    $('#roster-meta').textContent = `${fileName} · ${fmtNum(rows.length)} rows`;
    const opts = (sel) => '<option value="-1">— not in file —</option>' +
      header.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h)}</option>`).join('');
    $('#roster-mapping').innerHTML = Object.entries(FIELD_LABELS).map(([f, label]) =>
      `<label>${label}<select data-field="${f}">${opts(map[f])}</select></label>`).join('');
    $$('#roster-mapping select').forEach((s) => s.addEventListener('change', () => { map[s.dataset.field] = Number(s.value); }));
    const preview = rows.slice(0, 6);
    $('#roster-preview').innerHTML = `<thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${preview.map((r) => `<tr>${header.map((_, i) => `<td>${esc(i === map.dob ? C.formatDate(r[i]) || r[i] : r[i])}</td>`).join('')}</tr>`).join('')}</tbody>`;
    show($('#roster-setup'), true);
  }

  wireDropzone($('#roster-drop'), $('#roster-file'), loadRoster);

  $('#roster-run').addEventListener('click', () => {
    setError('#roster-error', '');
    if (!requireDb('#roster-error')) return;
    const { map, rows, fileName } = state.roster;
    if (map.last < 0 && map.full < 0 && map.business < 0) {
      return setError('#roster-error', 'Choose the column that holds the last name, full name, or business name.');
    }
    const results = C.screenRoster(state.index, rows, map);
    if (!results.length) return setError('#roster-error', 'No names were found in the selected columns.');
    const res = { fileName, results, at: new Date().toISOString(), meta: state.meta, counts: countRoster(results) };
    state.rosterResults = res;
    renderRoster(res);
    addHistory({
      at: res.at, kind: 'Employee list', subject: `${fileName} (${fmtNum(results.length)} screened)`,
      outcome: res.counts.flagged ? `${res.counts.flagged} with possible matches` : 'No results found', flagged: res.counts.flagged > 0,
    });
  });

  function countRoster(results) {
    const c = { screened: results.length, match: 0, possible: 0, differs: 0, clear: 0, flagged: 0 };
    for (const r of results) {
      if (!r.top) c.clear++;
      else if (HIT_LEVELS.has(r.top)) c.match++;
      else c[r.top]++;
    }
    c.flagged = c.screened - c.clear;
    return c;
  }

  function statusBadge(r) {
    if (!r.top) return '<span class="badge clear">Clear</span>';
    return `<span class="badge ${r.top}">${esc(C.LEVELS[r.top].label)}</span>`;
  }

  function renderRoster(res) {
    const el = $('#roster-results');
    const c = res.counts;
    const flagged = res.results.filter((r) => r.top);
    const banner = c.flagged
      ? `<div class="result-banner hit"><div class="icon">${ICON_ALERT}</div><div>
          <h3>${c.flagged} employee${c.flagged > 1 ? 's' : ''} need review</h3>
          <p>${fmtNum(c.screened)} screened against the LEIE. Verify each possible match through the OIG online search.</p></div>
          <div class="actions"><button class="btn btn-ghost" data-export>Export CSV</button><button class="btn btn-dark" data-print-roster>${PRINT_BTN} Print results</button></div></div>`
      : `<div class="result-banner clear"><div class="icon">${ICON_OK}</div><div>
          <h3>No results found</h3>
          <p>None of the ${fmtNum(c.screened)} employees screened appear on the LEIE file loaded ${esc(fmtDateTime(res.meta.loadedAt))}.</p></div>
          <div class="actions"><button class="btn btn-ghost" data-export>Export CSV</button><button class="btn btn-dark" data-print-roster>${PRINT_BTN} Print “No results found”</button></div></div>`;
    const tiles = `<div class="summary-tiles">
      <div class="tile"><b>${fmtNum(c.screened)}</b><span>Screened</span></div>
      <div class="tile red"><b>${fmtNum(c.match)}</b><span>Name matches</span></div>
      <div class="tile amber"><b>${fmtNum(c.possible)}</b><span>Possible</span></div>
      <div class="tile"><b>${fmtNum(c.differs)}</b><span>DOB differs</span></div>
      <div class="tile green"><b>${fmtNum(c.clear)}</b><span>Clear</span></div></div>`;
    const details = flagged.map((r) => `<div class="filter-row"><h3>${esc(C.displayName(r.query))}${r.query.id ? ` <span class="muted">· ID ${esc(r.query.id)}</span>` : ''}${r.query.dob ? ` <span class="muted">· DOB ${esc(C.formatDate(r.query.dob) || r.query.dob)}</span>` : ''}</h3></div>${r.hits.map(recordCard).join('')}`).join('');
    const table = `<div class="filter-row"><h3>All employees screened</h3>
        <label class="check"><input type="checkbox" id="only-flagged"> Show only employees needing review</label></div>
      <div class="table-wrap"><table class="data" id="roster-table"><thead><tr><th>Row</th><th>Employee ID</th><th>Name</th><th>DOB</th><th>NPI</th><th>Result</th><th>LEIE records</th></tr></thead>
      <tbody>${res.results.map((r) => `<tr data-flagged="${r.top ? 1 : 0}"><td>${r.row + 2}</td><td>${esc(r.query.id)}</td><td>${esc(C.displayName(r.query))}</td>
        <td class="nowrap">${esc(C.formatDate(r.query.dob) || r.query.dob)}</td><td>${esc(r.query.npi)}</td><td>${statusBadge(r)}</td><td>${r.hits.length || ''}</td></tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = banner + tiles + (flagged.length ? '<div class="filter-row"><h3>Records needing review</h3></div>' + details : '') + table;
    show(el, true);
    $('[data-print-roster]', el).addEventListener('click', () => printRoster(res));
    $('[data-export]', el).addEventListener('click', () => exportRoster(res));
    $('#only-flagged').addEventListener('change', (e) => {
      $$('#roster-table tbody tr').forEach((tr) => show(tr, !e.target.checked || tr.dataset.flagged === '1'));
    });
  }

  function exportRoster(res) {
    const rows = [['Row', 'Employee ID', 'First', 'Middle', 'Last', 'Business', 'DOB', 'NPI', 'Result', 'LEIE name', 'LEIE DOB', 'LEIE NPI', 'Exclusion type', 'Exclusion date', 'Matched on']];
    for (const r of res.results) {
      const q = r.query;
      const base = [r.row + 2, q.id, q.first, q.middle, q.last, q.business, C.formatDate(q.dob) || q.dob, q.npi];
      if (!r.hits.length) rows.push([...base, 'Clear']);
      for (const h of r.hits) {
        rows.push([...base, h.label, C.recordName(h.record), C.formatDate(h.record.DOB), C.normalizeNPI(h.record.NPI), h.record.EXCLTYPE, C.formatDate(h.record.EXCLDATE), h.why.join('; ')]);
      }
    }
    download(`LEIE-screening-${res.at.slice(0, 10)}.csv`, C.toCSV(rows));
  }

  $('#template-link').addEventListener('click', (e) => {
    e.preventDefault();
    download('employee-list-template.csv', C.toCSV([['Employee ID', 'First Name', 'Middle Name', 'Last Name', 'DOB', 'NPI'], ['1001', 'Jane', 'A', 'Doe', '01/31/1985', '']]));
  });

  // ------------------------------------------------------------ printing

  function reportShell(title, res, body) {
    const m = res.meta;
    return `<div class="rpt-head"><img src="lynx-ems-logo.png" alt="Lynx EMS"><div><h1>${esc(title)}</h1><p>OIG List of Excluded Individuals/Entities (LEIE)</p></div></div>
      <div class="rpt-meta">
        <div><b>Report date</b>${esc(fmtDateTime(res.at))}</div>
        <div><b>Screened by</b>${esc(screener() || '______________________')}</div>
        <div><b>LEIE file</b>${esc(m.fileName)}</div>
        <div><b>LEIE file loaded</b>${esc(fmtDateTime(m.loadedAt))}</div>
        <div><b>Most recent exclusion</b>${esc(C.formatDate(m.latestExclusion) || '—')}</div>
        <div><b>Records searched</b>${esc(fmtNum(m.total))} (${esc(fmtNum(m.individuals))} individuals, ${esc(fmtNum(m.entities))} entities)</div>
      </div>
      ${body}
      <p class="rpt-note">Source: U.S. Department of Health &amp; Human Services, Office of Inspector General, LEIE downloadable database. This search compares names (and date of birth / NPI when provided) to the LEIE file listed above.
      A name match alone does not confirm that a person or entity is excluded; possible matches must be verified with the OIG online search at exclusions.oig.hhs.gov using SSN or EIN.
      “No results found” means no record in the listed file matched the criteria on the report date.</p>
      <div class="rpt-sign"><div>Signature of person performing screening</div><div>Date</div></div>`;
  }

  function hitsTable(hits, withEmployee) {
    return `<table><thead><tr>${withEmployee ? '<th>Employee</th>' : ''}<th>Result</th><th>LEIE name</th><th>Type</th><th>DOB</th><th>NPI</th><th>General / specialty</th><th>Address</th><th>Exclusion</th><th>Excl. date</th></tr></thead><tbody>
      ${hits.map(({ h, emp }) => {
        const r = h.record;
        return `<tr>${withEmployee ? `<td>${esc(emp)}</td>` : ''}<td>${esc(h.label)}</td><td>${esc(C.recordName(r))}${r.LASTNAME && r.BUSNAME ? '<br>' + esc(r.BUSNAME) : ''}</td>
          <td>${r.LASTNAME ? 'Individual' : 'Entity'}</td><td>${esc(C.formatDate(r.DOB))}</td><td>${esc(C.normalizeNPI(r.NPI))}</td>
          <td>${esc([r.GENERAL, r.SPECIALTY].filter(Boolean).join(' / '))}</td><td>${esc([r.ADDRESS, r.CITY, r.STATE, r.ZIP].filter(Boolean).join(', '))}</td>
          <td>${esc(r.EXCLTYPE)}${C.describeExclusion(r.EXCLTYPE) ? ' — ' + esc(C.describeExclusion(r.EXCLTYPE)) : ''}</td><td>${esc(C.formatDate(r.EXCLDATE))}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function printSingle(res) {
    const crit = `<h2 class="rpt-h2">Search criteria</h2><table><tbody>${criteriaRows(res.query).map(([k, v]) => `<tr><th style="width:35%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    const outcome = res.hits.length
      ? `<div class="rpt-outcome hit"><strong>POSSIBLE MATCH${res.hits.length > 1 ? 'ES' : ''} FOUND</strong><span>${res.hits.length} LEIE record${res.hits.length > 1 ? 's' : ''} matched the search criteria. Verification required.</span></div>
         <h2 class="rpt-h2">Matching LEIE records</h2>${hitsTable(res.hits.map((h) => ({ h })), false)}`
      : `<div class="rpt-outcome clear"><strong>NO RESULTS FOUND</strong><span>No records in the LEIE matched the search criteria above.</span></div>`;
    doPrint(reportShell('LEIE Exclusion Check', res, crit + outcome));
  }

  function printRoster(res) {
    const c = res.counts;
    const summary = `<h2 class="rpt-h2">Employee list</h2><table><tbody>
      <tr><th style="width:35%">File</th><td>${esc(res.fileName)}</td></tr>
      <tr><th>Employees screened</th><td>${fmtNum(c.screened)}</td></tr>
      <tr><th>Name matches</th><td>${fmtNum(c.match)}</td></tr>
      <tr><th>Possible matches</th><td>${fmtNum(c.possible)}</td></tr>
      <tr><th>Name match, DOB differs</th><td>${fmtNum(c.differs)}</td></tr>
      <tr><th>Clear (no results found)</th><td>${fmtNum(c.clear)}</td></tr></tbody></table>`;
    const flagged = res.results.filter((r) => r.top);
    const outcome = flagged.length
      ? `<div class="rpt-outcome hit"><strong>POSSIBLE MATCHES FOUND</strong><span>${flagged.length} of ${fmtNum(c.screened)} employees matched one or more LEIE records. Verification required.</span></div>
         <h2 class="rpt-h2">Records needing review</h2>${hitsTable(flagged.flatMap((r) => r.hits.map((h) => ({ h, emp: C.displayName(r.query) + (r.query.id ? ` (ID ${r.query.id})` : '') }))), true)}`
      : `<div class="rpt-outcome clear"><strong>NO RESULTS FOUND</strong><span>None of the ${fmtNum(c.screened)} employees screened matched a record in the LEIE.</span></div>`;
    const all = `<h2 class="rpt-h2">Employees screened</h2><table><thead><tr><th>#</th><th>Employee ID</th><th>Name</th><th>DOB</th><th>Result</th></tr></thead><tbody>
      ${res.results.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.query.id)}</td><td>${esc(C.displayName(r.query))}</td><td>${esc(C.formatDate(r.query.dob) || r.query.dob)}</td><td>${r.top ? esc(C.LEVELS[r.top].label) : 'No results found'}</td></tr>`).join('')}</tbody></table>`;
    doPrint(reportShell('LEIE Employee Screening', res, summary + outcome + all));
  }

  function doPrint(html) {
    const rpt = $('#report');
    rpt.innerHTML = html;
    const img = $('img', rpt);
    const go = () => window.print();
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else go();
  }

  // ------------------------------------------------------------ history

  function addHistory(entry) {
    const list = local.get(HISTORY_KEY, []);
    list.unshift({ ...entry, by: screener(), file: state.meta && state.meta.fileName });
    local.set(HISTORY_KEY, list.slice(0, 500));
  }

  function renderHistory() {
    const list = local.get(HISTORY_KEY, []);
    show($('#history-empty'), !list.length);
    show($('#history-table').parentElement, list.length > 0);
    $('#history-table').innerHTML = `<thead><tr><th>Date</th><th>Type</th><th>Searched</th><th>Result</th><th>Screened by</th><th>LEIE file</th></tr></thead>
      <tbody>${list.map((h) => `<tr><td class="nowrap">${esc(fmtDateTime(h.at))}</td><td>${esc(h.kind)}</td><td>${esc(h.subject)}</td>
        <td><span class="badge ${h.flagged ? 'possible' : 'clear'}">${esc(h.outcome)}</span></td><td>${esc(h.by)}</td><td>${esc(h.file)}</td></tr>`).join('')}</tbody>`;
  }

  $('#history-clear').addEventListener('click', () => {
    if (!confirm('Clear the search history on this computer?')) return;
    local.set(HISTORY_KEY, []);
    renderHistory();
  });

  // ------------------------------------------------------------ start up

  $('#screener').value = local.get(SCREENER_KEY, '');
  $('#screener').addEventListener('input', (e) => local.set(SCREENER_KEY, e.target.value));
  $('#year').textContent = new Date().getFullYear();

  (async () => {
    try {
      const saved = await idb.get('leie');
      if (saved && saved.records) {
        state.meta = saved.meta;
        state.index = C.buildIndex(saved.records);
        selectTab('single');
      }
    } catch { /* storage unavailable; the file can still be loaded each session */ }
    renderDb();
  })();
})();

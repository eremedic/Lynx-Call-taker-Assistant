// Lynx EMS exclusion screening: page behavior, local storage, and printable
// reports. Everything runs in this browser. The exclusion lists (OIG LEIE and
// any state lists) are kept in IndexedDB and the search history in
// localStorage; nothing is sent over the network.
(function () {
  'use strict';
  const C = window.LeieCore;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HISTORY_KEY = 'lynx-leie-history';
  const SCREENER_KEY = 'lynx-leie-screener';

  const state = { lists: [], roster: null, rosterResults: null, lastSingle: null };

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
    if (name.endsWith('.pdf')) return pdfToTable(await window.LeiePdf.readLines(await file.arrayBuffer()));
    return C.parseCSV(await file.text());
  }

  // A PDF with a table (a header row naming the columns) becomes that table.
  // A form-style PDF for one person (Name / DOB fields) becomes a one-row table.
  function pdfToTable(lines) {
    const t = C.pdfLinesToTable(lines);
    if (t.header && t.table.length > 1) return t.table;
    const person = C.extractPersonFromLines(lines);
    if (person) return [['First Name', 'Middle Name', 'Last Name', 'DOB'], [person.first, person.middle, person.last, person.dob]];
    throw new Error('No names were found in this PDF. It needs either a table with name columns (such as First Name and Last Name) or labeled fields such as "Name" and "Date of Birth".');
  }

  function wireDropzone(zone, input, onFile) {
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
    zone.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) onFile(input.multiple ? Array.from(e.dataTransfer.files) : e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) onFile(input.multiple ? Array.from(input.files) : input.files[0]); input.value = ''; });
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

  // ------------------------------------------------------------ exclusion lists
  // Each list is stored as 'list:<id>' (its records) with a summary entry in
  // 'lists'. The OIG LEIE is the list with kind 'leie'; loading a newer LEIE
  // file replaces it, and adding a list with an existing name replaces that list.

  const LIST_FIELD_LABELS = {
    last: 'Last name', first: 'First name', middle: 'Middle', full: 'Full name (one column)', business: 'Business name',
    dob: 'Date of birth', npi: 'NPI', license: 'License number', excldate: 'Exclusion date', excltype: 'Reason / type',
    specialty: 'Provider type', address: 'Address', city: 'City', state: 'State', zip: 'ZIP',
  };
  const pending = [];
  let removeId = null;

  function isStale(list) {
    return (Date.now() - new Date(list.meta.loadedAt).getTime()) / 86400000 > 35;
  }

  function listSummary(list) {
    return { id: list.id, name: list.name, kind: list.kind, meta: list.meta };
  }

  async function saveLists() {
    await idb.set('lists', state.lists.map(listSummary));
  }

  async function addList({ name, kind, fileName, fileModified, records, loadedAt = new Date().toISOString() }) {
    const existing = state.lists.find((l) => (kind === 'leie' ? l.kind === 'leie' : l.name.toLowerCase() === name.toLowerCase()));
    const id = existing ? existing.id : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const list = {
      id, name, kind,
      meta: { fileName, fileModified, loadedAt, ...C.summarize(records) },
      index: C.buildIndex(records),
    };
    state.lists = existing ? state.lists.map((l) => (l.id === id ? list : l)) : state.lists.concat(list);
    state.lists.sort((a, b) => (a.kind === 'leie' ? -1 : b.kind === 'leie' ? 1 : a.name.localeCompare(b.name)));
    try {
      await idb.set('list:' + id, records);
      await saveLists();
    } catch {
      setError('#leie-error', `"${name}" was loaded for this session, but this browser blocked saving it. You will need to load it again next time.`);
    }
    renderDb();
    refreshResultsForNewDb();
  }

  function renderDb() {
    const pill = $('#db-pill');
    const lists = state.lists;
    if (!lists.length) {
      pill.dataset.state = 'empty';
      $('#db-pill-text').textContent = 'No exclusion lists loaded';
      show($('#lists-card'), false);
      return;
    }
    const stale = lists.filter(isStale);
    const total = lists.reduce((n, l) => n + l.meta.total, 0);
    pill.dataset.state = stale.length ? 'stale' : 'ready';
    $('#db-pill-text').textContent = `${lists.length} list${lists.length > 1 ? 's' : ''} · ${fmtNum(total)} records${stale.length ? ' · update due' : ''}`;
    $('#lists-total').textContent = `${fmtNum(total)} records in all`;
    $('#lists-table').innerHTML = `<thead><tr><th>List</th><th>File</th><th>Loaded</th><th>Records</th><th>Most recent exclusion</th><th></th></tr></thead>
      <tbody>${lists.map((l) => `<tr>
        <td><strong>${esc(l.name)}</strong>${isStale(l) ? '<br><span class="stale-tag">Update due</span>' : ''}</td>
        <td>${esc(l.meta.fileName)}</td><td class="nowrap">${esc(fmtDateTime(l.meta.loadedAt))}</td>
        <td>${fmtNum(l.meta.total)}<br><span class="muted">${fmtNum(l.meta.individuals)} individuals · ${fmtNum(l.meta.entities)} entities</span></td>
        <td>${esc(C.formatDate(l.meta.latestExclusion) || '—')}</td>
        <td><button class="btn btn-ghost btn-sm" data-remove="${esc(l.id)}" type="button">Remove</button></td></tr>`).join('')}</tbody>`;
    $$('[data-remove]').forEach((b) => b.addEventListener('click', () => askRemove(b.dataset.remove)));
    const staleEl = $('#db-stale');
    staleEl.textContent = stale.length
      ? `${stale.map((l) => l.name).join(', ')} ${stale.length > 1 ? 'were' : 'was'} loaded more than a month ago. Download the latest file${stale.length > 1 ? 's' : ''} and load ${stale.length > 1 ? 'them' : 'it'} here before screening.`
      : '';
    show(staleEl, stale.length > 0);
    show($('#lists-card'), true);
  }

  function askRemove(id) {
    const list = state.lists.find((l) => l.id === id);
    if (!list) return;
    removeId = id;
    $('#remove-confirm-text').textContent = `Remove "${list.name}" from this computer?`;
    show($('#remove-confirm'), true);
  }
  $('#remove-no').addEventListener('click', () => { removeId = null; show($('#remove-confirm'), false); });
  $('#remove-yes').addEventListener('click', async () => {
    const id = removeId;
    removeId = null;
    show($('#remove-confirm'), false);
    state.lists = state.lists.filter((l) => l.id !== id);
    try { await idb.del('list:' + id); await saveLists(); } catch { /* nothing stored */ }
    renderDb();
    refreshResultsForNewDb();
  });

  async function loadListFiles(files) {
    setError('#leie-error', '');
    const errors = [];
    show($('#leie-progress'), true);
    for (const file of files) {
      $('#leie-progress-text').textContent = `Reading ${file.name}…`;
      await new Promise((r) => setTimeout(r, 30));
      try {
        const table = await readTable(file);
        if (!table.length) throw new Error('The file is empty.');
        const fileModified = file.lastModified ? new Date(file.lastModified).toISOString() : null;
        if (C.findLeieHeader(table) >= 0) {
          $('#leie-progress-text').textContent = `Building search index for ${file.name}…`;
          await new Promise((r) => setTimeout(r, 10));
          await addList({ name: 'OIG LEIE', kind: 'leie', fileName: file.name, fileModified, records: C.buildRecords(table) });
        } else {
          pending.push({ file, fileModified, table });
        }
      } catch (err) {
        errors.push(`${file.name}: ${err.message || err}`);
      }
    }
    show($('#leie-progress'), false);
    if (errors.length) setError('#leie-error', errors.join(' '));
    if (pending.length && $('#list-setup').hidden) showNextPending();
  }

  function guessListName(fileName) {
    const base = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'State exclusion list';
  }

  function showNextPending() {
    const p = pending[0];
    if (!p) { show($('#list-setup'), false); return; }
    p.headerAt = C.findListHeader(p.table);
    const header = p.table[p.headerAt].map((h, i) => String(h).trim() || `Column ${i + 1}`);
    p.header = header;
    p.map = C.detectListColumns(header);
    const rows = p.table.length - p.headerAt - 1;
    $('#list-setup-file').textContent = p.file.name;
    $('#list-setup-meta').textContent = `${fmtNum(rows)} rows${pending.length > 1 ? ` · ${pending.length - 1} more file${pending.length > 2 ? 's' : ''} waiting` : ''}`;
    $('#list-name').value = guessListName(p.file.name);
    const opts = (sel) => '<option value="-1">— not in file —</option>' +
      header.map((h, i) => `<option value="${i}"${i === sel ? ' selected' : ''}>${esc(h)}</option>`).join('');
    $('#list-mapping').innerHTML = C.LIST_FIELDS.map((f) =>
      `<label>${LIST_FIELD_LABELS[f]}<select data-field="${f}">${opts(p.map[f])}</select></label>`).join('');
    $$('#list-mapping select').forEach((s) => s.addEventListener('change', () => { p.map[s.dataset.field] = Number(s.value); }));
    const preview = p.table.slice(p.headerAt + 1, p.headerAt + 7);
    $('#list-preview').innerHTML = `<thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${preview.map((r) => `<tr>${header.map((_, i) => `<td>${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody>`;
    setError('#list-error', '');
    show($('#list-setup'), true);
  }

  $('#list-add').addEventListener('click', async () => {
    const p = pending[0];
    const name = $('#list-name').value.trim();
    if (!name) return setError('#list-error', 'Enter a name for this list, for example "Texas Medicaid Exclusions".');
    if (name.toLowerCase() === 'oig leie') return setError('#list-error', 'That name is used by the OIG LEIE. Choose another name.');
    if (p.map.last < 0 && p.map.full < 0 && p.map.business < 0) {
      return setError('#list-error', 'Choose the column that holds the last name, full name, or business name.');
    }
    if (p.map.last >= 0 && p.map.first < 0) return setError('#list-error', 'Choose the first-name column too, so names can be matched exactly.');
    try {
      const records = C.buildListRecords(p.table, p.headerAt, p.map);
      await addList({ name, kind: 'state', fileName: p.file.name, fileModified: p.fileModified, records });
      pending.shift();
      showNextPending();
    } catch (err) {
      setError('#list-error', err.message || String(err));
    }
  });
  $('#list-skip').addEventListener('click', () => { pending.shift(); showNextPending(); });

  function refreshResultsForNewDb() {
    show($('#single-results'), false);
    show($('#roster-results'), false);
  }

  wireDropzone($('#leie-drop'), $('#leie-file'), loadListFiles);

  function requireDb(errorId) {
    if (state.lists.length) return true;
    setError(errorId, 'Load at least one exclusion list first. Open the OIG LEIE file (UPDATED.csv) or a state exclusion list on the "Exclusion Lists" tab.');
    return false;
  }

  // Runs a search against every loaded list.
  function searchAll(fn) {
    return state.lists.flatMap((l) => fn(l.index).map((h) => ({ ...h, list: l.name, key: l.id + ':' + h.index })));
  }

  // A snapshot of the lists searched, kept with each result for its report.
  const listsSnapshot = () => state.lists.map((l) => ({ name: l.name, ...l.meta }));

  // ------------------------------------------------------------ result rendering

  const kindLabel = (r) => ({ I: 'Individual', E: 'Entity' }[r.KIND] || '');

  function recordCard(hit) {
    const r = hit.record;
    const loc = [r.ADDRESS, [r.CITY, r.STATE].filter(Boolean).join(', '), r.ZIP].filter(Boolean).join(' ');
    const typeDesc = C.describeExclusion(r.EXCLTYPE);
    const field = (label, v) => (v ? `<div><dt>${label}</dt><dd>${esc(v)}</dd></div>` : '');
    return `<article class="hit-card" data-level="${hit.level}">
      <header><span class="badge ${hit.level}">${esc(hit.label)}</span><h4>${esc(C.recordName(r))}</h4>
        <span class="muted">${kindLabel(r)}</span><span class="list-tag">${esc(hit.list)}</span></header>
      <dl>
        ${r.BUSNAME && C.recordName(r) !== r.BUSNAME ? field('Business', r.BUSNAME) : ''}
        ${field('Date of birth', C.formatDate(r.DOB))}
        ${field('NPI', C.normalizeNPI(r.NPI))}
        ${field('License', r.LICENSE)}
        ${field('UPIN', r.UPIN)}
        ${field('General', r.GENERAL)}
        ${field(hit.list === 'OIG LEIE' ? 'Specialty' : 'Provider type', r.SPECIALTY)}
        ${field('Address', loc)}
        ${field('Exclusion type', r.EXCLTYPE + (typeDesc ? ' — ' + typeDesc : ''))}
        ${field('Exclusion date', C.formatDate(r.EXCLDATE) || r.EXCLDATE)}
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

  $('#single-form').addEventListener('reset', () => { show($('#single-results'), false); setError('#single-error', ''); show($('#single-pdf-note'), false); });

  // Reads first name, last name, and date of birth from a PDF and fills the form.
  $('#single-pdf').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('#single-error', '');
    show($('#single-pdf-note'), false);
    try {
      const lines = await window.LeiePdf.readLines(await file.arrayBuffer());
      // A table of people (header row + rows) is read as a table; otherwise
      // look for labeled fields such as "Name" and "Date of Birth".
      let person = null;
      let others = 0;
      const t = C.pdfLinesToTable(lines);
      if (t.header) {
        const map = C.detectColumns(t.table[0]);
        const people = t.table.slice(1).map((row) => C.rowToQuery(row, map)).filter((q) => q && q.first && q.last);
        person = people[0] || null;
        others = Math.max(0, people.length - 1);
      }
      if (!person) person = C.extractPersonFromLines(lines);
      if (!person) throw new Error(`No first name, last name, or date of birth was found in ${file.name}. Type the name in instead.`);
      if (mode !== 'person') $('.seg-btn[data-mode="person"]').click();
      const form = $('#single-form');
      form.first.value = person.first;
      form.middle.value = person.middle || '';
      form.last.value = person.last;
      const dob = C.normalizeDate(person.dob);
      form.dob.value = dob ? `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}` : '';
      show($('#single-results'), false);
      const note = $('#single-pdf-note');
      note.textContent = `Filled from ${file.name}: ${[person.first, person.middle, person.last].filter(Boolean).join(' ')}` +
        `${dob ? ', DOB ' + C.formatDate(dob) : ', no date of birth found'}. Check the fields, then select Search all lists.` +
        (others ? ` This PDF lists ${others} more ${others > 1 ? 'people' : 'person'}; use Employee List Screening to check everyone in it.` : '');
      show(note, true);
      $('#single-form button[type="submit"]').focus();
    } catch (err) {
      setError('#single-error', err.message || String(err));
    }
  });

  $('#single-form').addEventListener('submit', (e) => {
    e.preventDefault();
    setError('#single-error', '');
    if (!requireDb('#single-error')) return;
    const f = Object.fromEntries(new FormData(e.target).entries());
    let query, hits;
    if (mode === 'person') {
      query = { type: 'Individual', first: f.first.trim(), middle: f.middle.trim(), last: f.last.trim(), dob: f.dob, npi: f.npi.trim() };
      if (!(C.compact(query.first) && C.compact(query.last)) && !C.normalizeNPI(query.npi)) return setError('#single-error', 'Enter both a first and last name (or an NPI).');
      hits = searchAll((index) => C.searchIndividual(index, query));
    } else {
      query = { type: 'Business / Entity', business: f.business.trim() };
      if (!C.compact(query.business)) return setError('#single-error', 'Enter a business or entity name.');
      hits = searchAll((index) => C.searchBusiness(index, query.business));
    }
    const result = { query, hits, at: new Date().toISOString(), lists: listsSnapshot() };
    state.lastSingle = result;
    renderSingle(result);
    addHistory({
      at: result.at, kind: query.type, subject: C.displayName(query) || 'NPI ' + query.npi,
      outcome: hits.length ? `${hits.length} match${hits.length > 1 ? 'es' : ''} found` : 'No results found', flagged: hits.length > 0,
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

  const listNames = (res) => res.lists.map((l) => l.name).join(', ');

  function renderSingle(res) {
    const el = $('#single-results');
    const name = C.displayName(res.query) || 'NPI ' + res.query.npi;
    const banner = res.hits.length
      ? `<div class="result-banner hit"><div class="icon">${ICON_ALERT}</div><div>
          <h3>${res.hits.length} match${res.hits.length > 1 ? 'es' : ''} found</h3>
          <p>for <strong>${esc(name)}</strong> in ${esc([...new Set(res.hits.map((h) => h.list))].join(', '))}. Review each record below and verify it with the agency that publishes the list before taking action.</p></div>
          <div class="actions"><button class="btn btn-dark" data-print-single>${PRINT_BTN} Print results</button></div></div>`
      : `<div class="result-banner clear"><div class="icon">${ICON_OK}</div><div>
          <h3>No results found</h3>
          <p><strong>${esc(name)}</strong> does not appear on any of the ${res.lists.length} list${res.lists.length > 1 ? 's' : ''} searched: ${esc(listNames(res))}.</p></div>
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
    const results = C.screenRoster(state.lists, rows, map);
    if (!results.length) return setError('#roster-error', 'No names were found in the selected columns.');
    const res = { fileName, results, at: new Date().toISOString(), lists: listsSnapshot(), counts: countRoster(results) };
    state.rosterResults = res;
    renderRoster(res);
    addHistory({
      at: res.at, kind: 'Employee list', subject: `${fileName} (${fmtNum(results.length)} screened)`,
      outcome: res.counts.flagged ? `${res.counts.flagged} with matches` : 'No results found', flagged: res.counts.flagged > 0,
    });
  });

  function countRoster(results) {
    const c = { screened: results.length, match: 0, incomplete: 0, clear: 0, flagged: 0 };
    for (const r of results) {
      if (r.top) c.match++;
      else if (r.incomplete) c.incomplete++;
      else c.clear++;
    }
    c.flagged = c.match;
    return c;
  }

  function statusBadge(r) {
    if (!r.top && r.incomplete) return '<span class="badge warn">Not checked – first name missing</span>';
    if (!r.top) return '<span class="badge clear">No results found</span>';
    return `<span class="badge ${r.top}">${esc(C.LEVELS[r.top].label)}</span>`;
  }

  function renderRoster(res) {
    const el = $('#roster-results');
    const c = res.counts;
    const flagged = res.results.filter((r) => r.top);
    const banner = c.flagged
      ? `<div class="result-banner hit"><div class="icon">${ICON_ALERT}</div><div>
          <h3>${c.flagged} employee${c.flagged > 1 ? 's' : ''} matched an exclusion list</h3>
          <p>${fmtNum(c.screened)} screened against ${esc(listNames(res))}. Verify each match with the agency that publishes the list.</p></div>
          <div class="actions"><button class="btn btn-ghost" data-export>Export CSV</button><button class="btn btn-dark" data-print-roster>${PRINT_BTN} Print results</button></div></div>`
      : `<div class="result-banner clear"><div class="icon">${ICON_OK}</div><div>
          <h3>No results found</h3>
          <p>None of the ${fmtNum(c.screened - c.incomplete)} employees checked appear on ${esc(listNames(res))}.${c.incomplete ? ` ${c.incomplete} row${c.incomplete > 1 ? 's were' : ' was'} not checked because the first name is missing.` : ''}</p></div>
          <div class="actions"><button class="btn btn-ghost" data-export>Export CSV</button><button class="btn btn-dark" data-print-roster>${PRINT_BTN} Print “No results found”</button></div></div>`;
    const tiles = `<div class="summary-tiles">
      <div class="tile"><b>${fmtNum(c.screened)}</b><span>Screened</span></div>
      <div class="tile red"><b>${fmtNum(c.match)}</b><span>Matches</span></div>
      ${c.incomplete ? `<div class="tile amber"><b>${fmtNum(c.incomplete)}</b><span>Not checked</span></div>` : ''}
      <div class="tile green"><b>${fmtNum(c.clear)}</b><span>No results found</span></div></div>`;
    const details = flagged.map((r) => `<div class="filter-row"><h3>${esc(C.displayName(r.query))}${r.query.id ? ` <span class="muted">· ID ${esc(r.query.id)}</span>` : ''}${r.query.dob ? ` <span class="muted">· DOB ${esc(C.formatDate(r.query.dob) || r.query.dob)}</span>` : ''}</h3></div>${r.hits.map(recordCard).join('')}`).join('');
    const table = `<div class="filter-row"><h3>All employees screened</h3>
        <label class="check"><input type="checkbox" id="only-flagged"> Show only matches and rows not checked</label></div>
      <div class="table-wrap"><table class="data" id="roster-table"><thead><tr><th>Row</th><th>Employee ID</th><th>Name</th><th>DOB</th><th>NPI</th><th>Result</th><th>Lists matched</th></tr></thead>
      <tbody>${res.results.map((r) => `<tr data-flagged="${r.top || r.incomplete ? 1 : 0}"><td>${r.row + 2}</td><td>${esc(r.query.id)}</td><td>${esc(C.displayName(r.query))}</td>
        <td class="nowrap">${esc(C.formatDate(r.query.dob) || r.query.dob)}</td><td>${esc(r.query.npi)}</td><td>${statusBadge(r)}</td><td>${esc([...new Set(r.hits.map((h) => h.list))].join(', '))}</td></tr>`).join('')}</tbody></table></div>`;
    el.innerHTML = banner + tiles + (flagged.length ? '<div class="filter-row"><h3>Records needing review</h3></div>' + details : '') + table;
    show(el, true);
    $('[data-print-roster]', el).addEventListener('click', () => printRoster(res));
    $('[data-export]', el).addEventListener('click', () => exportRoster(res));
    $('#only-flagged').addEventListener('change', (e) => {
      $$('#roster-table tbody tr').forEach((tr) => show(tr, !e.target.checked || tr.dataset.flagged === '1'));
    });
  }

  function exportRoster(res) {
    const rows = [['Row', 'Employee ID', 'First', 'Middle', 'Last', 'Business', 'DOB', 'NPI', 'Result', 'List', 'Listed name', 'Listed DOB', 'Listed NPI', 'Exclusion type', 'Exclusion date', 'Matched on']];
    for (const r of res.results) {
      const q = r.query;
      const base = [r.row + 2, q.id, q.first, q.middle, q.last, q.business, C.formatDate(q.dob) || q.dob, q.npi];
      if (!r.hits.length) rows.push([...base, r.incomplete ? 'Not checked - first name missing' : 'No results found']);
      for (const h of r.hits) {
        rows.push([...base, h.label, h.list, C.recordName(h.record), C.formatDate(h.record.DOB), C.normalizeNPI(h.record.NPI), h.record.EXCLTYPE, C.formatDate(h.record.EXCLDATE) || h.record.EXCLDATE, h.why.join('; ')]);
      }
    }
    download(`exclusion-screening-${res.at.slice(0, 10)}.csv`, C.toCSV(rows));
  }

  $('#template-link').addEventListener('click', (e) => {
    e.preventDefault();
    download('employee-list-template.csv', C.toCSV([['Employee ID', 'First Name', 'Middle Name', 'Last Name', 'DOB', 'NPI'], ['1001', 'Jane', 'A', 'Doe', '01/31/1985', '']]));
  });

  // ------------------------------------------------------------ printing

  function reportShell(title, res, body) {
    return `<div class="rpt-head"><img src="lynx-ems-logo.png" alt="Lynx EMS"><div><h1>${esc(title)}</h1><p>OIG LEIE and state exclusion lists</p></div></div>
      <div class="rpt-meta">
        <div><b>Report date</b>${esc(fmtDateTime(res.at))}</div>
        <div><b>Screened by</b>${esc(screener() || '______________________')}</div>
      </div>
      <h2 class="rpt-h2">Exclusion lists searched</h2>
      <table><thead><tr><th>List</th><th>File</th><th>Loaded</th><th>Records</th><th>Most recent exclusion</th></tr></thead><tbody>
        ${res.lists.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.fileName)}</td><td>${esc(fmtDateTime(l.loadedAt))}</td><td>${esc(fmtNum(l.total))}</td><td>${esc(C.formatDate(l.latestExclusion) || '—')}</td></tr>`).join('')}
      </tbody></table>
      ${body}
      <p class="rpt-note">This search compares names exactly as written (and date of birth / NPI when provided) to the exclusion list files listed above. The OIG LEIE is published by the U.S. Department of Health &amp; Human Services, Office of Inspector General; state lists are published by the state agencies named.
      A name match alone does not confirm that a person or entity is excluded; verify each match with the agency that publishes the list (for the LEIE, the OIG online search at exclusions.oig.hhs.gov using SSN or EIN).
      “No results found” means no record in any of the listed files matched the criteria on the report date.</p>
      <div class="rpt-sign"><div>Signature of person performing screening</div><div>Date</div></div>`;
  }

  function hitsTable(hits, withEmployee) {
    return `<table><thead><tr>${withEmployee ? '<th>Employee</th>' : ''}<th>Result</th><th>List</th><th>Listed name</th><th>Type</th><th>DOB</th><th>NPI</th><th>General / specialty</th><th>Address</th><th>Exclusion</th><th>Excl. date</th></tr></thead><tbody>
      ${hits.map(({ h, emp }) => {
        const r = h.record;
        return `<tr>${withEmployee ? `<td>${esc(emp)}</td>` : ''}<td>${esc(h.label)}</td><td>${esc(h.list)}</td><td>${esc(C.recordName(r))}${r.BUSNAME && C.recordName(r) !== r.BUSNAME ? '<br>' + esc(r.BUSNAME) : ''}${r.LICENSE ? '<br>License ' + esc(r.LICENSE) : ''}</td>
          <td>${kindLabel(r)}</td><td>${esc(C.formatDate(r.DOB))}</td><td>${esc(C.normalizeNPI(r.NPI))}</td>
          <td>${esc([r.GENERAL, r.SPECIALTY].filter(Boolean).join(' / '))}</td><td>${esc([r.ADDRESS, r.CITY, r.STATE, r.ZIP].filter(Boolean).join(', '))}</td>
          <td>${esc(r.EXCLTYPE)}${C.describeExclusion(r.EXCLTYPE) ? ' — ' + esc(C.describeExclusion(r.EXCLTYPE)) : ''}</td><td>${esc(C.formatDate(r.EXCLDATE) || r.EXCLDATE)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function printSingle(res) {
    const crit = `<h2 class="rpt-h2">Search criteria</h2><table><tbody>${criteriaRows(res.query).map(([k, v]) => `<tr><th style="width:35%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
    const outcome = res.hits.length
      ? `<div class="rpt-outcome hit"><strong>MATCH${res.hits.length > 1 ? 'ES' : ''} FOUND</strong><span>${res.hits.length} record${res.hits.length > 1 ? 's' : ''} on the exclusion lists matched the search criteria. Verification required.</span></div>
         <h2 class="rpt-h2">Matching records</h2>${hitsTable(res.hits.map((h) => ({ h })), false)}`
      : `<div class="rpt-outcome clear"><strong>NO RESULTS FOUND</strong><span>No records in any of the exclusion lists searched matched the search criteria above.</span></div>`;
    doPrint(reportShell('Exclusion Check', res, crit + outcome));
  }

  function printRoster(res) {
    const c = res.counts;
    const summary = `<h2 class="rpt-h2">Employee list</h2><table><tbody>
      <tr><th style="width:35%">File</th><td>${esc(res.fileName)}</td></tr>
      <tr><th>Employees screened</th><td>${fmtNum(c.screened)}</td></tr>
      <tr><th>Matches</th><td>${fmtNum(c.match)}</td></tr>
      ${c.incomplete ? `<tr><th>Not checked (first name missing)</th><td>${fmtNum(c.incomplete)}</td></tr>` : ''}
      <tr><th>Clear (no results found)</th><td>${fmtNum(c.clear)}</td></tr></tbody></table>`;
    const flagged = res.results.filter((r) => r.top);
    const outcome = flagged.length
      ? `<div class="rpt-outcome hit"><strong>MATCHES FOUND</strong><span>${flagged.length} of ${fmtNum(c.screened)} employees matched one or more exclusion list records. Verification required.</span></div>
         <h2 class="rpt-h2">Records needing review</h2>${hitsTable(flagged.flatMap((r) => r.hits.map((h) => ({ h, emp: C.displayName(r.query) + (r.query.id ? ` (ID ${r.query.id})` : '') }))), true)}`
      : `<div class="rpt-outcome clear"><strong>NO RESULTS FOUND</strong><span>None of the ${fmtNum(c.screened - c.incomplete)} employees checked matched a record in any exclusion list searched.${c.incomplete ? ` ${c.incomplete} not checked (first name missing).` : ''}</span></div>`;
    const all = `<h2 class="rpt-h2">Employees screened</h2><table><thead><tr><th>#</th><th>Employee ID</th><th>Name</th><th>DOB</th><th>Result</th></tr></thead><tbody>
      ${res.results.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.query.id)}</td><td>${esc(C.displayName(r.query))}</td><td>${esc(C.formatDate(r.query.dob) || r.query.dob)}</td><td>${r.top ? esc(C.LEVELS[r.top].label) : r.incomplete ? 'Not checked – first name missing' : 'No results found'}</td></tr>`).join('')}</tbody></table>`;
    doPrint(reportShell('Employee Exclusion Screening', res, summary + outcome + all));
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
    list.unshift({ ...entry, by: screener(), file: state.lists.map((l) => l.name).join(', ') });
    local.set(HISTORY_KEY, list.slice(0, 500));
  }

  function renderHistory() {
    const list = local.get(HISTORY_KEY, []);
    show($('#history-empty'), !list.length);
    show($('#history-table').parentElement, list.length > 0);
    $('#history-table').innerHTML = `<thead><tr><th>Date</th><th>Type</th><th>Searched</th><th>Result</th><th>Screened by</th><th>Lists searched</th></tr></thead>
      <tbody>${list.map((h) => `<tr><td class="nowrap">${esc(fmtDateTime(h.at))}</td><td>${esc(h.kind)}</td><td>${esc(h.subject)}</td>
        <td><span class="badge ${h.flagged ? 'warn' : 'clear'}">${esc(h.outcome)}</span></td><td>${esc(h.by)}</td><td>${esc(h.file)}</td></tr>`).join('')}</tbody>`;
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
      const summaries = (await idb.get('lists')) || [];
      for (const sum of summaries) {
        const records = await idb.get('list:' + sum.id);
        if (records) state.lists.push({ ...sum, index: C.buildIndex(records) });
      }
      // Earlier versions stored only the LEIE, under 'leie'.
      const old = await idb.get('leie');
      if (old && old.records) {
        if (!state.lists.some((l) => l.kind === 'leie')) {
          await addList({ name: 'OIG LEIE', kind: 'leie', fileName: old.meta.fileName, fileModified: old.meta.fileModified, loadedAt: old.meta.loadedAt, records: old.records });
        }
        await idb.del('leie');
      }
      if (state.lists.length) selectTab('single');
    } catch { /* storage unavailable; the file can still be loaded each session */ }
    renderDb();
  })();
})();

// Admin → Import payers / facilities from another system's export.
// Reads CSV/TSV and Excel (.xlsx) files in the browser, matches the file's
// columns to Patient Intake fields (guessing from the column names), previews
// every row with the server's verdict, then imports.
import { api, esc, toast } from './common.js';

const $ = (sel) => document.querySelector(sel);

// ------------------------------------------------------------- the fields
const IMPORTS = {
  facilities: {
    title: 'Import facilities',
    noun: 'facility',
    endpoint: '/api/admin/import/facilities',
    fields: [
      { key: 'name', label: 'Facility name', required: true, guess: ['facility name', 'facility', 'name', 'location name', 'location', 'site name', 'site', 'account name'] },
      { key: 'external_id', label: 'ID in the other system', guess: ['facility id', 'location id', 'site id', 'id', 'external id', 'account number', 'code', 'facility code'] },
      { key: 'address', label: 'Street address', guess: ['address', 'address 1', 'address1', 'street', 'street address', 'addr', 'address line 1'] },
      { key: 'address2', label: 'Address line 2', guess: ['address 2', 'address2', 'address line 2', 'suite', 'unit', 'apt'] },
      { key: 'city', label: 'City', guess: ['city', 'town'] },
      { key: 'state', label: 'State', guess: ['state', 'st', 'province'] },
      { key: 'zip', label: 'ZIP', guess: ['zip', 'zip code', 'zipcode', 'postal', 'postal code'] },
      { key: 'phone', label: 'Phone (call back)', guess: ['phone', 'phone number', 'telephone', 'main phone', 'callback', 'call back', 'tel'] },
      { key: 'contact_name', label: 'Caller / contact name', guess: ['contact', 'contact name', 'caller', 'caller name', 'primary contact'] },
      { key: 'contact_email', label: 'Caller / contact email', guess: ['email', 'e-mail', 'email address', 'contact email'] },
    ],
    // Street, line 2, city, state and ZIP become one address.
    toRow: (v) => ({
      name: v.name, external_id: v.external_id, phone: v.phone, contact_name: v.contact_name, contact_email: v.contact_email,
      address: [[v.address, v.address2].filter(Boolean).join(' '), v.city, [v.state, v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    }),
    template: [['Facility ID', 'Facility Name', 'Address', 'City', 'State', 'Zip', 'Phone', 'Contact Name', 'Contact Email'],
      ['F-100', 'Sunrise Skilled Nursing', '12 Oak St', 'Springfield', 'IL', '62701', '217-555-0100', 'Nurse Joy', 'joy@sunrise.example']],
  },
  payers: {
    title: 'Import payers & brokers',
    noun: 'payer',
    endpoint: '/api/admin/import/payers',
    fields: [
      { key: 'name', label: 'Payer name', required: true, guess: ['payer name', 'payor name', 'insurance name', 'insurance', 'carrier', 'carrier name', 'payer', 'payor', 'plan name', 'name'] },
      { key: 'external_id', label: 'ID in the other system', guess: ['payer id', 'payor id', 'insurance id', 'carrier id', 'id', 'external id', 'code', 'payer code'] },
      { key: 'type', label: 'Type (a value containing “broker” makes it a broker)', guess: ['type', 'payer type', 'payor type', 'category', 'class', 'financial class', 'kind'] },
      { key: 'parent', label: 'Broker’s payer program', guess: ['parent', 'parent payer', 'program', 'payer program', 'books for'] },
      { key: 'contact_phone', label: 'Phone', guess: ['phone', 'phone number', 'telephone', 'authorization phone', 'auth phone'] },
      { key: 'contact_fax', label: 'Fax', guess: ['fax', 'fax number'] },
      { key: 'contact_email', label: 'Email', guess: ['email', 'e-mail', 'email address'] },
      { key: 'contact_url', label: 'Portal / website', guess: ['website', 'web site', 'url', 'portal', 'portal url', 'web'] },
      { key: 'contact_name', label: 'Contact name / department', guess: ['contact', 'contact name', 'department'] },
      { key: 'description', label: 'Notes', guess: ['notes', 'note', 'description', 'comments'] },
    ],
    toRow: (v) => v,
    template: [['Payer ID', 'Payer Name', 'Type', 'Parent', 'Phone', 'Fax', 'Email', 'Website', 'Notes'],
      ['P-9', 'Blue Valley Health Plan', 'Commercial', '', '800-555-0100', '800-555-0199', 'auth@bluevalley.example', 'bluevalley.example.com', ''],
      ['B-1', 'MetroRide NEMT', 'Broker', 'Blue Valley Health Plan', '800-555-0300', '', '', '', 'Books Medicaid trips']],
  },
};

// ------------------------------------------------------------- file reading
// CSV with quotes, commas or tabs or semicolons; a leading byte-order mark is ignored.
export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', '\t', ';'].reduce((best, d) => (first.split(d).length > first.split(best).length ? d : best), ',');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

// A small .xlsx reader: the first worksheet, as rows of text. An .xlsx file is
// a zip of XML files; the browser unzips it with DecompressionStream.
export async function parseXlsx(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let end = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This isn’t a readable Excel (.xlsx) file. Save it as .xlsx or CSV and try again.');
  const files = new Map();
  let p = dv.getUint32(end + 16, true);
  for (let n = dv.getUint16(end + 10, true); n > 0 && dv.getUint32(p, true) === 0x02014b50; n--) {
    const nameLen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true) });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.offset + 30 + dv.getUint16(f.offset + 26, true) + dv.getUint16(f.offset + 28, true);
    const data = u8.subarray(start, start + f.size);
    if (f.method === 0) return new TextDecoder().decode(data);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
  const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const strings = [];
  const ss = await read('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) strings.push([...si.getElementsByTagName('t')].map((t) => t.textContent).join(''));
  const sheetName = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))[0];
  if (!sheetName) throw new Error('The Excel file has no worksheet.');
  const sheet = xml(await read(sheetName));
  const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const r of sheet.getElementsByTagName('row')) {
    const row = [];
    for (const c of r.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      const value = type === 's' ? strings[Number(v)] ?? ''
        : type === 'inlineStr' ? [...c.getElementsByTagName('t')].map((t) => t.textContent).join('')
          : type === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v;
      row[c.getAttribute('r') ? colIndex(c.getAttribute('r')) : row.length] = value;
    }
    rows.push(Array.from(row, (v) => v ?? ''));
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

async function readFile(file) {
  if (/\.xlsx$/i.test(file.name)) return parseXlsx(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files can’t be read. In Excel, choose File → Save As → Excel Workbook (.xlsx) or CSV.');
  return parseCsv(await file.text());
}

// Guess which column holds each field from the column names.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function guessMapping(headers, fields) {
  const used = new Set();
  const mapping = {};
  for (const pass of ['exact', 'contains']) {
    for (const f of fields) {
      if (mapping[f.key] !== undefined) continue;
      const i = headers.findIndex((h, idx) => !used.has(idx) && f.guess.some((g) => (pass === 'exact' ? norm(h) === g : norm(h).includes(g))));
      if (i >= 0) { mapping[f.key] = i; used.add(i); }
    }
  }
  return mapping;
}

// ------------------------------------------------------------------- dialog
const imp = { kind: null, fileName: '', headers: [], data: [], mapping: {}, preview: null, onDone: null, seq: 0 };

export function openImport(kind, { onDone } = {}) {
  const cfg = IMPORTS[kind];
  Object.assign(imp, { kind, fileName: '', headers: [], data: [], mapping: {}, preview: null, onDone });
  $('#import-title').textContent = cfg.title;
  $('#import-file').value = '';
  $('#import-step-map').hidden = true;
  $('#import-error').hidden = true;
  $('#import-run').disabled = true;
  $('#import-run').textContent = 'Import';
  $('#import-update').checked = true;
  $('#import-intro').innerHTML = `Export the list from your other system (dispatch, billing or scheduling software such as TraumaSoft) as <strong>CSV</strong> or <strong>Excel (.xlsx)</strong>, with column names in the first row. Nothing is saved until you click Import. <a href="#" data-import-template>Download a sample file</a>.`;
  $('#import-modal').hidden = false;
}

function rowsForServer() {
  const cfg = IMPORTS[imp.kind];
  return imp.data.map((r) => {
    const values = {};
    for (const f of cfg.fields) values[f.key] = imp.mapping[f.key] === undefined ? '' : String(r[imp.mapping[f.key]] ?? '').trim();
    return cfg.toRow(values);
  });
}

function renderMapping() {
  const cfg = IMPORTS[imp.kind];
  $('#import-file-name').textContent = `${imp.fileName}: ${imp.data.length.toLocaleString()} row${imp.data.length === 1 ? '' : 's'}, ${imp.headers.length} columns`;
  $('#import-mapping').innerHTML = cfg.fields.map((f) => `
    <label class="import-map-row">
      <span>${esc(f.label)}${f.required ? ' <strong class="req">*</strong>' : ''}</span>
      <select class="select" data-map="${f.key}">
        <option value="">— not in the file —</option>
        ${imp.headers.map((h, i) => `<option value="${i}" ${imp.mapping[f.key] === i ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}${imp.data[0]?.[i] ? ` (e.g. ${esc(String(imp.data[0][i]).slice(0, 30))})` : ''}</option>`).join('')}
      </select>
    </label>`).join('');
}

const ACTION_LABEL = { create: ['New', 'chip-green'], update: ['Update', 'chip-blue'], unchanged: ['No change', ''], skip: ['Skip', ''], error: ['Problem', 'chip-red'] };

async function refreshPreview() {
  const cfg = IMPORTS[imp.kind];
  const seq = ++imp.seq;
  if (imp.mapping.name === undefined) {
    $('#import-summary').innerHTML = `<span class="small" style="color: var(--red-600)">Choose the column that holds the ${cfg.noun} name.</span>`;
    $('#import-preview').innerHTML = '';
    $('#import-run').disabled = true;
    return;
  }
  $('#import-summary').textContent = 'Checking rows…';
  let result;
  try {
    result = await api(cfg.endpoint, { method: 'POST', body: { rows: rowsForServer(), update: $('#import-update').checked, dryRun: true, rowOffset: 1 } });
  } catch (err) {
    if (seq !== imp.seq) return;
    $('#import-summary').innerHTML = `<span style="color: var(--red-600)">${esc(err.message)}</span>`;
    $('#import-run').disabled = true;
    return;
  }
  if (seq !== imp.seq) return; // a newer check is running
  imp.preview = result;
  const s = result.summary;
  const parts = [[s.create, 'new'], [s.update, 'to update'], [s.unchanged, 'unchanged'], [s.skip, 'skipped'], [s.error, 'with problems']]
    .filter(([n]) => n).map(([n, label]) => `<strong>${n.toLocaleString()}</strong> ${label}`);
  $('#import-summary').innerHTML = parts.join(' · ') || 'No rows.';
  const shown = result.results.slice(0, 200);
  $('#import-preview').innerHTML = `
    <table class="table import-table">
      <thead><tr><th>Row</th><th></th><th>${esc(cfg.noun[0].toUpperCase() + cfg.noun.slice(1))}</th><th>Details</th></tr></thead>
      <tbody>${shown.map((r) => {
        const [label, chip] = ACTION_LABEL[r.action] || [r.action, ''];
        return `<tr class="import-${esc(r.action)}"><td class="nowrap">${r.row}</td><td><span class="chip ${chip}">${esc(label)}</span>${r.kind === 'broker' ? ' <span class="chip">Broker</span>' : ''}</td>
          <td>${esc(r.name || '—')}</td><td class="small">${esc(r.error || r.note || '')}${r.warning ? `<div class="import-warning">⚠ ${esc(r.warning)}</div>` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table>
    ${result.results.length > shown.length ? `<p class="small muted">Showing the first ${shown.length} of ${result.results.length.toLocaleString()} rows.</p>` : ''}`;
  const n = s.create + s.update;
  $('#import-run').disabled = n === 0;
  $('#import-run').textContent = n ? `Import ${n.toLocaleString()} ${cfg.noun === 'facility' ? (n === 1 ? 'facility' : 'facilities') : (n === 1 ? 'payer' : 'payers')}` : 'Nothing to import';
}

async function runImport() {
  const cfg = IMPORTS[imp.kind];
  const btn = $('#import-run');
  btn.disabled = true;
  btn.textContent = 'Importing…';
  try {
    const result = await api(cfg.endpoint, { method: 'POST', body: { rows: rowsForServer(), update: $('#import-update').checked, dryRun: false, fileName: imp.fileName, rowOffset: 1 } });
    const s = result.summary;
    $('#import-modal').hidden = true;
    toast(`Imported: ${s.create} new, ${s.update} updated${s.error ? `, ${s.error} with problems skipped` : ''}.`, 'success');
    imp.onDone?.();
  } catch (err) {
    $('#import-error').textContent = err.message;
    $('#import-error').hidden = false;
    btn.disabled = false;
    btn.textContent = 'Try again';
  }
}

function downloadTemplate() {
  const cfg = IMPORTS[imp.kind];
  const csv = cfg.template.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `patient-intake-${imp.kind}-sample.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function loadFile(file) {
  if (!file) return;
  $('#import-error').hidden = true;
  let rows;
  try {
    rows = await readFile(file);
  } catch (err) {
    $('#import-error').textContent = err.message;
    $('#import-error').hidden = false;
    return;
  }
  if (rows.length < 2) {
    $('#import-error').textContent = 'The file needs a row of column names and at least one row of data.';
    $('#import-error').hidden = false;
    return;
  }
  imp.fileName = file.name;
  imp.headers = rows[0].map((h) => String(h).trim());
  imp.data = rows.slice(1);
  imp.mapping = guessMapping(imp.headers, IMPORTS[imp.kind].fields);
  $('#import-step-map').hidden = false;
  renderMapping();
  refreshPreview();
}

export function bindImport() {
  $('#import-file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  const drop = $('#import-drop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    loadFile(e.dataTransfer.files[0]);
  });
  $('#import-mapping').addEventListener('change', (e) => {
    const sel = e.target.closest('[data-map]');
    if (!sel) return;
    if (sel.value === '') delete imp.mapping[sel.dataset.map];
    else imp.mapping[sel.dataset.map] = Number(sel.value);
    refreshPreview();
  });
  $('#import-update').addEventListener('change', refreshPreview);
  $('#import-run').addEventListener('click', runImport);
  $('#import-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-import-template]')) { e.preventDefault(); downloadTemplate(); }
  });
}

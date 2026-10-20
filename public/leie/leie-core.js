// LEIE screening engine: CSV parsing, name normalization, and matching
// against the OIG List of Excluded Individuals/Entities. Runs entirely in the
// browser (no network calls); also loadable from Node for tests, where it is
// exposed as globalThis.LeieCore.
(function (root) {
  'use strict';

  // ------------------------------------------------------------ CSV

  // RFC 4180 parser: quoted fields, embedded commas/quotes/newlines, CRLF.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [];
    let field = '';
    let i = 0;
    let quoted = false;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"') { quoted = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r' || ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
        if (ch === '\r' && text[i + 1] === '\n') i++;
        i++; continue;
      }
      field += ch; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  function toCSV(rows) {
    return rows.map((r) => r.map((v) => {
      const s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\r\n');
  }

  // ------------------------------------------------------------ normalization

  function clean(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/['’`]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim();
  }
  // Spaces and punctuation removed: "O'Brien" = "OBRIEN", "De La Cruz" = "DELACRUZ".
  function compact(s) { return clean(s).replace(/ /g, ''); }

  const NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);
  // "Smith, John A" / "John A Smith" / "Smith Jr, John" -> { first, middle, last }
  function splitFullName(full) {
    const raw = String(full || '').trim();
    if (!raw) return { first: '', middle: '', last: '' };
    const strip = (parts) => parts.filter((p) => !NAME_SUFFIXES.has(clean(p)));
    if (raw.includes(',')) {
      const [lastPart, ...rest] = raw.split(',');
      const given = strip(rest.join(' ').trim().split(/\s+/).filter(Boolean));
      return { last: strip(lastPart.trim().split(/\s+/)).join(' '), first: given[0] || '', middle: given.slice(1).join(' ') };
    }
    const parts = strip(raw.split(/\s+/));
    if (parts.length === 1) return { first: '', middle: '', last: parts[0] };
    return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] };
  }

  // Accepts YYYYMMDD, YYYY-MM-DD, MM/DD/YYYY, M/D/YY, or an Excel serial date.
  // Returns YYYYMMDD or '' when the value can't be read.
  function normalizeDate(v) {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s || /^0+$/.test(s)) return '';
    let y, m, d, mt;
    if ((mt = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [, y, m, d] = mt;
    else if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [, y, m, d] = mt;
    else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
      [, m, d, y] = mt;
      if (y.length === 2) {
        const yy = Number(y);
        const cur = new Date().getFullYear() % 100;
        y = String(yy > cur ? 1900 + yy : 2000 + yy);
      }
    } else if (/^\d{4,5}(\.\d+)?$/.test(s)) {
      const serial = Math.floor(Number(s));
      if (serial < 600 || serial > 80000) return '';
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return dt.getUTCFullYear() + String(dt.getUTCMonth() + 1).padStart(2, '0') + String(dt.getUTCDate()).padStart(2, '0');
    } else return '';
    m = Number(m); d = Number(d); y = Number(y);
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1800) return '';
    return y + String(m).padStart(2, '0') + String(d).padStart(2, '0');
  }

  function formatDate(yyyymmdd) {
    const s = normalizeDate(yyyymmdd);
    return s ? `${s.slice(4, 6)}/${s.slice(6, 8)}/${s.slice(0, 4)}` : '';
  }

  function normalizeNPI(v) {
    const s = String(v == null ? '' : v).replace(/\D/g, '');
    return /^0*$/.test(s) ? '' : s;
  }

  // ------------------------------------------------------------ exclusion types

  const EXCLUSION_TYPES = {
    '1128a1': 'Conviction of program-related crimes',
    '1128a2': 'Conviction relating to patient abuse or neglect',
    '1128a3': 'Felony conviction relating to health care fraud',
    '1128a4': 'Felony conviction relating to controlled substance',
    '1128b1': 'Misdemeanor conviction relating to health care fraud',
    '1128b2': 'Conviction relating to obstruction of an investigation or audit',
    '1128b3': 'Misdemeanor conviction relating to controlled substance',
    '1128b4': 'License revocation, suspension, or surrender',
    '1128b5': 'Exclusion or suspension under federal or state health care program',
    '1128b6': 'Claims for excessive charges, unnecessary services, or substandard care',
    '1128b7': 'Fraud, kickbacks, and other prohibited activities',
    '1128b8': 'Entities controlled by a sanctioned individual',
    '1128b8a': 'Entities controlled by a family or household member of an excluded individual',
    '1128b9': 'Failure to disclose required information',
    '1128b10': 'Failure to supply requested information on subcontractors and suppliers',
    '1128b11': 'Failure to supply payment information',
    '1128b12': 'Failure to grant immediate access',
    '1128b13': 'Failure to take corrective action',
    '1128b14': 'Default on health education loan or scholarship obligations',
    '1128b15': 'Individuals controlling a sanctioned entity',
    '1128b16': 'Making false statement or misrepresentation of material fact',
    '1128aa': 'Civil monetary penalty',
    '1156': 'Failure to meet statutory obligations (QIO)',
    'brchcia': 'Breach of Corporate Integrity Agreement',
    'brchsa': 'Breach of Settlement Agreement',
  };
  function describeExclusion(code) {
    const key = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return EXCLUSION_TYPES[key] || '';
  }

  // ------------------------------------------------------------ LEIE database

  const LEIE_COLUMNS = ['LASTNAME', 'FIRSTNAME', 'MIDNAME', 'BUSNAME', 'GENERAL', 'SPECIALTY', 'UPIN', 'NPI',
    'DOB', 'ADDRESS', 'CITY', 'STATE', 'ZIP', 'EXCLTYPE', 'EXCLDATE', 'REINDATE', 'WAIVERDATE', 'WVRSTATE'];
  const REQUIRED_COLUMNS = ['LASTNAME', 'FIRSTNAME', 'BUSNAME', 'EXCLTYPE', 'EXCLDATE'];

  // Turns the parsed OIG spreadsheet (array of rows, header first) into
  // compact records. Throws if it doesn't look like the LEIE file.
  function buildRecords(table) {
    if (!table.length) throw new Error('The file is empty.');
    const headerAt = findLeieHeader(table);
    if (headerAt < 0) {
      throw new Error('This does not look like the OIG LEIE file. Expected columns: ' + REQUIRED_COLUMNS.join(', ') +
        '. Download "LEIE Database Supplement" / UPDATED.csv from oig.hhs.gov/exclusions.');
    }
    const header = table[headerAt].map((c) => compact(c));
    const idx = LEIE_COLUMNS.map((c) => header.indexOf(c));
    const records = [];
    for (let r = headerAt + 1; r < table.length; r++) {
      const row = table[r];
      const rec = idx.map((i) => (i < 0 || row[i] == null ? '' : String(row[i]).trim()));
      if (rec[0] || rec[1] || rec[3]) records.push(rec);
    }
    if (!records.length) throw new Error('The LEIE file has no records.');
    return records;
  }

  // ------------------------------------------------------------ other exclusion lists

  // State Medicaid and other exclusion lists come in many layouts. They are
  // converted into the same record layout as the LEIE, plus three fields:
  // FULLNAME (a single name column, kept as written), LICENSE, and KIND
  // (I = individual, E = entity, U = not stated).
  const RECORD_FIELDS = LEIE_COLUMNS.concat(['FULLNAME', 'LICENSE', 'KIND']);
  const F = Object.fromEntries(RECORD_FIELDS.map((c, i) => [c, i]));
  const kindOf = (r) => r[F.KIND] || (r[0] ? 'I' : 'E');

  // Returns the header row index if the table is in the OIG LEIE layout, else -1.
  function findLeieHeader(table) {
    for (let r = 0; r < Math.min(table.length, 10); r++) {
      const cells = table[r].map((c) => compact(c));
      if (REQUIRED_COLUMNS.every((col) => cells.includes(col))) return r;
    }
    return -1;
  }

  const LIST_PATTERNS = {
    last: [/^(last|lastname|lname|surname|providerlastname|individuallastname|familyname)$/, /last ?name|surname/],
    first: [/^(first|firstname|fname|providerfirstname|individualfirstname|givenname)$/, /first ?name/],
    middle: [/^(middle|mi|middlename|middleinitial|midname|midinit|middleinit)$/, /middle/],
    full: [/^(name|fullname|providername|individualname|sanctionedprovider|excludedprovider|excludedindividual|personname|subjectname|nameofprovider|providerentityname)$/, /^(provider|excluded|sanctioned)?.*name$/],
    business: [/^(business|businessname|busname|company|companyname|entity|entityname|organization|organizationname|facility|facilityname|dba|doingbusinessas|practicename|groupname)$/, /business|company|entity|organi[sz]ation|facility|dba/],
    dob: [/^(dob|dateofbirth|birthdate|birthday)$/, /birth/],
    npi: [/^(npi|npinumber|nationalprovideridentifier)$/, /npi/],
    license: [/^(license|licensenumber|licenseno|licno|licnumber|license#)$/, /lic/],
    excldate: [/^(exclusiondate|excldate|effectivedate|actiondate|sanctiondate|startdate|terminationdate|exclusioneffectivedate|dateexcluded|sanctionstartdate)$/, /date/],
    excltype: [/^(reason|exclusiontype|excltype|actiontype|sanctiontype|basis|exclusionreason|sanctionreason|action|type)$/, /reason|basis|sanction|action/],
    specialty: [/^(providertype|specialty|profession|occupation|licensetype|category)$/, /type|specialty|profession/],
    address: [/^(address|streetaddress|address1|addressline1|street)$/, /address|street/],
    city: [/^(city|town)$/, /city/],
    state: [/^(state|st|statecode)$/, /^state/],
    zip: [/^(zip|zipcode|postalcode|zip5)$/, /zip|postal/],
  };
  const LIST_FIELDS = Object.keys(LIST_PATTERNS);

  function detectListColumns(header) {
    const keys = header.map((h) => compact(h).toLowerCase());
    const map = Object.fromEntries(LIST_FIELDS.map((f) => [f, -1]));
    const used = new Set();
    for (const pass of [0, 1]) {
      for (const f of LIST_FIELDS) {
        if (map[f] >= 0) continue;
        const i = keys.findIndex((k, j) => k && !used.has(j) && LIST_PATTERNS[f][pass].test(k));
        if (i >= 0) { map[f] = i; used.add(i); }
      }
    }
    // A single "name" column is only needed when there is no last-name column.
    if (map.last >= 0 && map.full >= 0 && map.first < 0) map.full = -1;
    return map;
  }

  // State files often start with title lines; the header is the first row
  // with a column that holds names.
  function findListHeader(table) {
    for (let r = 0; r < Math.min(table.length, 25); r++) {
      const filled = table[r].filter((c) => String(c).trim()).length;
      const m = detectListColumns(table[r]);
      if (filled >= 2 && (m.last >= 0 || m.full >= 0 || m.business >= 0)) return r;
    }
    return 0;
  }

  function buildListRecords(table, headerAt, map) {
    const get = (row, f) => (map[f] >= 0 && row[map[f]] != null ? String(row[map[f]]).trim() : '');
    const records = [];
    for (let r = headerAt + 1; r < table.length; r++) {
      const row = table[r];
      const rec = new Array(RECORD_FIELDS.length).fill('');
      let last = get(row, 'last'), first = get(row, 'first'), middle = get(row, 'middle');
      const full = get(row, 'full');
      const business = get(row, 'business');
      let kind = '';
      if (last) kind = 'I';
      else if (full) {
        ({ last, first, middle } = splitFullName(full));
        rec[F.FULLNAME] = full;
        kind = full.includes(',') ? 'I' : (business ? 'I' : 'U');
      }
      if (!last && !business) continue;
      if (!kind) kind = 'E';
      rec[F.LASTNAME] = last; rec[F.FIRSTNAME] = first; rec[F.MIDNAME] = middle; rec[F.BUSNAME] = business;
      rec[F.DOB] = get(row, 'dob'); rec[F.NPI] = get(row, 'npi'); rec[F.LICENSE] = get(row, 'license');
      rec[F.EXCLDATE] = get(row, 'excldate'); rec[F.EXCLTYPE] = get(row, 'excltype'); rec[F.SPECIALTY] = get(row, 'specialty');
      rec[F.ADDRESS] = get(row, 'address'); rec[F.CITY] = get(row, 'city'); rec[F.STATE] = get(row, 'state'); rec[F.ZIP] = get(row, 'zip');
      rec[F.KIND] = kind;
      records.push(rec);
    }
    if (!records.length) throw new Error('No names were found in the selected columns.');
    return records;
  }

  function recordToObject(rec) {
    const o = {};
    RECORD_FIELDS.forEach((c, i) => { o[c] = rec[i] || ''; });
    o.KIND = kindOf(rec);
    return o;
  }

  function summarize(records) {
    let individuals = 0, entities = 0, latest = '';
    for (const r of records) {
      const k = kindOf(r);
      if (k === 'I') individuals++; else if (k === 'E') entities++;
      const d = normalizeDate(r[14]);
      if (d > latest) latest = d;
    }
    return { total: records.length, individuals, entities, latestExclusion: latest };
  }

  // Builds lookup tables for fast screening of large employee lists.
  function buildIndex(records) {
    const byLast = new Map();
    const byNpi = new Map();
    const byBusiness = new Map();
    const add = (map, key, i) => {
      if (!key) return;
      let list = map.get(key);
      if (!list) map.set(key, (list = []));
      if (list[list.length - 1] !== i) list.push(i);
    };
    records.forEach((r, i) => {
      if (r[0]) add(byLast, compact(r[0]), i);
      add(byNpi, normalizeNPI(r[7]), i);
      if (r[3]) add(byBusiness, compact(r[3]), i);
      if (r[F.FULLNAME]) add(byBusiness, compact(r[F.FULLNAME]), i);
    });
    return { records, byLast, byNpi, byBusiness };
  }

  // Only exact matches are reported: a name either appears in the LEIE as
  // written or it doesn't. Comparison ignores capitalization, spacing, and
  // punctuation only ("O'Brien" = "OBRIEN"); nothing is matched on part of a
  // name, an initial, or a similar spelling. When a date of birth is entered
  // and the LEIE record has one, they must be the same or the record is not
  // a match.
  const LEVELS = {
    strong: { rank: 2, label: 'Match – name and DOB/NPI' },
    name: { rank: 1, label: 'Match – name' },
  };
  const dobConflicts = (qDob, r) => { const rDob = normalizeDate(r[8]); return !!(qDob && rDob && qDob !== rDob); };

  // query: { first, middle, last, dob, npi }. Needs first and last name, or an NPI.
  function searchIndividual(index, query) {
    const qLast = compact(query.last);
    const qFirst = compact(query.first);
    const qDob = normalizeDate(query.dob);
    const qNpi = normalizeNPI(query.npi);
    const hits = new Map();

    if (qLast && qFirst) {
      for (const i of index.byLast.get(qLast) || []) {
        const r = index.records[i];
        if (compact(r[1]) !== qFirst || dobConflicts(qDob, r)) continue;
        let level = 'name';
        const why = ['first name', 'last name'];
        if (qDob && normalizeDate(r[8])) { level = 'strong'; why.push('date of birth'); }
        const rNpi = normalizeNPI(r[7]);
        if (qNpi && rNpi && qNpi === rNpi) { level = 'strong'; why.push('NPI'); }
        hits.set(i, { index: i, level, why });
      }
    }
    if (qNpi) {
      for (const i of index.byNpi.get(qNpi) || []) if (!hits.has(i) && !dobConflicts(qDob, index.records[i])) hits.set(i, { index: i, level: 'strong', why: ['NPI'] });
    }
    return sortHits(index, [...hits.values()]);
  }

  function searchBusiness(index, name) {
    const q = compact(name);
    if (!q) return [];
    return sortHits(index, (index.byBusiness.get(q) || []).map((i) => ({ index: i, level: 'name', why: ['business name'] })));
  }

  function sortHits(index, hits) {
    return hits
      .sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || String(index.records[a.index][0] + index.records[a.index][3]).localeCompare(index.records[b.index][0] + index.records[b.index][3]))
      .map((h) => ({ ...h, label: LEVELS[h.level].label, record: recordToObject(index.records[h.index]) }));
  }

  // ------------------------------------------------------------ employee lists

  const FIELD_PATTERNS = {
    first: /^(first|fname|firstname|given|givenname|employeefirstname|legalfirstname)$/,
    middle: /^(middle|mi|mname|middlename|middleinitial|midname)$/,
    last: /^(last|lname|lastname|surname|familyname|employeelastname|legallastname)$/,
    full: /^(name|fullname|employeename|employee|staffname|providername|individualname|person)$/,
    business: /^(business|businessname|busname|company|companyname|entity|entityname|vendor|vendorname|organization|org|contractor)$/,
    dob: /^(dob|dateofbirth|birthdate|birthday|bdate)$/,
    npi: /^(npi|npinumber|nationalproviderid|nationalprovideridentifier)$/,
    id: /^(id|empid|employeeid|employeenumber|empno|badge|badgenumber|staffid)$/,
  };

  function detectColumns(header) {
    const keys = header.map((h) => compact(h).toLowerCase());
    const map = {};
    for (const [field, re] of Object.entries(FIELD_PATTERNS)) {
      const i = keys.findIndex((k) => re.test(k));
      map[field] = i;
    }
    // Looser fallbacks for headers like "Employee Last Name".
    const loose = { first: /first/, last: /last|surname/, middle: /middle/, dob: /birth|dob/, npi: /npi/ };
    for (const [field, re] of Object.entries(loose)) {
      if (map[field] < 0) map[field] = keys.findIndex((k, i) => re.test(k) && !Object.values(map).includes(i));
    }
    return map;
  }

  // Returns a person or business query for one roster row, or null if blank.
  function rowToQuery(row, map) {
    const get = (f) => (map[f] >= 0 && row[map[f]] != null ? String(row[map[f]]).trim() : '');
    let first = get('first'), middle = get('middle'), last = get('last');
    if (!last && get('full')) ({ first, middle, last } = splitFullName(get('full')));
    else if (last && !first && last.includes(',')) ({ first, middle, last } = splitFullName(last));
    const business = get('business');
    const q = { id: get('id'), first, middle, last, dob: get('dob'), npi: get('npi'), business };
    if (!q.last && !q.business && !normalizeNPI(q.npi)) return null;
    return q;
  }

  // lists: one index from buildIndex, or [{ id, name, index }] to check several lists.
  function screenRoster(lists, rows, map) {
    if (!Array.isArray(lists)) lists = [{ id: '', name: '', index: lists }];
    const results = [];
    rows.forEach((row, n) => {
      const q = rowToQuery(row, map);
      if (!q) return;
      const incomplete = !!q.last && !q.first && !q.business && !normalizeNPI(q.npi);
      let hits = [];
      for (const l of lists) {
        let found = [];
        if ((q.last && q.first) || normalizeNPI(q.npi)) found = found.concat(searchIndividual(l.index, q));
        if (q.business) found = found.concat(searchBusiness(l.index, q.business));
        hits = hits.concat(found.map((h) => ({ ...h, list: l.name, key: l.id + ':' + h.index })));
      }
      const seen = new Set();
      hits = hits.filter((h) => !seen.has(h.key) && seen.add(h.key));
      results.push({ row: n, query: q, hits, top: hits.length ? hits[0].level : null, incomplete });
    });
    return results;
  }

  function displayName(q) {
    const person = [q.first, q.middle, q.last].filter(Boolean).join(' ');
    return person || q.business || '';
  }

  function recordName(rec) {
    if (rec.FULLNAME) return rec.FULLNAME;
    if (rec.LASTNAME) return [rec.LASTNAME + ',', rec.FIRSTNAME, rec.MIDNAME].filter(Boolean).join(' ');
    return rec.BUSNAME;
  }

  const api = {
    parseCSV, toCSV, clean, compact, splitFullName, normalizeDate, formatDate, normalizeNPI,
    describeExclusion, LEIE_COLUMNS, buildRecords, findLeieHeader, findListHeader, detectListColumns, buildListRecords, LIST_FIELDS, summarize, buildIndex, searchIndividual, searchBusiness,
    detectColumns, rowToQuery, screenRoster, displayName, recordName, LEVELS,
  };
  root.LeieCore = api;
})(typeof window !== 'undefined' ? window : globalThis);

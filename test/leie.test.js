import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../public/leie/leie-core.js';

const C = globalThis.LeieCore;

const LEIE_CSV = [
  'LASTNAME,FIRSTNAME,MIDNAME,BUSNAME,GENERAL,SPECIALTY,UPIN,NPI,DOB,ADDRESS,CITY,STATE,ZIP,EXCLTYPE,EXCLDATE,REINDATE,WAIVERDATE,WVRSTATE',
  'SMITH,JOHN,A,,IND- LIC HC SERV PRO,NURSE/NURSES AIDE,,0000000000,19800115,"1 MAIN ST, APT 2",DALLAS,TX,75001,1128b4,20200301,00000000,00000000,',
  'SMITH,JONATHAN,,,IND- LIC HC SERV PRO,EMT,,1234567890,19751010,,AUSTIN,TX,73301,1128a1,20190101,00000000,00000000,',
  "O'BRIEN,MARY,K,,OTHER BUSINESS,,,0000000000,00000000,,BOSTON,MA,02101,1128b7,20210505,00000000,00000000,",
  'GARCIA LOPEZ,ANA,,,,,,0000000000,19900202,,MIAMI,FL,33101,1128a3,20220202,00000000,00000000,',
  ',,,"ACME AMBULANCE SERVICE, INC.",OTHER BUSINESS,AMBULANCE,,0000000000,00000000,,TULSA,OK,74101,1128b8,20180808,00000000,00000000,',
].join('\r\n');

const records = C.buildRecords(C.parseCSV(LEIE_CSV));
const index = C.buildIndex(records);

test('parses the LEIE CSV, including quoted commas', () => {
  assert.equal(records.length, 5);
  const s = C.summarize(records);
  assert.deepEqual([s.individuals, s.entities, s.latestExclusion], [4, 1, '20220202']);
  assert.equal(index.records[0][9], '1 MAIN ST, APT 2');
});

test('rejects files that are not the LEIE', () => {
  assert.throws(() => C.buildRecords(C.parseCSV('Name,Phone\nBob,555')), /does not look like the OIG LEIE/);
});

test('individual search: exact name only, ignoring case and punctuation', () => {
  const hits = C.searchIndividual(index, { first: 'john', last: 'Smith' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].record.FIRSTNAME, 'JOHN');
  assert.equal(hits[0].level, 'name');
  assert.equal(C.searchIndividual(index, { first: 'Mary', last: 'OBrien' })[0].level, 'name');
  assert.equal(C.searchIndividual(index, { first: 'Ana', last: 'Garcia-Lopez' })[0].level, 'name');
});

test('partial names are never reported', () => {
  assert.equal(C.searchIndividual(index, { first: 'Jon', last: 'Smith' }).length, 0, 'shortened first name');
  assert.equal(C.searchIndividual(index, { first: 'J', last: 'Smith' }).length, 0, 'first initial');
  assert.equal(C.searchIndividual(index, { first: 'Ana', last: 'Garcia' }).length, 0, 'part of a last name');
  assert.equal(C.searchIndividual(index, { last: 'Smith' }).length, 0, 'last name alone');
  assert.equal(C.searchBusiness(index, 'acme ambulance').length, 0, 'part of a business name');
  assert.equal(C.searchBusiness(index, 'Acme Ambulance Service LLC').length, 0, 'different legal suffix');
});

test('date of birth confirms a match, and a different one rules it out', () => {
  assert.equal(C.searchIndividual(index, { first: 'John', last: 'Smith', dob: '1980-01-15' })[0].level, 'strong');
  assert.equal(C.searchIndividual(index, { first: 'John', last: 'Smith', dob: '01/15/1999' }).length, 0, 'a different DOB is not a match');
  assert.equal(C.searchIndividual(index, { first: 'Mary', last: "O'Brien", dob: '01/15/1999' }).length, 1, 'no DOB on the LEIE record to compare');
});

test('NPI alone finds a record', () => {
  const hits = C.searchIndividual(index, { npi: '1234567890' });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].level, 'strong');
});

test('no results for a clean name', () => {
  assert.equal(C.searchIndividual(index, { first: 'Zed', last: 'Nobody' }).length, 0);
  assert.equal(C.searchIndividual(index, { first: 'Paul', last: 'Smith' }).length, 0);
});

test('business search matches the full name as written', () => {
  assert.equal(C.searchBusiness(index, 'Acme Ambulance Service Inc')[0].level, 'name');
  assert.equal(C.searchBusiness(index, 'Lynx EMS').length, 0);
});

test('splits full names and normalizes dates', () => {
  assert.deepEqual(C.splitFullName('Smith Jr., John A'), { last: 'Smith', first: 'John', middle: 'A' });
  assert.deepEqual(C.splitFullName('John A Smith III'), { first: 'John', middle: 'A', last: 'Smith' });
  assert.equal(C.normalizeDate('1/5/1980'), '19800105');
  assert.equal(C.normalizeDate('29235'), '19800115'); // Excel serial date
  assert.equal(C.normalizeDate('00000000'), '');
  assert.equal(C.formatDate('20200301'), '03/01/2020');
});

test('screens an employee roster with detected columns', () => {
  const table = C.parseCSV('Emp ID,Employee Name,Date of Birth\n1,"Smith, John",01/15/1980\n2,Jane Doe,\n3,,\n4,Smith,');
  const map = C.detectColumns(table[0]);
  assert.equal(map.full, 1);
  assert.equal(map.dob, 2);
  assert.equal(map.id, 0);
  const results = C.screenRoster(index, table.slice(1), map);
  assert.equal(results.length, 3, 'blank rows are skipped');
  assert.equal(results[0].top, 'strong');
  assert.equal(results[1].top, null);
  assert.equal(results[2].top, null, 'a last name alone is not matched');
  assert.equal(results[2].incomplete, true);
});

test('the standalone LEIE page is up to date with its source files', async () => {
  const fs = await import('node:fs');
  const { buildStandalone, OUTPUT } = await import('../scripts/build-leie-standalone.js');
  const html = buildStandalone();
  assert.ok(!/(src|href)="(?!data:|https?:)[^"#]+"/.test(html), 'every asset is inlined');
  assert.equal(fs.readFileSync(OUTPUT, 'utf8'), html, 'run `npm run build:leie` and commit the result');
});

test('imports a state exclusion list with title rows and a single name column', () => {
  const table = C.parseCSV([
    'State Medicaid Provider Exclusion List',
    'As of 10/01/2026',
    'Provider Name,Provider Type,License Number,NPI,Exclusion Date,Reason',
    '"DOE, JANE M",LVN,LV12345,,09/15/2026,Fraud',
    'MARK ALAN TWAIN,PARAMEDIC,P999,,08/01/2026,License revoked',
    'ACME AMBULANCE SERVICE INC,AMBULANCE PROVIDER,,1112223334,07/01/2026,Program violation',
  ].join('\n'));
  assert.equal(C.findLeieHeader(table), -1);
  const headerAt = C.findListHeader(table);
  assert.equal(headerAt, 2);
  const map = C.detectListColumns(table[headerAt]);
  assert.deepEqual([map.full, map.specialty, map.license, map.npi, map.excldate, map.excltype], [0, 1, 2, 3, 4, 5]);
  const recs = C.buildListRecords(table, headerAt, map);
  assert.equal(recs.length, 3);
  const state = C.buildIndex(recs);
  const lists = [{ id: 'leie', name: 'OIG LEIE', index }, { id: 'tx', name: 'Texas Medicaid Exclusions', index: state }];

  const jane = C.searchIndividual(state, { first: 'Jane', last: 'Doe' });
  assert.equal(jane.length, 1);
  assert.equal(jane[0].record.LICENSE, 'LV12345');
  assert.equal(C.recordName(jane[0].record), 'DOE, JANE M', 'shown as written in the state list');
  assert.equal(C.searchIndividual(state, { first: 'Mark', last: 'Twain' }).length, 1, '"First Middle Last" names');
  assert.equal(C.searchIndividual(state, { first: 'Jan', last: 'Doe' }).length, 0, 'still exact only');
  assert.equal(C.searchBusiness(state, 'Acme Ambulance Service Inc').length, 1);

  // A roster is checked against every list; each hit names its list.
  const roster = C.parseCSV('First,Last\nJohn,Smith\nJane,Doe\nPat,Clean');
  const results = C.screenRoster(lists, roster.slice(1), C.detectColumns(roster[0]));
  assert.deepEqual(results.map((r) => r.hits.map((h) => h.list)), [['OIG LEIE'], ['Texas Medicaid Exclusions'], []]);
});

// Builds PDF-style positioned lines: each cell is [x, text].
const pdfLines = (rows) => rows.map((cells, i) => ({ page: 1, y: 700 - i * 14, items: cells.map(([x, str]) => ({ x, w: str.length * 5, h: 10, str })) }));

test('reads an employee table from PDF text, keeping blank cells in their column', () => {
  const lines = pdfLines([
    [[40, 'Lynx EMS Active Roster']],
    [[40, 'Employee ID'], [120, 'First Name'], [220, 'Last Name'], [320, 'DOB']],
    [[40, '1001'], [120, 'John'], [220, 'Smith'], [320, '01/15/1980']],
    [[40, '1002'], [120, 'Mary'], [220, "O'Brien"]],
    [[40, 'Employee ID'], [120, 'First Name'], [220, 'Last Name'], [320, 'DOB']],
    [[40, '1003'], [120, 'Ana'], [220, 'Garcia'], [222 + 'Garcia'.length * 5, 'Lopez'], [320, 'February 2, 1990']],
  ]);
  const { table, header } = C.pdfLinesToTable(lines);
  assert.equal(header, true);
  assert.deepEqual(table, [
    ['Employee ID', 'First Name', 'Last Name', 'DOB'],
    ['1001', 'John', 'Smith', '01/15/1980'],
    ['1002', 'Mary', "O'Brien", ''],
    ['1003', 'Ana', 'Garcia Lopez', 'February 2, 1990'],
  ]);
  assert.equal(C.normalizeDate(table[3][3]), '19900202');
});

test('reads first name, last name, and DOB from a form-style PDF', () => {
  assert.deepEqual(C.extractPersonFromLines(pdfLines([
    [[40, 'Employment Application']],
    [[40, 'Applicant Name: Smith, John A'], [300, 'DOB: 01/15/1980']],
  ])), { first: 'John', middle: 'A', last: 'Smith', dob: '01/15/1980' });

  assert.deepEqual(C.extractPersonFromLines(pdfLines([
    [[40, 'First Name'], [200, 'Last Name'], [360, 'Date of Birth']],
    [[40, 'Jane'], [200, 'Doe'], [360, '5-May-1991']],
  ])), { first: 'Jane', middle: '', last: 'Doe', dob: '5-May-1991' });

  assert.deepEqual(C.extractPersonFromLines(pdfLines([
    [[40, 'Name: Carlos Rivera DOB 12/12/1985']],
  ])), { first: 'Carlos', middle: '', last: 'Rivera', dob: '12/12/1985' });

  assert.equal(C.extractPersonFromLines(pdfLines([[[40, 'Quarterly report']], [[40, 'Nothing here']]])), null);
});

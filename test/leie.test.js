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

test('date of birth confirms or contradicts a name match', () => {
  assert.equal(C.searchIndividual(index, { first: 'John', last: 'Smith', dob: '1980-01-15' })[0].level, 'strong');
  assert.equal(C.searchIndividual(index, { first: 'John', last: 'Smith', dob: '01/15/1999' })[0].level, 'differs');
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

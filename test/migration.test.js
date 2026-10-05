import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, questionRepo, payerRepo, settingsRepo } from '../server/db.js';

test('a database from before payer rules is upgraded in place', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-'));
  const file = path.join(dir, 'old.db');
  try {
    // Recreate the version-1 state: no payers, old prior-auth question, insurance question, no payer questions.
    let db = openDb(file);
    const qs = questionRepo(db);
    db.exec('DELETE FROM payers');
    db.exec("DELETE FROM questions WHERE category = 'Payer & Authorization' AND code != 'DOC_PRIOR_AUTH'");
    const pa = qs.getByCode('DOC_PRIOR_AUTH');
    qs.update(pa.id, { category: 'Documentation', criterion: 'documentation', answer_type: 'yes_no', options: [], call_types: ['repetitive'], qualifying_answer: 'yes', active: true });
    qs.create({ code: 'DOC_INSURANCE', category: 'Documentation', text: 'Primary insurance?', answer_type: 'choice', options: ['A', 'B'], criterion: 'info' }, { system: true });
    const custom = qs.create({ code: 'MY_CUSTOM', category: 'Custom', text: 'Kept?', answer_type: 'yes_no', criterion: 'info' });
    settingsRepo(db).set('seed_version', 1);
    db.close();

    db = openDb(file);
    const after = questionRepo(db);
    assert.equal(settingsRepo(db).all().seed_version, '2');
    assert.equal(payerRepo(db).list().length, 4);
    assert.equal(after.getByCode('DOC_PRIOR_AUTH').criterion, 'prior_auth');
    assert.deepEqual(after.getByCode('DOC_PRIOR_AUTH').call_types, []);
    assert.equal(after.getByCode('DOC_INSURANCE').active, false);
    assert.ok(after.getByCode('MCD_ELIGIBILITY'));
    assert.deepEqual(after.getByCode('DOC_PCS').payers, ['medicare', 'medicare_advantage']);
    assert.equal(after.get(custom.id).text, 'Kept?');
    db.close();

    // Opening again is a no-op.
    db = openDb(file);
    assert.equal(payerRepo(db).list().length, 4);
    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

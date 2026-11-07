import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, ensureInitialAdmin } from '../server/app.js';
import { openDb } from '../server/db.js';

let server;
let base;
let db;
const ADMIN_PW = 'Strong-pass-2026';

// Minimal cookie-jar client.
function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let data = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* csv */ }
    return { status: res.status, data, headers: res.headers };
  };
}

async function signIn(username, password, newPassword) {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(r.status, 200, `login ${username}`);
  if (r.data.user.must_change_password) {
    const ch = await c('/api/auth/change-password', { method: 'POST', body: { currentPassword: password, newPassword } });
    assert.equal(ch.status, 200, JSON.stringify(ch.data));
  }
  return c;
}

const auditActions = async () => (await db.query('SELECT action FROM ambuintake.audit_log ORDER BY id')).map((r) => r.action);

let admin;
let taker;

before(async () => {
  // Set TEST_DATABASE_URL to run against a real Postgres server (its ambuintake schema is reset).
  if (process.env.TEST_DATABASE_URL) {
    const { connectPostgres } = await import('../server/db/client.js');
    const admin = await connectPostgres(process.env.TEST_DATABASE_URL);
    await admin.exec('DROP SCHEMA IF EXISTS ambuintake CASCADE');
    await admin.close();
    db = await openDb({ url: process.env.TEST_DATABASE_URL });
  } else {
    db = await openDb({ memory: true });
  }
  await ensureInitialAdmin(db, { username: 'admin', password: 'Temp-first-1' });
  const app = createApp({ db });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

test('everything except sign-in requires a session', async () => {
  const anon = client();
  for (const path of ['/api/questions', '/api/config', '/api/admin/questions', '/api/admin/audit']) {
    assert.equal((await anon(path)).status, 401, path);
  }
  assert.equal((await anon('/api/evaluate', { method: 'POST', body: {} })).status, 401);
  assert.equal((await anon('/api/public-config')).status, 200);
});

test('initial admin must change the temporary password before doing anything', async () => {
  const c = client();
  const r = await c('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'Temp-first-1' } });
  assert.equal(r.data.user.must_change_password, true);
  const blocked = await c('/api/admin/questions');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');

  const weak = await c('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'Temp-first-1', newPassword: 'short' } });
  assert.equal(weak.status, 400);
  const ok = await c('/api/auth/change-password', { method: 'POST', body: { currentPassword: 'Temp-first-1', newPassword: ADMIN_PW } });
  assert.equal(ok.status, 200);
  assert.equal((await c('/api/admin/questions')).status, 200);
  admin = c;
});

test('admin creates a call taker who gets a temporary password', async () => {
  const r = await admin('/api/admin/users', { method: 'POST', body: { username: 'jdoe', display_name: 'Jane Doe', role: 'call_taker' } });
  assert.equal(r.status, 201);
  assert.ok(r.data.temporaryPassword.length >= 12);
  assert.equal((await admin('/api/admin/users', { method: 'POST', body: { username: 'JDOE', display_name: 'Dup', role: 'call_taker' } })).status, 400, 'usernames are case-insensitive');
  taker = await signIn('jdoe', r.data.temporaryPassword, 'Taker-pass-2026');
});

test('call takers can use the console but not the admin API', async () => {
  assert.equal((await taker('/api/questions')).status, 200);
  assert.equal((await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency' } })).status, 200);
  const denied = await taker('/api/admin/questions');
  assert.equal(denied.status, 403);
  assert.ok((await auditActions()).includes('access.denied'));
});

test('saved calls are attributed to the signed-in user', async () => {
  const saved = await taker('/api/calls', {
    method: 'POST',
    body: { callType: 'non_emergency', details: { patient_name: 'Test Patient' }, answers: { CLN_VENT: 'yes' }, transcript: 'on the vent', callTaker: 'spoofed' },
  });
  assert.equal(saved.status, 201);
  const call = (await admin(`/api/admin/calls/${saved.data.id}`)).data;
  assert.equal(call.call_taker, 'Jane Doe');
  assert.equal(call.assessment.levelOfService.hcpcs, 'A0434');

  const { rows } = (await admin('/api/admin/audit?action=call.')).data;
  assert.ok(rows.some((r) => r.action === 'call.saved' && r.username === 'jdoe' && r.entity_id === String(saved.data.id)));
  assert.ok(rows.some((r) => r.action === 'call.viewed' && r.username === 'admin'), 'viewing PHI is audited');
});

test('question changes are audited with before/after values', async () => {
  const created = await admin('/api/admin/questions', {
    method: 'POST',
    body: { code: 'CLN_SEIZURE', category: 'Clinical Condition', text: 'Seizure in the last 24 hours?', answer_type: 'yes_no', criterion: 'condition', qualifying_answer: 'yes', triggers: ['seizure'] },
  });
  assert.equal(created.status, 201);
  await admin(`/api/admin/questions/${created.data.id}`, { method: 'PUT', body: { priority: 1 } });
  const { rows } = (await admin('/api/admin/audit?action=question.updated')).data;
  assert.deepEqual(rows[0].details.changes.priority, { from: 3, to: 1 });

  const heard = await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', transcript: 'he had a seizure' } });
  assert.ok(heard.data.visibleCodes.includes('CLN_SEIZURE'));
});

test('repeated failed sign-ins lock the account', async () => {
  const c = client();
  for (let i = 0; i < 5; i++) {
    assert.equal((await c('/api/auth/login', { method: 'POST', body: { username: 'jdoe', password: 'wrong-password1' } })).status, 401);
  }
  const locked = await c('/api/auth/login', { method: 'POST', body: { username: 'jdoe', password: 'Taker-pass-2026' } });
  assert.equal(locked.status, 429);
  assert.ok((await auditActions()).includes('auth.login_blocked'));
});

test('deactivating a user ends their session; password reset unlocks', async () => {
  const users = (await admin('/api/admin/users')).data;
  const jdoe = users.find((u) => u.username === 'jdoe');
  await admin(`/api/admin/users/${jdoe.id}`, { method: 'PUT', body: { active: false } });
  assert.equal((await taker('/api/questions')).status, 401);

  await admin(`/api/admin/users/${jdoe.id}`, { method: 'PUT', body: { active: true } });
  const reset = await admin(`/api/admin/users/${jdoe.id}/reset-password`, { method: 'POST' });
  taker = await signIn('jdoe', reset.data.temporaryPassword, 'Taker-pass-2027');
  assert.equal((await taker('/api/questions')).status, 200);
});

test('the last administrator cannot be demoted or deactivated', async () => {
  const me = (await admin('/api/admin/users')).data.find((u) => u.username === 'admin');
  assert.equal((await admin(`/api/admin/users/${me.id}`, { method: 'PUT', body: { role: 'call_taker' } })).status, 400);
  assert.equal((await admin(`/api/admin/users/${me.id}`, { method: 'PUT', body: { active: false } })).status, 400);
});

test('audit log is append-only and exportable', async () => {
  await assert.rejects(db.query('DELETE FROM ambuintake.audit_log'), /append-only/);
  await assert.rejects(db.query("UPDATE ambuintake.audit_log SET action = 'x'"), /append-only/);
  const csv = await admin('/api/admin/audit/export.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.data, /^id,timestamp_utc,user_id,username,action/);
  assert.ok((await auditActions()).includes('audit.exported'));
});

test('state-changing requests must be JSON', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'username=admin&password=x' });
  assert.equal(res.status, 415);
});

test('logout ends the session', async () => {
  const c = await signIn('admin', ADMIN_PW);
  await c('/api/auth/logout', { method: 'POST' });
  assert.equal((await c('/api/questions')).status, 401);
  assert.ok((await auditActions()).includes('auth.logout'));
});

test('admin manages payer profiles; changes are validated and audited', async () => {
  const list = (await admin('/api/admin/payers')).data;
  assert.deepEqual(list.map((p) => p.code), ['medicare', 'medicare_advantage', 'medicaid', 'commercial', 'private_pay', 'facility_pay']);
  assert.equal((await taker('/api/admin/payers')).status, 403);

  const bad = await admin('/api/admin/payers', { method: 'POST', body: { code: 'tx_medicaid', name: 'Texas Medicaid', prior_auth: { emergency: 'never' } } });
  assert.equal(bad.status, 400);

  const created = await admin('/api/admin/payers', {
    method: 'POST',
    body: {
      code: 'tx_medicaid', name: 'Texas Medicaid', prior_auth: { emergency: 'not_required', non_emergency: 'required', repetitive: 'required' },
      certification: 'Texas Medicaid nonemergency ambulance prior authorization request form.', documentation: ['Fax the form to the PA unit.'],
      contact_name: 'TMHP Ambulance PA Unit', contact_url: 'https://example.org/pa',
    },
  });
  assert.equal(created.status, 201);
  assert.ok((await taker('/api/config')).data.payers.some((p) => p.code === 'tx_medicaid'));

  const r = await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'tx_medicaid' } });
  assert.equal(r.data.assessment.payer.priorAuth, 'required');
  assert.ok(r.data.assessment.missing.some((m) => m.code === 'DOC_PRIOR_AUTH'));

  await admin(`/api/admin/payers/${created.data.id}`, { method: 'PUT', body: { prior_auth: { emergency: 'not_required', non_emergency: 'varies', repetitive: 'required' } } });
  const { rows } = (await admin('/api/admin/audit?action=payer.')).data;
  assert.equal(rows[0].action, 'payer.updated');
  assert.equal(rows[0].details.changes.prior_auth.to.non_emergency, 'varies');

  // A payer used by questions can't be deleted; built-ins can't be deleted at all.
  const q = await admin('/api/admin/questions', { method: 'POST', body: { code: 'TX_FORM', category: 'Payer & Authorization', text: 'Form faxed?', answer_type: 'yes_no', criterion: 'info', payers: ['tx_medicaid'] } });
  assert.equal(q.status, 201);
  assert.equal((await admin(`/api/admin/payers/${created.data.id}`, { method: 'DELETE' })).status, 400);
  await admin(`/api/admin/questions/${q.data.id}`, { method: 'DELETE' });
  assert.equal((await admin(`/api/admin/payers/${created.data.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await admin(`/api/admin/payers/${list[0].id}`, { method: 'DELETE' })).status, 400);
  assert.equal((await admin('/api/admin/questions', { method: 'POST', body: { code: 'X_Q', category: 'X', text: 'x', criterion: 'info', payers: ['nope'] } })).status, 400);
});

test('saved calls record the payer and inactive payers are ignored', async () => {
  const saved = await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicaid', answers: { MCD_DUAL: 'yes' } } });
  const call = (await admin(`/api/admin/calls/${saved.data.id}`)).data;
  assert.equal(call.payer, 'medicaid');
  assert.equal(call.assessment.payer.name, 'Medicaid');

  const commercial = (await admin('/api/admin/payers')).data.find((p) => p.code === 'commercial');
  await admin(`/api/admin/payers/${commercial.id}`, { method: 'PUT', body: { active: false } });
  const r = await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'commercial' } });
  assert.equal(r.data.assessment.payer, null);
  await admin(`/api/admin/payers/${commercial.id}`, { method: 'PUT', body: { active: true } });
});

test('private pay and facility pay skip every medical-necessity question', async () => {
  for (const payer of ['private_pay', 'facility_pay']) {
    const r = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer, transcript: 'patient is bedbound on oxygen' } })).data;
    assert.equal(r.assessment.status, 'not_required', payer);
    for (const code of ['BED_GET_UP', 'CLN_OXYGEN', 'TX_OTHER_MEANS', 'DOC_PCS', 'DOC_PRIOR_AUTH', 'TX_NEAREST']) {
      assert.ok(!r.visibleCodes.includes(code), `${payer} should skip ${code}`);
    }
    assert.ok(r.visibleCodes.includes('EMG_SCREEN'), 'the emergency screen is still asked');
    assert.deepEqual(Object.keys(r.suggestions), [], 'no necessity answers are suggested');
  }
  const pp = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'private_pay', answers: { PP_AGREED: 'no' } } })).data;
  assert.ok(pp.visibleCodes.includes('PP_RESPONSIBLE'));
  assert.ok(pp.assessment.alerts.some((a) => a.code === 'PP_AGREED'));
  const fp = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'facility_pay' } })).data;
  assert.ok(fp.visibleCodes.includes('FP_AUTHORIZED_BY') && !fp.visibleCodes.includes('PP_RESPONSIBLE'));

  // Only private pay and facility pay may skip the review.
  const commercial = (await admin('/api/admin/payers')).data.find((p) => p.code === 'commercial');
  const refused = await admin(`/api/admin/payers/${commercial.id}`, { method: 'PUT', body: { requires_medical_necessity: false } });
  assert.equal(refused.status, 400);
  assert.match(refused.data.error, /Only private pay and facility pay/);
  assert.notEqual((await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'commercial' } })).data.assessment.status, 'not_required');
});

test('every payer except private pay and facility pay gets the necessity and reasonableness questions', async () => {
  const necessity = ['BED_GET_UP', 'BED_AMBULATE', 'BED_SIT', 'CLN_OXYGEN', 'TX_OTHER_MEANS', 'TX_NEAREST'];
  const list = (await admin('/api/admin/payers')).data.filter((p) => p.active);
  assert.ok(list.length >= 6);
  for (const p of list) {
    const r = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: p.code, allQuestions: true } })).data;
    const exempt = ['private_pay', 'facility_pay'].includes(p.code);
    for (const code of necessity) assert.equal(r.visibleCodes.includes(code), !exempt, `${p.code} ${exempt ? 'skips' : 'asks'} ${code}`);
    assert.equal(r.assessment.payer.requiresMedicalNecessity, !exempt, p.code);
  }
  // A new payer can't be created without the review either.
  const bad = await admin('/api/admin/payers', { method: 'POST', body: { code: 'cash_only', name: 'Cash only', requires_medical_necessity: false, prior_auth: { emergency: 'not_required', non_emergency: 'not_required', repetitive: 'not_required' } } });
  assert.equal(bad.status, 400);
});

test('transport brokers are added as payers, linked to a payer program', async () => {
  const bad = await admin('/api/admin/payers', { method: 'POST', body: { code: 'bad_broker', name: 'Bad', kind: 'broker', parent_code: 'nope', prior_auth: { emergency: 'not_required', non_emergency: 'required', repetitive: 'required' } } });
  assert.equal(bad.status, 400);

  const broker = await admin('/api/admin/payers', {
    method: 'POST',
    body: {
      code: 'nemt_broker', name: 'Statewide NEMT Broker', kind: 'broker', parent_code: 'medicaid',
      prior_auth: { emergency: 'not_required', non_emergency: 'required', repetitive: 'required' },
      contact_name: 'Trip reservations', contact_phone: '(800) 555-0100', contact_fax: '(800) 555-0101', contact_email: 'trips@example.org',
    },
  });
  assert.equal(broker.status, 201, JSON.stringify(broker.data));
  assert.equal(broker.data.kind, 'broker');

  // Shown to call takers in the payer list.
  const cfg = (await taker('/api/config')).data;
  assert.ok(cfg.payers.some((p) => p.code === 'nemt_broker' && p.kind === 'broker'));

  // Broker calls get the broker trip number and the Medicaid questions, under the broker's own prior-auth policy.
  const r = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'nemt_broker' } })).data;
  assert.ok(r.visibleCodes.includes('BRK_TRIP_NUMBER'));
  assert.ok(r.visibleCodes.includes('MCD_ELIGIBILITY'));
  assert.equal(r.assessment.payer.kind, 'broker');
  assert.equal(r.assessment.payer.parentName, 'Medicaid');
  assert.equal(r.assessment.payer.priorAuth, 'required');
  assert.equal(r.assessment.payer.contact.fax, '(800) 555-0101');

  // Medicaid calls list the brokers that book for Medicaid.
  const mcd = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicaid' } })).data;
  assert.deepEqual(mcd.assessment.payer.brokers.map((b) => b.name), ['Statewide NEMT Broker']);
  assert.ok(!mcd.visibleCodes.includes('BRK_TRIP_NUMBER'));

  // The parent payer can't be deleted while a broker books for it.
  const medicaid = (await admin('/api/admin/payers')).data.find((p) => p.code === 'medicaid');
  const blocked = await admin(`/api/admin/payers/${medicaid.id}`, { method: 'DELETE' });
  assert.equal(blocked.status, 400);
  assert.equal((await admin(`/api/admin/payers/${broker.data.id}`, { method: 'DELETE' })).status, 204);
});

test('saved calls can be updated by their call taker without creating duplicates', async () => {
  const body = { callType: 'non_emergency', payer: 'medicare', details: { patient_name: 'Update Test' }, answers: { CLN_OXYGEN: 'yes' } };
  const saved = (await taker('/api/calls', { method: 'POST', body })).data;
  const before = (await admin('/api/admin/calls')).data.length;
  const updated = await taker(`/api/calls/${saved.id}`, { method: 'PUT', body: { ...body, answers: { CLN_OXYGEN: 'yes', CLN_VENT: 'yes' } } });
  assert.equal(updated.status, 200);
  assert.equal((await admin('/api/admin/calls')).data.length, before);
  const call = (await admin(`/api/admin/calls/${saved.id}`)).data;
  assert.equal(call.assessment.levelOfService.hcpcs, 'A0434', 'updated call is re-evaluated');
  assert.equal(call.call_taker, 'Jane Doe', 'call taker is kept');
  assert.ok((await admin('/api/admin/audit?action=call.updated')).data.rows.length >= 1);
});

test('PCS form is prefilled from the call', async () => {
  const saved = (await taker('/api/calls', {
    method: 'POST',
    body: {
      callType: 'repetitive', payer: 'medicare',
      details: { patient_name: 'John Smith', patient_dob: '1941-03-02', member_id: '1EG4-TE5-MK73', pickup_location: 'Sunrise SNF', destination: 'Riverside Dialysis', appointment: '2026-10-08T07:30' },
      answers: { TX_REASON: 'ESRD on hemodialysis; bilateral leg contractures', TX_OTHER_MEANS: 'no', BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes', CLN_CONTRACTURES: 'yes', CLN_OXYGEN: 'yes', DOC_PCS: 'yes', DOC_CERTIFIER: 'Dr. Alice Wong, NPI 1234567890' },
    },
  })).data;
  const r = await taker(`/api/calls/${saved.id}/pcs`);
  assert.equal(r.status, 200);
  const pcs = r.data;
  assert.equal(pcs.patient.name, 'John Smith');
  assert.equal(pcs.patient.memberId, '1EG4-TE5-MK73');
  assert.equal(pcs.payer, 'Original Medicare (Part B)');
  assert.equal(pcs.transport.repetitive, true);
  assert.equal(pcs.transport.origin, 'Sunrise SNF');
  assert.equal(pcs.diagnosis, 'ESRD on hemodialysis; bilateral leg contractures');
  assert.equal(pcs.otherMeansContraindicated, true);
  assert.ok(pcs.bedConfinement.length === 3 && pcs.bedConfinement.every((b) => b.checked));
  const checked = pcs.conditions.filter((c) => c.checked).map((c) => c.label);
  assert.deepEqual(checked.sort(), ['Contractures preventing safe seated positioning', 'Requires oxygen that the patient cannot self-administer or manage']);
  assert.ok(pcs.conditions.length > 10, 'all conditions are listed for the practitioner');
  assert.deepEqual(pcs.levelOfService.filter((l) => l.checked).map((l) => l.label), ['Basic Life Support (BLS)']);
  assert.equal(pcs.certifier.name, 'Dr. Alice Wong, NPI 1234567890');
  assert.match(pcs.validity, /60 days/);
  assert.ok((await admin('/api/admin/audit?action=pcs.generated')).data.rows.some((row) => row.entity_id === String(saved.id) && row.username === 'jdoe'));
});

test('PCS notices flag Medicaid forms and payers without necessity review', async () => {
  const mcd = (await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicaid', answers: {} } })).data;
  assert.ok((await taker(`/api/calls/${mcd.id}/pcs`)).data.notices.some((n) => n.includes('state Medicaid')));
  const pp = (await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', payer: 'private_pay', answers: {} } })).data;
  const pcs = (await taker(`/api/calls/${pp.id}/pcs`)).data;
  assert.ok(pcs.notices.some((n) => n.includes('does not require')));
  assert.match(pcs.validity, /48 hours/);
});

test('call takers can only reach their own calls', async () => {
  const mine = (await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', answers: {} } })).data;
  const adminCall = (await admin('/api/calls', { method: 'POST', body: { callType: 'non_emergency', answers: {} } })).data;
  assert.equal((await taker(`/api/calls/${adminCall.id}/pcs`)).status, 404);
  assert.equal((await taker(`/api/calls/${adminCall.id}`, { method: 'PUT', body: { callType: 'non_emergency', answers: {} } })).status, 404);
  assert.equal((await admin(`/api/calls/${mine.id}/pcs`)).status, 200, 'administrators can open any call');
  assert.equal((await taker('/api/calls/999999/pcs')).status, 404);
});

test('calls record an optional secondary payer, shown on the PCS', async () => {
  const saved = (await taker('/api/calls', {
    method: 'POST',
    body: { callType: 'non_emergency', payer: 'medicare', secondaryPayer: 'medicaid', details: { member_id: 'M1', secondary_member_id: 'S2' }, answers: {} },
  })).data;
  const call = (await admin(`/api/admin/calls/${saved.id}`)).data;
  assert.equal(call.payer, 'medicare');
  assert.equal(call.secondary_payer, 'medicaid');
  assert.equal(call.assessment.payer.code, 'medicare', 'the primary payer drives the rules');
  assert.equal((await admin('/api/admin/calls')).data.find((c) => c.id === saved.id).secondary_payer, 'medicaid');
  const pcs = (await taker(`/api/calls/${saved.id}/pcs`)).data;
  assert.equal(pcs.secondaryPayer, 'Medicaid');
  assert.equal(pcs.secondaryMemberId, 'S2');

  const same = await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicare', secondaryPayer: 'medicare', answers: {} } });
  assert.equal(same.status, 400);
  const unknown = await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicare', secondaryPayer: 'nope', answers: {} } });
  assert.equal(unknown.status, 400);
});

test('administrators can set a user password themselves', async () => {
  const weak = await admin('/api/admin/users', { method: 'POST', body: { username: 'asmith', display_name: 'Ann Smith', role: 'call_taker', password: 'short' } });
  assert.equal(weak.status, 400);

  const r = await admin('/api/admin/users', { method: 'POST', body: { username: 'asmith', display_name: 'Ann Smith', role: 'call_taker', password: 'Chosen-pass-2026', must_change_password: false } });
  assert.equal(r.status, 201);
  assert.equal(r.data.temporaryPassword, undefined, 'a typed password is never echoed back');
  const c = client();
  const login = await c('/api/auth/login', { method: 'POST', body: { username: 'asmith', password: 'Chosen-pass-2026' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.must_change_password, false);

  const reset = await admin(`/api/admin/users/${r.data.user.id}/reset-password`, { method: 'POST', body: { password: 'Second-pass-2026' } });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.user.must_change_password, true, 'a change is required unless the admin says otherwise');
  assert.equal((await client()('/api/auth/login', { method: 'POST', body: { username: 'asmith', password: 'Second-pass-2026' } })).status, 200);
});

test('admins build logic flows that change how calls are evaluated', async () => {
  const graph = {
    nodes: [
      { id: 'n1', type: 'question', code: 'BED_GET_UP', x: 0, y: 0 },
      { id: 'n2', type: 'question', code: 'BED_SIT', x: 0, y: 200 },
      { id: 'n3', type: 'outcome', kind: 'alert', value: 'critical', text: 'Rule fired: send a supervisor.', match: 'all', x: 400, y: 100 },
    ],
    edges: [{ from: 'n1', port: 'yes', to: 'n3' }, { from: 'n2', port: 'yes', to: 'n3' }],
  };
  assert.equal((await taker('/api/admin/flows')).status, 403, 'call takers cannot see flows');
  const bad = await admin('/api/admin/flows', { method: 'POST', body: { name: 'Broken', graph: { nodes: [{ id: 'x', type: 'question', code: 'NOPE' }], edges: [] } } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /no longer exists/);

  const created = await admin('/api/admin/flows', { method: 'POST', body: { name: 'Supervisor rule', active: true, graph } });
  assert.equal(created.status, 201);
  const answers = { BED_GET_UP: 'yes', BED_SIT: 'yes' };
  const ev = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicare', answers } })).data;
  assert.ok(ev.assessment.alerts.some((a) => a.text === 'Rule fired: send a supervisor.'));

  // Scoped to another payer: no longer applies to Medicare calls.
  const scoped = await admin(`/api/admin/flows/${created.data.id}`, { method: 'PUT', body: { payers: ['medicaid'] } });
  assert.equal(scoped.status, 200);
  const ev2 = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: 'medicare', answers } })).data;
  assert.ok(!ev2.assessment.alerts.some((a) => a.text === 'Rule fired: send a supervisor.'));

  // A question used in a flow can't be deleted out from under it.
  const custom = (await admin('/api/admin/questions', { method: 'POST', body: { code: 'CUST_FLOW_Q', category: 'Clinical', text: 'Custom flow question?', answer_type: 'yes_no', criterion: 'info' } })).data;
  await admin(`/api/admin/flows/${created.data.id}`, { method: 'PUT', body: { graph: { nodes: [...graph.nodes, { id: 'n4', type: 'question', code: 'CUST_FLOW_Q', x: 0, y: 400 }], edges: graph.edges } } });
  const del = await admin(`/api/admin/questions/${custom.id}`, { method: 'DELETE' });
  assert.equal(del.status, 400);
  assert.match(del.data.error, /Supervisor rule/);

  assert.equal((await admin(`/api/admin/flows/${created.data.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await admin(`/api/admin/questions/${custom.id}`, { method: 'DELETE' })).status, 204);
  const actions = await auditActions();
  for (const a of ['flow.created', 'flow.updated', 'flow.deleted']) assert.ok(actions.includes(a), a);
});

test('call takers save pickup facilities and reuse them', async () => {
  const bad = await taker('/api/facilities', { method: 'POST', body: { name: '', contact_email: 'nope' } });
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /facility name/);
  assert.match(bad.data.error, /valid email/);

  const created = await taker('/api/facilities', { method: 'POST', body: { name: 'Sunrise SNF', address: '12 Oak St, Springfield', phone: '555-0100', contact_name: 'Nurse Joy', contact_email: 'joy@sunrise.example' } });
  assert.equal(created.status, 201);
  const dup = await taker('/api/facilities', { method: 'POST', body: { name: 'sunrise snf' } });
  assert.equal(dup.status, 409, 'names are unique regardless of case');
  assert.equal(dup.data.facility.id, created.data.id);

  const list = (await admin('/api/facilities')).data;
  assert.ok(list.some((f) => f.name === 'Sunrise SNF' && f.address === '12 Oak St, Springfield'), 'saved facilities are shared');

  const upd = await taker(`/api/facilities/${created.data.id}`, { method: 'PUT', body: { phone: '555-0199', active: false } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.phone, '555-0199');
  assert.equal(upd.data.active, true, 'only administrators can remove a facility');
  const actions = await auditActions();
  assert.ok(actions.includes('facility.created') && actions.includes('facility.updated'));
});

test('admins see every facility with usage, and can hide or delete them', async () => {
  const f = (await admin('/api/facilities', { method: 'POST', body: { name: 'Riverside Dialysis', address: '9 River Rd' } })).data;
  await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', details: { facility_id: f.id, caller_facility: f.name }, answers: {} } });
  await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', details: { facility_id: f.id, caller_facility: f.name }, answers: {} } });
  assert.equal((await taker('/api/admin/facilities')).status, 403);
  const row = (await admin('/api/admin/facilities')).data.find((x) => x.id === f.id);
  assert.equal(row.calls, 2);
  assert.ok(row.last_used);

  await admin(`/api/facilities/${f.id}`, { method: 'PUT', body: { active: false } });
  assert.ok(!(await taker('/api/facilities')).data.some((x) => x.id === f.id), 'hidden from call takers');
  assert.ok((await admin('/api/admin/facilities')).data.some((x) => x.id === f.id && !x.active), 'still listed for admins');

  assert.equal((await taker(`/api/admin/facilities/${f.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await admin(`/api/admin/facilities/${f.id}`, { method: 'DELETE' })).status, 204);
  assert.ok(!(await admin('/api/admin/facilities')).data.some((x) => x.id === f.id));
  assert.ok((await auditActions()).includes('facility.deleted'));
});

test('facilities used as a destination count toward usage and print on the PCS', async () => {
  const hosp = (await admin('/api/facilities', { method: 'POST', body: { name: 'Memorial Hospital', address: '1 Hospital Way' } })).data;
  const snf = (await admin('/api/facilities', { method: 'POST', body: { name: 'Oak Manor', address: '5 Oak Ln' } })).data;
  const call = (await taker('/api/calls', { method: 'POST', body: {
    callType: 'non_emergency', answers: {},
    details: { facility_id: snf.id, caller_facility: 'Oak Manor', pickup_location: '5 Oak Ln', destination_facility_id: hosp.id, destination_facility: 'Memorial Hospital', destination: '1 Hospital Way' },
  } })).data;
  // The same facility as pickup and destination counts once for that call.
  await taker('/api/calls', { method: 'POST', body: { callType: 'non_emergency', answers: {}, details: { facility_id: hosp.id, destination_facility_id: hosp.id } } });
  const usage = new Map((await admin('/api/admin/facilities')).data.map((f) => [f.id, f.calls]));
  assert.equal(usage.get(hosp.id), 2);
  assert.equal(usage.get(snf.id), 1);
  const pcs = (await taker(`/api/calls/${call.id}/pcs`)).data;
  assert.equal(pcs.transport.origin, 'Oak Manor, 5 Oak Ln');
  assert.equal(pcs.transport.destination, 'Memorial Hospital, 1 Hospital Way');
});

test('admins import facility lists: preview first, then import; re-import updates instead of duplicating', async () => {
  const rows = [
    { external_id: 'F-100', name: 'Lakeside Rehab', address: '1 Lake Rd, Springfield, IL 62701', phone: '217-555-0400', contact_name: 'Front desk' },
    { external_id: 'F-101', name: 'Hilltop SNF', address: '9 Hill St', contact_email: 'not-an-email' },
    { external_id: 'F-100', name: 'Lakeside Rehab (again)' },
    { name: '' },
  ];
  assert.equal((await taker('/api/admin/import/facilities', { method: 'POST', body: { rows } })).status, 403);
  const before = (await admin('/api/admin/facilities')).data.length;
  const preview = (await admin('/api/admin/import/facilities', { method: 'POST', body: { rows } })).data;
  assert.deepEqual(preview.results.map((r) => r.action), ['create', 'create', 'skip', 'error']);
  assert.match(preview.results[1].warning, /isn’t valid and was left out/);
  assert.equal((await admin('/api/admin/facilities')).data.length, before, 'a preview saves nothing');

  const done = (await admin('/api/admin/import/facilities', { method: 'POST', body: { rows, dryRun: false, fileName: 'facilities.csv' } })).data;
  assert.equal(done.summary.create, 2);
  assert.equal((await admin('/api/admin/facilities')).data.find((f) => f.external_id === 'F-101').contact_email, '', 'the bad email is left out');
  const lake = (await admin('/api/admin/facilities')).data.find((f) => f.external_id === 'F-100');
  assert.equal(lake.address, '1 Lake Rd, Springfield, IL 62701');

  // Re-import with a new phone and a blank address: the phone updates, the address is kept.
  const again = (await admin('/api/admin/import/facilities', { method: 'POST', body: { rows: [{ external_id: 'F-100', name: 'Lakeside Rehab', phone: '217-555-0499', address: '' }], dryRun: false } })).data;
  assert.equal(again.results[0].action, 'update');
  const updated = (await admin('/api/admin/facilities')).data.find((f) => f.external_id === 'F-100');
  assert.equal(updated.phone, '217-555-0499');
  assert.equal(updated.address, '1 Lake Rd, Springfield, IL 62701');
  const skip = (await admin('/api/admin/import/facilities', { method: 'POST', body: { rows: [{ external_id: 'F-100', name: 'Lakeside Rehab', phone: '1' }], update: false } })).data;
  assert.equal(skip.results[0].action, 'skip');
  assert.ok((await auditActions()).includes('facility.imported'));
});

test('admins import payer lists; brokers link to payers in the same file; the necessity rule holds', async () => {
  const rows = [
    { external_id: 'P-9', name: 'Blue Valley Health Plan', type: 'Commercial', contact_phone: '800-555-0100', contact_url: 'bluevalley.example.com' },
    { external_id: 'B-1', name: 'MetroRide NEMT', type: 'Broker', parent: 'Blue Valley Health Plan' },
    { name: 'Medicaid', contact_fax: '800-555-0199' }, // matches the built-in payer by name
    { name: 'Bad Portal Payer', contact_url: 'not a url' },
  ];
  const preview = (await admin('/api/admin/import/payers', { method: 'POST', body: { rows } })).data;
  assert.deepEqual(preview.results.map((r) => r.action), ['create', 'create', 'update', 'create']);
  assert.match(preview.results[3].warning, /isn’t a web address/);
  await admin('/api/admin/import/payers', { method: 'POST', body: { rows, dryRun: false } });
  const list = (await admin('/api/admin/payers')).data;
  const plan = list.find((p) => p.external_id === 'P-9');
  const broker = list.find((p) => p.external_id === 'B-1');
  assert.equal(plan.contact_url, 'https://bluevalley.example.com');
  assert.equal(plan.requires_medical_necessity, true);
  assert.equal(broker.kind, 'broker');
  assert.equal(broker.parent_code, plan.code);
  assert.equal(list.find((p) => p.code === 'medicaid').contact_fax, '800-555-0199');
  // Imported payers show up for call takers and get the necessity questions.
  const ev = (await taker('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', payer: plan.code, allQuestions: true } })).data;
  assert.ok(ev.visibleCodes.includes('BED_GET_UP'));
  assert.ok((await auditActions()).includes('payer.imported'));
});

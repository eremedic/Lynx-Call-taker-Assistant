import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { openDb } from '../server/db.js';

let server;
let base;
let cookie = '';

const req = async (path, { method = 'GET', body, auth = false } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null };
};

before(async () => {
  const app = createApp({ db: openDb(':memory:'), adminPassword: 'test-pass' });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('admin endpoints require login', async () => {
  assert.equal((await req('/api/admin/questions')).status, 401);
  assert.equal((await req('/api/admin/login', { method: 'POST', body: { password: 'wrong' } })).status, 401);
  const ok = await req('/api/admin/login', { method: 'POST', body: { password: 'test-pass' } });
  assert.equal(ok.status, 200);
  cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('/api/admin/questions', { auth: true })).status, 200);
});

test('admin can add a custom question that the console then prompts', async () => {
  const created = await req('/api/admin/questions', {
    method: 'POST',
    auth: true,
    body: {
      code: 'CLN_SEIZURE', category: 'Clinical Condition', text: 'Has the patient had a seizure in the last 24 hours?',
      answer_type: 'yes_no', criterion: 'condition', qualifying_answer: 'yes', priority: 1, required: true,
      triggers: ['seizure'], detect_yes: ['had a seizure'],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.is_system, false);

  const dup = await req('/api/admin/questions', { method: 'POST', auth: true, body: { ...created.data } });
  assert.equal(dup.status, 400);

  const quiet = await req('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', transcript: '' } });
  assert.ok(!quiet.data.visibleCodes.includes('CLN_SEIZURE'));
  const heard = await req('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', transcript: 'he had a seizure this morning' } });
  assert.ok(heard.data.visibleCodes.includes('CLN_SEIZURE'));
  assert.equal(heard.data.suggestions.CLN_SEIZURE.answer, 'yes');

  const answered = await req('/api/evaluate', { method: 'POST', body: { callType: 'non_emergency', answers: { CLN_SEIZURE: 'yes' } } });
  assert.ok(answered.data.assessment.supporting.some((s) => s.code === 'CLN_SEIZURE'));

  assert.equal((await req(`/api/admin/questions/${created.data.id}`, { method: 'DELETE', auth: true })).status, 204);
});

test('built-in questions can be deactivated but not deleted', async () => {
  const list = (await req('/api/admin/questions', { auth: true })).data;
  const sys = list.find((q) => q.code === 'CLN_BARIATRIC');
  assert.equal((await req(`/api/admin/questions/${sys.id}`, { method: 'DELETE', auth: true })).status, 400);
  const off = await req(`/api/admin/questions/${sys.id}`, { method: 'PUT', auth: true, body: { active: false, code: 'RENAMED' } });
  assert.equal(off.data.active, false);
  assert.equal(off.data.code, 'CLN_BARIATRIC');
  const active = (await req('/api/questions')).data;
  assert.ok(!active.some((q) => q.code === 'CLN_BARIATRIC'));
});

test('saving a call re-evaluates on the server and appears in the log', async () => {
  const saved = await req('/api/calls', {
    method: 'POST',
    body: { callType: 'non_emergency', details: { patient_name: 'Test Patient' }, answers: { CLN_VENT: 'yes' }, transcript: 'on the vent' },
  });
  assert.equal(saved.status, 201);
  const call = (await req(`/api/admin/calls/${saved.data.id}`, { auth: true })).data;
  assert.equal(call.assessment.levelOfService.hcpcs, 'A0434');
  const log = (await req('/api/admin/calls', { auth: true })).data;
  assert.equal(log[0].details.patient_name, 'Test Patient');
});

test('AI endpoint reports when it is unavailable', async () => {
  const r = await req('/api/ai/analyze', { method: 'POST', body: { transcript: 'hello' } });
  if (!process.env.ANTHROPIC_API_KEY) assert.equal(r.status, 503);
});

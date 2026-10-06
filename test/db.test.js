import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, migrate, questionRepo, payerRepo, settingsRepo, lockoutRepo } from '../server/db.js';
import { createApp, ensureInitialAdmin } from '../server/app.js';
import { createHandler } from '../netlify/functions/api.mjs';

test('setup is idempotent, safe to run concurrently, and data persists', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambuintake-'));
  try {
    let db = await openDb({ dataDir: dir });
    await Promise.all([migrate(db), migrate(db)]); // e.g. two function containers starting at once
    assert.equal((await questionRepo(db).list()).length, 41);
    assert.equal((await payerRepo(db).list()).length, 6);
    assert.equal((await settingsRepo(db).all()).seed_version, '3');
    await settingsRepo(db).set('org_name', 'Metro EMS');
    await db.close();

    db = await openDb({ dataDir: dir });
    assert.equal((await settingsRepo(db).all()).org_name, 'Metro EMS');
    assert.equal((await questionRepo(db).list()).length, 41, 'no duplicate seeding');
    await db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tables live in their own schema with row-level security enabled', async () => {
  const db = await openDb({ memory: true });
  const tables = await db.query(`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'ambuintake' ORDER BY tablename`);
  assert.deepEqual(tables.map((t) => t.tablename),
    ['audit_log', 'calls', 'login_attempts', 'payers', 'questions', 'sessions', 'settings', 'users']);
  assert.ok(tables.every((t) => t.rowsecurity), 'RLS is on for every table');
  const leaked = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  assert.deepEqual(leaked, [], 'nothing is created in the public schema');
  await db.close();
});

test('lockout is shared through the database and expires', async () => {
  const db = await openDb({ memory: true });
  const a = lockoutRepo(db);
  const b = lockoutRepo(db); // a second server instance
  for (let i = 0; i < 4; i++) assert.equal(await a.fail('Pat'), false);
  assert.equal(await b.fail('pat'), true, 'failures from other instances count');
  assert.equal(await a.isLocked('PAT'), true);
  await db.query(`UPDATE ambuintake.login_attempts SET locked_until = $1`, [Date.now() - 1]);
  assert.equal(await a.isLocked('pat'), false);
  assert.equal(await a.fail('pat'), false, 'an expired lock starts a fresh count');
  await db.close();
});

// Netlify invokes the function with a Lambda-style event.
const event = (method, p, { body, cookie } = {}) => ({
  httpMethod: method,
  path: p,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  multiValueHeaders: {},
  queryStringParameters: {},
  body: body ? JSON.stringify(body) : null,
  isBase64Encoded: false,
});

test('Netlify function handler serves the API through the /api rewrite', async () => {
  const db = await openDb({ memory: true });
  await ensureInitialAdmin(db, { username: 'admin', password: 'Temp-first-1' });
  const handler = createHandler(async () => db);

  const login = await handler(event('POST', '/api/auth/login', { body: { username: 'admin', password: 'Temp-first-1' } }), {});
  assert.equal(login.statusCode, 200);
  const setCookie = login.multiValueHeaders?.['set-cookie']?.[0] || login.headers?.['set-cookie'];
  assert.match(setCookie, /ambuintake_session=/);
  const cookie = setCookie.split(';')[0];

  // Both path forms Netlify may pass for a rewritten request work.
  for (const p of ['/api/auth/session', '/.netlify/functions/api/auth/session']) {
    const r = await handler(event('GET', p, { cookie }), {});
    assert.equal(r.statusCode, 200, p);
    assert.equal(JSON.parse(r.body).user.username, 'admin');
  }
  const pages = await handler(event('GET', '/index.html'), {});
  assert.equal(pages.statusCode, 404, 'pages are served by Netlify, not the function');
  await db.close();
});

test('Netlify function reports a missing database clearly', async () => {
  const handler = createHandler(async () => { throw new Error('DATABASE_URL is not set'); });
  const r = await handler(event('GET', '/api/public-config'), {});
  assert.equal(r.statusCode, 503);
  assert.match(JSON.parse(r.body).error, /DATABASE_URL/);
});

test('Postgres settings: TLS for Supabase, sslmode removed, optional CA verification', async () => {
  const { postgresConfig } = await import('../server/db/client.js');
  const remote = postgresConfig('postgresql://postgres.abc:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require', {});
  assert.doesNotMatch(remote.connectionString, /sslmode/);
  assert.match(remote.connectionString, /p%40ss@/, 'encoded passwords are preserved');
  assert.deepEqual(remote.ssl, { rejectUnauthorized: false });

  const verified = postgresConfig('postgresql://u:p@db.abc.supabase.co:5432/postgres', { DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\\nMIIB\\n-----END CERTIFICATE-----' });
  assert.equal(verified.ssl.rejectUnauthorized, true);
  assert.match(verified.ssl.ca, /BEGIN CERTIFICATE-----\nMIIB/, 'escaped newlines in the env var are restored');

  assert.equal(postgresConfig('postgresql://u:p@localhost:5432/db', {}).ssl, false);
  assert.equal(postgresConfig('postgresql://u:p@db.example.com/db?sslmode=disable', {}).ssl, false);
});

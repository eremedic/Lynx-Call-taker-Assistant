import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDatabaseUrl, explainDatabaseError, diagnose } from '../server/health.js';
import { isStaleConnectionError } from '../server/db/client.js';
import { openDb } from '../server/db.js';
import { ensureInitialAdmin } from '../server/app.js';
import { createHandler } from '../netlify/functions/api.mjs';

const POOLER = 'postgresql://postgres.abcdefgh:S3cret-pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

test('DATABASE_URL problems are explained', () => {
  assert.equal(describeDatabaseUrl(POOLER).ok, true);
  assert.match(describeDatabaseUrl('').detail, /Not set/);
  assert.match(describeDatabaseUrl(POOLER.replace('S3cret-pass', '[YOUR-PASSWORD]')).detail, /placeholder/);
  assert.match(describeDatabaseUrl('postgresql://postgres:pass@db.abcdefgh.supabase.co:5432/postgres').detail, /Direct connection/);
  assert.match(describeDatabaseUrl(POOLER.replace('postgres.abcdefgh', 'postgres')).detail, /postgres\.<project-ref>/);
  assert.match(describeDatabaseUrl('postgresql://postgres.abc:p@ss#word@aws-0-us-east-1.pooler.supabase.com:6543/postgres').detail, /URL-encod/);
  assert.match(describeDatabaseUrl('https://example.com').detail, /postgresql:\/\//);
  assert.equal(describeDatabaseUrl(POOLER.replace(':6543', ':5432')).warn, true);
});

test('database errors get a plain-language fix', () => {
  assert.match(explainDatabaseError({ code: '28P01', message: 'password authentication failed for user "x"' }), /Wrong database password/);
  assert.match(explainDatabaseError({ message: 'Tenant or user not found' }), /postgres\.<project-ref>/);
  assert.match(explainDatabaseError({ code: 'ENOTFOUND' }), /host name/);
  assert.match(explainDatabaseError({ message: 'timeout expired' }), /paused/);
});

test('stale serverless connections are recognized for a retry', () => {
  assert.equal(isStaleConnectionError({ code: 'ECONNRESET' }), true);
  assert.equal(isStaleConnectionError({ message: 'Connection terminated unexpectedly' }), true);
  assert.equal(isStaleConnectionError({ code: '23505', message: 'duplicate key' }), false);
});

test('self-check reports a healthy local database', async () => {
  const db = await openDb({ memory: true });
  await ensureInitialAdmin(db, { username: 'admin', password: 'Temp-first-1' });
  const r = await diagnose({ env: {}, db });
  assert.equal(r.ok, true, JSON.stringify(r.checks));
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.match(byName['Database tables'].detail, /41 questions, 6 payers/);
  assert.equal(byName['Administrator account'].ok, true);
  await db.close();
});

test('self-check on Netlify flags a missing DATABASE_URL and settings, without connecting', async () => {
  const r = await diagnose({ env: {}, runtime: 'netlify', connect: () => { throw new Error('should not connect'); } });
  assert.equal(r.ok, false);
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(byName.DATABASE_URL.ok, false);
  assert.match(byName['Database connection'].detail, /Skipped/);
  assert.equal(byName.COOKIE_SECURE.warn, true);
});

test('self-check never reveals the password, user or host', async () => {
  const env = { DATABASE_URL: POOLER, COOKIE_SECURE: 'true', TRUST_PROXY: 'true' };
  const r = await diagnose({ env, runtime: 'netlify', connect: async () => { throw Object.assign(new Error('password authentication failed for user "postgres.abcdefgh" at aws-0-us-east-1.pooler.supabase.com (S3cret-pass)'), { code: '28P01' }); } });
  const text = JSON.stringify(r);
  for (const secret of ['S3cret-pass', 'postgres.abcdefgh', 'aws-0-us-east-1.pooler.supabase.com']) assert.ok(!text.includes(secret), secret);
  assert.match(text, /Wrong database password/);
});

const event = (method, p) => ({ httpMethod: method, path: p, headers: {}, multiValueHeaders: {}, queryStringParameters: {}, body: null, isBase64Encoded: false });

test('the Netlify function answers /api/health even when the database is broken', async () => {
  const handler = createHandler(async () => { throw new Error('should not be called for health'); }, {
    checkHealth: () => diagnose({ env: {}, runtime: 'netlify' }),
  });
  for (const p of ['/api/health', '/.netlify/functions/api/health']) {
    const r = await handler(event('GET', p), {});
    assert.equal(r.statusCode, 200);
    assert.equal(JSON.parse(r.body).ok, false);
  }
});

test('startup failures explain the fix', async () => {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = POOLER;
  try {
    const handler = createHandler(async () => { throw Object.assign(new Error('password authentication failed'), { code: '28P01' }); });
    const r = await handler(event('GET', '/api/public-config'), {});
    assert.equal(r.statusCode, 503);
    assert.match(JSON.parse(r.body).error, /Wrong database password.*status\.html/);
  } finally {
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
  }
});

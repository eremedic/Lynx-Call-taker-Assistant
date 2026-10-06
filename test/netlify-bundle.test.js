// Netlify bundles functions with esbuild into CommonJS. This builds the
// function the same way and runs it, so code that only works as an ES module
// (such as import.meta) is caught before deploying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { openDb } from '../server/db.js';
import { ensureInitialAdmin } from '../server/app.js';

const event = (method, p, { body, cookie } = {}) => ({
  httpMethod: method,
  path: p,
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  multiValueHeaders: {},
  queryStringParameters: {},
  body: body ? JSON.stringify(body) : null,
  isBase64Encoded: false,
});

test('the function works when bundled as CommonJS, as Netlify does', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambuintake-fn-'));
  try {
    const outfile = path.join(dir, 'api.js');
    const result = await build({
      entryPoints: ['netlify/functions/api.mjs'],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      outfile,
      external: ['pg-native'],
      logLevel: 'silent',
    });
    assert.deepEqual(result.warnings.map((w) => w.text), [], 'no bundling warnings');

    const fn = createRequire(import.meta.url)(outfile); // throws if the module crashes on load

    // Without DATABASE_URL: a clear JSON error, not a crash.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const missing = await fn.handler(event('GET', '/.netlify/functions/api/public-config'), {});
    if (saved !== undefined) process.env.DATABASE_URL = saved;
    assert.equal(missing.statusCode, 503);
    assert.match(JSON.parse(missing.body).error, /DATABASE_URL/);

    // With a database: sign in and use the API through the bundled code.
    const db = await openDb({ memory: true });
    await ensureInitialAdmin(db, { username: 'admin', password: 'Temp-first-1' });
    const handler = fn.createHandler(async () => db);
    const login = await handler(event('POST', '/.netlify/functions/api/auth/login', { body: { username: 'admin', password: 'Temp-first-1' } }), {});
    assert.equal(login.statusCode, 200, login.body);
    const cookie = (login.headers['set-cookie'] || login.multiValueHeaders?.['set-cookie']?.[0]).split(';')[0];
    const session = await handler(event('GET', '/api/auth/session', { cookie }), {});
    assert.equal(JSON.parse(session.body).user.username, 'admin');
    await db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

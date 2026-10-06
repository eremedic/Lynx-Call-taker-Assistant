// Builds the Netlify function the way Netlify packages modern (v2)
// functions — a single esbuild ES-module bundle — and drives it with web
// Requests, so packaging problems are caught before deploying.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { openDb } from '../server/db.js';
import { ensureInitialAdmin } from '../server/app.js';
import { requestToEvent, resultToResponse } from '../netlify/functions/api.mjs';

test('the bundled function loads and answers through its web Request handler', async () => {
  // Inside the project so the bundle can resolve node_modules (pg-native stays external).
  const dir = fs.mkdtempSync(path.join(process.cwd(), '.bundle-test-'));
  try {
    const outfile = path.join(dir, 'api.mjs');
    const result = await build({
      entryPoints: ['netlify/functions/api.mjs'],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node18',
      outfile,
      external: ['pg-native'],
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
      logLevel: 'silent',
    });
    assert.deepEqual(result.warnings.map((w) => w.text), [], 'no bundling warnings');

    const fn = await import(pathToFileURL(outfile).href); // throws if the module crashes on load
    assert.equal(typeof fn.default, 'function', 'v2 default export');
    assert.equal(fn.config.path, '/api/*', 'routes /api/* to the function');

    // Without DATABASE_URL: a clear JSON error, not a crash.
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const res = await fn.default(new Request('https://example.netlify.app/api/public-config'), { ip: '203.0.113.9' });
      assert.equal(res.status, 503);
      assert.match((await res.json()).error, /DATABASE_URL/);

      const health = await fn.default(new Request('https://example.netlify.app/api/health'), {});
      assert.equal(health.status, 200);
      assert.equal((await health.json()).ok, false);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the Request/Response adapter carries method, path, query, body, cookies and client IP', async () => {
  const db = await openDb({ memory: true });
  await ensureInitialAdmin(db, { username: 'admin', password: 'Temp-first-1' });
  const { createHandler } = await import('../netlify/functions/api.mjs');
  const handleEvent = createHandler(async () => db);
  const call = async (request) => resultToResponse(await handleEvent(await requestToEvent(request, { ip: '198.51.100.20' }), {}));

  const login = await call(new Request('https://x.netlify.app/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Temp-first-1' }),
  }));
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /ambuintake_session=.*HttpOnly/);
  const cookie = setCookie.split(';')[0];

  const changed = await call(new Request('https://x.netlify.app/api/auth/change-password', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ currentPassword: 'Temp-first-1', newPassword: 'Adapter-ok-2026' }),
  }));
  assert.equal(changed.status, 200);

  const audit = await call(new Request('https://x.netlify.app/api/admin/audit?action=auth.login&limit=5', { headers: { cookie } }));
  assert.equal(audit.status, 200);
  const rows = (await audit.json()).rows;
  assert.ok(rows.length >= 1 && rows.every((r) => r.action === 'auth.login'), 'query string reached the app');

  const csv = await call(new Request('https://x.netlify.app/api/admin/audit/export.csv', { headers: { cookie } }));
  assert.match(csv.headers.get('content-type'), /text\/csv/);

  const logout = await call(new Request('https://x.netlify.app/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', cookie } }));
  assert.equal(logout.status, 200);
  await db.close();
});

test('the adapter records the client IP from Netlify', async () => {
  const event = await requestToEvent(new Request('https://x.netlify.app/api/health'), { ip: '192.0.2.44' });
  assert.equal(event.headers['x-nf-client-connection-ip'], '192.0.2.44');
  assert.equal(event.path, '/api/health');
  const empty = resultToResponse({ statusCode: 204, headers: { 'x-a': '1' }, body: '' });
  assert.equal(empty.status, 204);
});

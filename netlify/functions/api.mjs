// Netlify Function serving AmbuIntake's API (/api/* is routed here by
// netlify.toml). Netlify serves the pages in public/ directly.
//
// Note: Netlify bundles this as CommonJS, so nothing reachable from here may
// use import.meta or top-level await (test/netlify-bundle.test.js checks).
import serverless from 'serverless-http';
import { createApp, ensureInitialAdmin } from '../../server/app.js';
import { openDb } from '../../server/db.js';
import { connectPostgres } from '../../server/db/client.js';
import { diagnose, describeDatabaseUrl, explainDatabaseError } from '../../server/health.js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

const isHealthCheck = (event) => /\/(api|\.netlify\/functions\/api)\/health\/?$/.test(event?.path || '');

// Builds a handler around a database factory. Exported for tests.
export function createHandler(connect, { checkHealth = (env) => diagnose({ env, runtime: 'netlify', connect: () => connectPostgres(env.DATABASE_URL) }) } = {}) {
  let ready = null; // reused while the function container stays warm

  const init = async () => {
    const db = await connect();
    const initial = await ensureInitialAdmin(db);
    if (initial) {
      console.log(`[AmbuIntake] First administrator "${initial.username}" created.${initial.password
        ? ` Temporary password: ${initial.password} (set ADMIN_PASSWORD to choose it yourself).`
        : ' Use ADMIN_PASSWORD to sign in.'} A new password is required at first sign-in.`);
    }
    return serverless(createApp({ db }));
  };

  return async (event, context) => {
    if (context) context.callbackWaitsForEmptyEventLoop = false;

    // The self-check works even when the database can't be reached.
    if (isHealthCheck(event)) {
      try {
        return json(200, await checkHealth(process.env));
      } catch (err) {
        console.error('[AmbuIntake] Health check failed:', err);
        return json(200, { ok: false, checks: [{ name: 'Health check', ok: false, detail: 'The self-check itself failed. See Netlify → Logs → Functions → api.' }] });
      }
    }

    ready ??= init().catch((err) => {
      ready = null; // retry on the next request
      throw err;
    });
    let handle;
    try {
      handle = await ready;
    } catch (err) {
      console.error('[AmbuIntake] Startup failed:', err);
      const urlCheck = describeDatabaseUrl(process.env.DATABASE_URL);
      const hint = urlCheck.ok ? explainDatabaseError(err) : `DATABASE_URL: ${urlCheck.detail}`;
      return json(503, { error: `AmbuIntake can't reach its database. ${hint} Open /status.html for a full check.`, code: 'DATABASE_UNAVAILABLE' });
    }
    return handle(event, context);
  };
}

export const handler = createHandler(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return openDb();
});

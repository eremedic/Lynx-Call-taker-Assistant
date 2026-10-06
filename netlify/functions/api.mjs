// Netlify Function serving AmbuIntake's API (/api/* is routed here by
// netlify.toml). Netlify serves the pages in public/ directly.
import serverless from 'serverless-http';
import { createApp, ensureInitialAdmin } from '../../server/app.js';
import { openDb } from '../../server/db.js';

// Builds a handler around a database factory. Exported for tests.
export function createHandler(connect) {
  let ready = null; // reused while the function container stays warm

  const init = async () => {
    const db = await connect();
    const initial = await ensureInitialAdmin(db);
    if (initial) {
      console.log(`[AmbuIntake] First administrator "${initial.username}" created.${initial.password
        ? ` Temporary password: ${initial.password} (set ADMIN_PASSWORD to choose it yourself).`
        : ' Use ADMIN_PASSWORD to sign in.'} A new password is required at first sign-in.`);
    }
    return serverless(createApp({ db, serveStatic: false }));
  };

  return async (event, context) => {
    if (context) context.callbackWaitsForEmptyEventLoop = false;
    ready ??= init().catch((err) => {
      ready = null; // retry on the next request
      throw err;
    });
    let handle;
    try {
      handle = await ready;
    } catch (err) {
      console.error('[AmbuIntake] Startup failed:', err.message);
      return {
        statusCode: 503,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ error: 'AmbuIntake cannot reach its database. Check DATABASE_URL in Netlify and try again.' }),
      };
    }
    return handle(event, context);
  };
}

export const handler = createHandler(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Add your Supabase connection string in Netlify → Site configuration → Environment variables.');
  return openDb();
});

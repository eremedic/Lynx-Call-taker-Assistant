// Netlify Function (modern "v2" format) serving AmbuIntake's API at /api/*.
// Netlify serves the pages in public/ directly.
//
// The app is an Express server; Netlify hands this function a standard web
// Request. The adapter below turns it into the event shape serverless-http
// understands and turns the result back into a web Response.
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

// Builds an event handler around a database factory. Exported for tests.
export function createHandler(connect, { checkHealth = (env) => diagnose({ env, runtime: 'netlify', connect: () => connectPostgres(env.DATABASE_URL) }) } = {}) {
  let ready = null; // reused while the function instance stays warm

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

  return async (event, context = {}) => {
    context.callbackWaitsForEmptyEventLoop = false;

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

// Web Request -> Lambda-style event.
export async function requestToEvent(request, context = {}) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers);
  if (context.ip && !headers['x-nf-client-connection-ip']) headers['x-nf-client-connection-ip'] = context.ip;
  const query = {};
  const multiQuery = {};
  for (const [k, v] of url.searchParams) {
    query[k] = v;
    (multiQuery[k] ??= []).push(v);
  }
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  return {
    httpMethod: request.method,
    path: url.pathname,
    headers,
    multiValueHeaders: {},
    queryStringParameters: query,
    multiValueQueryStringParameters: multiQuery,
    body: hasBody ? await request.text() : null,
    isBase64Encoded: false,
  };
}

// Lambda-style result -> web Response.
export function resultToResponse(result) {
  const headers = new Headers();
  const multi = result.multiValueHeaders || {};
  for (const [key, values] of Object.entries(multi)) {
    for (const v of [].concat(values)) headers.append(key, String(v));
  }
  for (const [key, value] of Object.entries(result.headers || {})) {
    if (key in multi) continue;
    for (const v of [].concat(value)) headers.append(key, String(v));
  }
  const status = result.statusCode || 200;
  let body = result.body ?? null;
  if (body !== null && result.isBase64Encoded) body = Buffer.from(body, 'base64');
  if (status === 204 || status === 304) body = null;
  return new Response(body, { status, headers });
}

const handleEvent = createHandler(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  return openDb();
});

export default async (request, context) => resultToResponse(await handleEvent(await requestToEvent(request, context), {}));

export const config = { path: '/api/*' };

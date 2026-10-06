// Self-check behind /api/health and the /status.html page. It explains in
// plain language what is wrong with a deployment (missing settings, a bad
// Supabase connection string, an unreachable database) without revealing
// secrets. It works even when the database can't be reached.

const SCHEMA = 'ambuintake';

// Looks at DATABASE_URL without connecting. Never returns the password.
export function describeDatabaseUrl(url) {
  if (!url) {
    return { ok: false, detail: 'Not set. Add your Supabase connection string as DATABASE_URL in Netlify → Site configuration → Environment variables, then redeploy.' };
  }
  if (/\[YOUR-PASSWORD\]|\[password\]/i.test(url)) {
    return { ok: false, detail: 'Still contains the [YOUR-PASSWORD] placeholder. Replace it (including the brackets) with your database password.' };
  }
  // Unencoded @ or # in the password silently corrupts the address.
  const afterScheme = url.trim().split('://')[1] || '';
  if ((afterScheme.match(/@/g) || []).length > 1 || afterScheme.includes('#')) {
    return { ok: false, detail: 'The password seems to contain @ or # without URL-encoding, which breaks the address. Encode them (@ → %40, # → %23) or reset the database password to letters and numbers.' };
  }
  let u;
  try {
    u = new URL(url.trim());
  } catch {
    return { ok: false, detail: 'Not a valid connection string. If your database password contains symbols such as @ : / # ? %, URL-encode them (e.g. @ → %40) or reset the password to letters and numbers.' };
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) {
    return { ok: false, detail: `Must start with postgresql:// (it starts with ${u.protocol}//). Copy it from Supabase → Connect.` };
  }
  if (url !== url.trim()) {
    return { ok: false, detail: 'Has spaces or a line break at the start or end. Re-paste it without them.' };
  }
  const host = u.hostname;
  const port = u.port || '5432';
  const pooler = /\.pooler\.supabase\.com$/i.test(host);
  const direct = /^db\.[a-z0-9]+\.supabase\.co$/i.test(host);
  if (direct) {
    return { ok: false, detail: 'Uses Supabase\'s Direct connection (db.<project>.supabase.co), which Netlify can\'t reach. In Supabase → Connect, copy the "Transaction pooler" string instead (port 6543).' };
  }
  if (pooler && !decodeURIComponent(u.username).startsWith('postgres.')) {
    return { ok: false, detail: 'For the Supabase pooler the user name must look like postgres.<project-ref>. Copy the Transaction pooler string from Supabase → Connect again.' };
  }
  if ((pooler || /supabase\.(co|com)$/i.test(host)) && !u.password) {
    return { ok: false, detail: 'Has no password. Put your database password after the user name: postgresql://postgres.<ref>:PASSWORD@…' };
  }
  if (pooler && port === '5432') {
    return { ok: true, warn: true, detail: 'Supabase pooler in Session mode (port 5432). It works, but the Transaction pooler (port 6543) is recommended for Netlify.' };
  }
  return { ok: true, detail: pooler ? `Supabase Transaction pooler, port ${port}.` : `Postgres server ${host}, port ${port}.` };
}

// Turns a connection error into a plain-language fix.
export function explainDatabaseError(err) {
  const code = err?.code || '';
  const msg = String(err?.message || err || '');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'The database host name was not found. Check the host part of DATABASE_URL (copy the Transaction pooler string from Supabase → Connect).';
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH') return 'The database host can\'t be reached from Netlify. Use the Supabase Transaction pooler string (port 6543), not the Direct connection.';
  if (code === 'ECONNREFUSED') return 'The database refused the connection. Check the port in DATABASE_URL (6543 for the Transaction pooler).';
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'Wrong database password. Reset it in Supabase → Project Settings → Database, update DATABASE_URL, and redeploy. URL-encode symbols in the password (e.g. @ → %40).';
  if (/tenant or user not found/i.test(msg)) return 'Supabase did not recognize the user. With the pooler, the user name must be postgres.<project-ref> exactly as shown in Supabase → Connect.';
  if (code === '3D000') return 'That database does not exist. The connection string should end in /postgres.';
  if (code === '42501') return 'The database user is not allowed to create the AmbuIntake tables. Use the "postgres" user from Supabase → Connect.';
  if (/certificate|self[- ]signed|unable to verify/i.test(msg)) return 'The SSL certificate check failed. Remove DATABASE_CA_CERT or paste Supabase\'s certificate in full.';
  if (/timeout|timed out/i.test(msg) || code === 'ETIMEDOUT') return 'The database did not answer in time. Check that the Supabase project is not paused (Supabase dashboard → your project → Restore), and that DATABASE_URL uses the Transaction pooler.';
  if (/terminated|ECONNRESET|socket hang up/i.test(msg)) return 'The connection to the database was dropped. If this keeps happening, check the Supabase project status.';
  return 'The database returned an error. Check DATABASE_URL and the Supabase project status.';
}

// Removes connection-string parts (user, password, host) from a message.
function scrub(message, url) {
  let out = String(message || '');
  try {
    const u = new URL(url);
    for (const part of [u.password, decodeURIComponent(u.password || ''), u.username, decodeURIComponent(u.username || ''), u.hostname]) {
      if (part && part.length > 2) out = out.split(part).join('•••');
    }
  } catch { /* nothing to scrub */ }
  return out.slice(0, 300);
}

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms / 1000}s`), { code: 'ETIMEDOUT' })), ms)),
]);

// Runs the checks. Pass `db` to reuse an open connection, or `connect` to
// open (and close) a temporary one.
export async function diagnose({ env = process.env, db = null, connect = null, runtime = 'server' } = {}) {
  const checks = [];
  const add = (name, ok, detail, extra = {}) => checks.push({ name, ok, detail, ...extra });

  add('Server', true, `${runtime === 'netlify' ? 'Netlify Function' : 'Server'} is running (Node ${process.versions.node}).`);

  const local = !env.DATABASE_URL && runtime !== 'netlify';
  const urlCheck = local
    ? { ok: true, detail: 'Not set — using the built-in local database (fine for testing; set DATABASE_URL to use Supabase).' }
    : describeDatabaseUrl(env.DATABASE_URL);
  add('DATABASE_URL', urlCheck.ok, urlCheck.detail, urlCheck.warn ? { warn: true } : {});

  let conn = db;
  let opened = false;
  if (!conn && urlCheck.ok && connect) {
    try {
      conn = await withTimeout(connect(), 8000, 'Connecting to the database');
      opened = true;
    } catch (err) {
      add('Database connection', false, explainDatabaseError(err), { error: scrub(err.message, env.DATABASE_URL) });
    }
  }

  if (conn) {
    try {
      await withTimeout(conn.query('SELECT 1'), 8000, 'The database');
      add('Database connection', true, 'Connected.');
      const [{ exists }] = await conn.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '${SCHEMA}' AND table_name = 'settings') AS exists`);
      if (!exists) {
        add('Database tables', false, 'Not created yet. They are created automatically on the first sign-in page load; you can also run supabase/schema.sql and seed.sql in Supabase → SQL Editor.');
      } else {
        const [counts] = await conn.query(`SELECT
          (SELECT COUNT(*)::int FROM ${SCHEMA}.questions) AS questions,
          (SELECT COUNT(*)::int FROM ${SCHEMA}.payers) AS payers,
          (SELECT COUNT(*)::int FROM ${SCHEMA}.users) AS users,
          (SELECT COUNT(*)::int FROM ${SCHEMA}.users WHERE role = 'admin' AND active) AS admins`);
        add('Database tables', counts.questions > 0, counts.questions > 0
          ? `Ready: ${counts.questions} questions, ${counts.payers} payers.`
          : 'Created but empty. Run supabase/seed.sql in Supabase → SQL Editor, or redeploy.');
        add('Administrator account', counts.admins > 0, counts.admins > 0
          ? `${counts.users} user account${counts.users === 1 ? '' : 's'}, ${counts.admins} active administrator${counts.admins === 1 ? '' : 's'}.`
          : env.ADMIN_PASSWORD
            ? 'No administrator yet. It is created on the next page load from ADMIN_USERNAME / ADMIN_PASSWORD.'
            : 'No administrator yet, and ADMIN_PASSWORD is not set. Add ADMIN_PASSWORD in Netlify and redeploy.');
      }
    } catch (err) {
      if (!checks.some((c) => c.name === 'Database connection')) {
        add('Database connection', false, explainDatabaseError(err), { error: scrub(err.message, env.DATABASE_URL) });
      } else {
        add('Database tables', false, explainDatabaseError(err), { error: scrub(err.message, env.DATABASE_URL) });
      }
    } finally {
      if (opened) await conn.close().catch(() => {});
    }
  } else if (!urlCheck.ok) {
    add('Database connection', false, 'Skipped until DATABASE_URL is fixed.');
  }

  if (runtime === 'netlify' || env.DATABASE_URL) {
    add('COOKIE_SECURE', env.COOKIE_SECURE === 'true', env.COOKIE_SECURE === 'true' ? 'Set.' : 'Should be true on Netlify (HTTPS).', { warn: env.COOKIE_SECURE !== 'true' });
    add('TRUST_PROXY', env.TRUST_PROXY === 'true', env.TRUST_PROXY === 'true' ? 'Set.' : 'Should be true on Netlify so the audit log records real IP addresses.', { warn: env.TRUST_PROXY !== 'true' });
  }
  add('AI analysis', true, env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY is set.' : 'Off (ANTHROPIC_API_KEY not set). Optional.', { info: true });

  const ok = checks.every((c) => c.ok || c.warn || c.info);
  return { ok, checks, checkedAt: new Date().toISOString() };
}

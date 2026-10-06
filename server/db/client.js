// A small async interface shared by both database backends:
//   - Postgres via node-postgres (Supabase in production)
//   - PGlite, an embedded Postgres, for local runs, Codespaces and tests
//
// Every backend exposes:
//   query(sql, params) -> rows
//   exec(sql)          -> runs several statements (no parameters)
//   tx(fn)             -> runs fn(client) inside a transaction
//   close()

// ------------------------------------------------------------- Postgres
// Connection settings for node-postgres. TLS is configured explicitly, so
// sslmode is removed from the URL (node-postgres would otherwise reinterpret it).
export function postgresConfig(url, env = process.env) {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get('sslmode');
  parsed.searchParams.delete('sslmode');
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname);
  let ssl = false;
  if (!local && sslmode !== 'disable') {
    // Supabase connections are always encrypted. Provide Supabase's CA
    // certificate (Project Settings → Database → SSL) to also verify the server.
    ssl = env.DATABASE_CA_CERT
      ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true }
      : { rejectUnauthorized: false };
  }
  return { connectionString: parsed.toString(), ssl };
}

// Errors that mean the connection itself was dead (common on serverless
// hosts, where idle connections are dropped while the function sleeps).
// The statement never ran, so it is safe to retry once on a fresh connection.
const STALE_CONNECTION_CODES = new Set(['ECONNRESET', 'EPIPE', '57P01', '08003', '08006']);
export function isStaleConnectionError(err) {
  return STALE_CONNECTION_CODES.has(err?.code)
    || /Connection terminated unexpectedly|Client has encountered a connection error|Connection terminated due to connection timeout/i.test(err?.message || '');
}

export async function connectPostgres(url, { poolSize = Number(process.env.DATABASE_POOL_SIZE) || 3 } = {}) {
  const { default: pg } = await import('pg');
  const { connectionString, ssl } = postgresConfig(url);
  const pool = new pg.Pool({
    connectionString,
    ssl,
    max: poolSize,
    idleTimeoutMillis: 10_000,
    // Fail with a clear error before Netlify's 10-second function limit.
    connectionTimeoutMillis: 7_000,
    query_timeout: 9_000,
  });
  pool.on('error', (err) => console.error('Postgres pool error:', err.message));

  const wrap = (runner) => ({
    async query(sql, params = []) {
      return (await runner.query(sql, params)).rows;
    },
    async exec(sql) {
      await runner.query(sql);
    },
  });
  // Every pooled connection may have gone stale while the function slept, so
  // keep trying fresh connections (each failure discards the dead one).
  const attempts = poolSize + 1;
  const withRetry = (fn) => async (...args) => {
    for (let i = 1; ; i++) {
      try {
        return await fn(...args);
      } catch (err) {
        if (!isStaleConnectionError(err) || i >= attempts) throw err;
      }
    }
  };
  const poolRunner = wrap(pool);

  // Opens a transaction, replacing dead connections if BEGIN fails.
  const begin = async (attempt = 1) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      return client;
    } catch (err) {
      client.release(true);
      if (attempt < attempts && isStaleConnectionError(err)) return begin(attempt + 1);
      throw err;
    }
  };

  return {
    kind: 'postgres',
    query: withRetry(poolRunner.query),
    exec: withRetry(poolRunner.exec),
    async tx(fn) {
      const client = await begin();
      let broken = false;
      try {
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        broken = isStaleConnectionError(err);
        await client.query('ROLLBACK').catch(() => { broken = true; });
        throw err;
      } finally {
        client.release(broken);
      }
    },
    close: () => pool.end(),
  };
}

// --------------------------------------------------------------- PGlite
// dataDir: a folder to keep data in, or omitted for an in-memory database.
export async function connectPglite(dataDir) {
  // Imported by a computed name so serverless bundles (Netlify) don't include
  // the embedded database; it is only used locally and in tests.
  const moduleName = '@electric-sql/pglite';
  const { PGlite } = await import(moduleName);
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;

  const wrap = (runner) => ({
    async query(sql, params = []) {
      return (await runner.query(sql, params)).rows;
    },
    async exec(sql) {
      await runner.exec(sql);
    },
  });

  // PGlite runs one statement at a time, so transactions are serialized.
  let queue = Promise.resolve();
  return {
    kind: 'pglite',
    ...wrap(db),
    tx(fn) {
      const run = queue.then(() => db.transaction((t) => fn(wrap(t))));
      queue = run.catch(() => {});
      return run;
    },
    close: () => db.close(),
  };
}

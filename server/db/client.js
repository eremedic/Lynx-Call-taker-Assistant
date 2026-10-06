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

export async function connectPostgres(url, { poolSize = Number(process.env.DATABASE_POOL_SIZE) || 3 } = {}) {
  const { default: pg } = await import('pg');
  const { connectionString, ssl } = postgresConfig(url);
  const pool = new pg.Pool({ connectionString, ssl, max: poolSize, idleTimeoutMillis: 10_000 });
  pool.on('error', (err) => console.error('Postgres pool error:', err.message));

  const wrap = (runner) => ({
    async query(sql, params = []) {
      return (await runner.query(sql, params)).rows;
    },
    async exec(sql) {
      await runner.query(sql);
    },
  });

  return {
    kind: 'postgres',
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// --------------------------------------------------------------- PGlite
// dataDir: a folder to keep data in, or omitted for an in-memory database.
export async function connectPglite(dataDir) {
  const { PGlite } = await import('@electric-sql/pglite');
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSqlFiles } from '../server/export-sql.js';
import { connectPglite } from '../server/db/client.js';
import { openDb, migrate, questionRepo, payerRepo, settingsRepo } from '../server/db.js';

const files = await buildSqlFiles();

test('supabase/*.sql are up to date (run `npm run db:export-sql` after changing the schema or built-in content)', () => {
  assert.equal(fs.readFileSync('supabase/schema.sql', 'utf8'), files.schema);
  assert.equal(fs.readFileSync('supabase/seed.sql', 'utf8'), files.seed);
});

test('running schema.sql then seed.sql (twice) gives the same database the app builds', async () => {
  const fromSql = await connectPglite();
  for (let i = 0; i < 2; i++) {
    await fromSql.exec(files.schema);
    await fromSql.exec(files.seed);
  }
  await migrate(fromSql); // the app sees setup as complete and changes nothing
  const fromApp = await openDb({ memory: true });

  const strip = (rows) => rows.map(({ id, created_at, updated_at, ...r }) => r);
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort());
  assert.deepEqual(strip(await questionRepo(fromSql).list()), strip(await questionRepo(fromApp).list()));
  assert.deepEqual(strip(await payerRepo(fromSql).list()), strip(await payerRepo(fromApp).list()));
  assert.deepEqual(sorted(await settingsRepo(fromSql).all()), sorted(await settingsRepo(fromApp).all()));
  await fromSql.close();
  await fromApp.close();
});

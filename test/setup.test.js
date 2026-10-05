import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureInitialAdmin } from '../server/app.js';
import { openDb, userRepo } from '../server/db.js';
import { verifyPassword } from '../server/auth.js';

test('the first admin password is reissued at startup until the admin signs in', async () => {
  const db = openDb(':memory:');
  const users = userRepo(db);
  const first = await ensureInitialAdmin(db, { username: 'admin', password: undefined });
  assert.ok(first.password && !first.reissued);

  const second = await ensureInitialAdmin(db, { username: 'admin', password: undefined });
  assert.equal(second.reissued, true);
  assert.notEqual(second.password, first.password);
  const admin = users.getForLogin('admin');
  assert.equal(await verifyPassword(second.password, admin.password_hash), true, 'latest password works');
  assert.equal(await verifyPassword(first.password, admin.password_hash), false, 'old password no longer works');

  // Once the admin has signed in, nothing is reissued.
  users.update(admin.id, { last_login_at: '2026-10-05 12:00:00' });
  assert.equal(await ensureInitialAdmin(db, { username: 'admin', password: undefined }), null);
});

test('nothing is reissued once other accounts exist', async () => {
  const db = openDb(':memory:');
  await ensureInitialAdmin(db, { username: 'admin', password: undefined });
  userRepo(db).create({ username: 'jdoe', display_name: 'Jane', role: 'call_taker', password_hash: 'x' });
  assert.equal(await ensureInitialAdmin(db, { username: 'admin', password: undefined }), null);
});

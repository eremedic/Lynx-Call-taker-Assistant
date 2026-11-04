import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureInitialAdmin } from '../server/app.js';
import { openDb, userRepo } from '../server/db.js';
import { verifyPassword } from '../server/auth.js';

test('first admin: created once; reissued only when asked and only until first sign-in', async () => {
  const db = await openDb({ memory: true });
  const users = userRepo(db);
  const first = await ensureInitialAdmin(db, { username: 'admin', password: undefined });
  assert.ok(first.password && !first.reissued);

  // Serverless starts (no reissue) leave the password alone.
  assert.equal(await ensureInitialAdmin(db, { username: 'admin', password: undefined }), null);
  assert.equal(await verifyPassword(first.password, (await users.getForLogin('admin')).password_hash), true);

  // The local server reissues until the admin has signed in.
  const second = await ensureInitialAdmin(db, { username: 'admin', password: undefined, reissue: true });
  assert.equal(second.reissued, true);
  const admin = await users.getForLogin('admin');
  assert.equal(await verifyPassword(second.password, admin.password_hash), true, 'latest password works');
  assert.equal(await verifyPassword(first.password, admin.password_hash), false, 'old password no longer works');

  await users.update(admin.id, { last_login_at: '2026-10-05 12:00:00' });
  assert.equal(await ensureInitialAdmin(db, { username: 'admin', password: undefined, reissue: true }), null);
  await db.close();
});

test('ADMIN_PASSWORD is used for the first administrator', async () => {
  const db = await openDb({ memory: true });
  const r = await ensureInitialAdmin(db, { username: 'boss', password: 'Chosen-pass-123' });
  assert.equal(r.password, null);
  assert.equal(await verifyPassword('Chosen-pass-123', (await userRepo(db).getForLogin('BOSS')).password_hash), true);
  await db.close();
});

test('ADMIN_RESET gives the administrator ADMIN_PASSWORD once, unlocked', async () => {
  const { lockoutRepo } = await import('../server/db.js');
  const { applyAdminReset } = await import('../server/app.js');
  const db = await openDb({ memory: true });
  await ensureInitialAdmin(db, { username: 'admin', password: 'Lost-forever-2026' });
  const lock = lockoutRepo(db);
  for (let i = 0; i < 5; i++) await lock.fail('admin');
  assert.equal(await lock.isLocked('admin'), true);

  assert.equal(await applyAdminReset(db, {}), null, 'off unless ADMIN_RESET=true');
  assert.match((await applyAdminReset(db, { ADMIN_RESET: 'true' })).error, /ADMIN_PASSWORD/);

  const env = { ADMIN_RESET: 'true', ADMIN_PASSWORD: 'Fresh-start-2026' };
  assert.deepEqual(await applyAdminReset(db, env), { username: 'admin', created: false });
  const users = userRepo(db);
  const admin = await users.getForLogin('admin');
  assert.ok(await verifyPassword('Fresh-start-2026', admin.password_hash));
  assert.equal(admin.must_change_password, true);
  assert.equal(await lock.isLocked('admin'), false, 'lock cleared');

  // After the admin picks a new password, later restarts leave it alone.
  await users.update(admin.id, { password_hash: 'changed', must_change_password: false });
  assert.equal(await applyAdminReset(db, env), null);
  assert.equal((await users.getForLogin('admin')).password_hash, 'changed');

  // A missing account is created.
  assert.deepEqual(await applyAdminReset(db, { ...env, ADMIN_USERNAME: 'boss' }), { username: 'boss', created: true });
  await db.close();
});

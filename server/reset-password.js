// Command-line recovery: issue a new temporary password for an account.
//   npm run reset-password -- <username>
// Uses DATABASE_URL (Supabase) when set, otherwise the local database.
import { openDb, userRepo, sessionRepo, auditRepo, lockoutRepo } from './db.js';
import { hashPassword, generatePassword } from './auth.js';

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}
const db = await openDb();
try {
  const users = userRepo(db);
  const user = await users.getForLogin(username);
  if (!user) {
    const names = (await users.list()).map((u) => u.username).join(', ') || '(none)';
    console.error(`No account named "${username}". Existing accounts: ${names}`);
    process.exitCode = 1;
  } else {
    const password = generatePassword();
    await users.update(user.id, { password_hash: await hashPassword(password), must_change_password: true, active: true });
    await sessionRepo(db).removeForUser(user.id);
    await lockoutRepo(db).clear(user.username);
    await auditRepo(db).log({ user: null, action: 'user.password_reset', entityType: 'user', entityId: user.id, details: { username: user.username, via: 'command line' } });
    console.log(`Temporary password for ${user.username}: ${password}`);
    console.log('The account has been re-activated and unlocked, and must choose a new password at sign-in.');
  }
} finally {
  await db.close();
}

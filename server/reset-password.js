// Command-line recovery: issue a new temporary password for an account.
//   npm run reset-password -- <username>
import { openDb, userRepo, sessionRepo, auditRepo } from './db.js';
import { hashPassword, generatePassword } from './auth.js';

const username = process.argv[2];
if (!username) {
  console.error('Usage: npm run reset-password -- <username>');
  process.exit(1);
}
const db = openDb();
const users = userRepo(db);
const user = users.getForLogin(username);
if (!user) {
  console.error(`No account named "${username}". Existing accounts: ${users.list().map((u) => u.username).join(', ') || '(none)'}`);
  process.exit(1);
}
const password = generatePassword();
users.update(user.id, { password_hash: await hashPassword(password), must_change_password: true, active: true });
sessionRepo(db).removeForUser(user.id);
auditRepo(db).log({ user: null, action: 'user.password_reset', entityType: 'user', entityId: user.id, details: { username: user.username, via: 'command line' } });
console.log(`Temporary password for ${user.username}: ${password}`);
console.log('The account has been re-activated and must choose a new password at sign-in.');

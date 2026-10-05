import { createApp, ensureInitialAdmin } from './app.js';
import { openDb } from './db.js';

const port = Number(process.env.PORT) || 3000;
const db = openDb();

const initial = await ensureInitialAdmin(db);
if (initial) {
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ${initial.reissued ? 'Administrator has not signed in yet: new temporary password issued' : 'First run: administrator account created'}\n`);
  console.log(`    Username: ${initial.username}`);
  console.log(`    Password: ${initial.password ?? '(the value of ADMIN_PASSWORD)'}\n`);
  console.log('  You will be asked to choose a new password at first sign-in.');
  console.log(`  Lost it later? Run: npm run reset-password -- ${initial.username}\n${line}\n`);
}

createApp({ db }).listen(port, () => {
  console.log(`Lynx Call-Taker Assistant running at http://localhost:${port}`);
  console.log(`  Sign in:            http://localhost:${port}/login.html`);
  console.log(`  Call-taker console: http://localhost:${port}/`);
  console.log(`  Admin dashboard:    http://localhost:${port}/admin.html`);
});

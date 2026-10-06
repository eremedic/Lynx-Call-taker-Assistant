// Local / self-hosted server. On Netlify the API runs as a function instead
// (netlify/functions/api.mjs) and Netlify serves the pages.
import { createApp, ensureInitialAdmin } from './app.js';
import { openDb } from './db.js';

const port = Number(process.env.PORT) || 3000;
const db = await openDb();
console.log(process.env.DATABASE_URL
  ? 'Database: Postgres (DATABASE_URL)'
  : `Database: local embedded Postgres in ${process.env.PGLITE_DIR || 'data/pglite'} (set DATABASE_URL to use Supabase)`);

const initial = await ensureInitialAdmin(db, { reissue: true });
if (initial) {
  const line = '='.repeat(64);
  console.log(`\n${line}\n  ${initial.reissued ? 'Administrator has not signed in yet: new temporary password issued' : 'First run: administrator account created'}\n`);
  console.log(`    Username: ${initial.username}`);
  console.log(`    Password: ${initial.password ?? '(the value of ADMIN_PASSWORD)'}\n`);
  console.log('  You will be asked to choose a new password at first sign-in.');
  console.log(`  Lost it later? Run: npm run reset-password -- ${initial.username}\n${line}\n`);
}

createApp({ db }).listen(port, () => {
  console.log(`AmbuIntake running at http://localhost:${port}`);
  console.log(`  Sign in:            http://localhost:${port}/login.html`);
  console.log(`  Call-taker console: http://localhost:${port}/`);
  console.log(`  Admin dashboard:    http://localhost:${port}/admin.html`);
});

// One-time setup against your database (Supabase when DATABASE_URL is set):
// creates the ambuintake schema, seeds the question bank and payers, and
// creates the first administrator from ADMIN_USERNAME / ADMIN_PASSWORD.
//   npm run db:setup
import { openDb } from './db.js';
import { ensureInitialAdmin } from './app.js';

const db = await openDb();
try {
  console.log(process.env.DATABASE_URL ? 'Connected to DATABASE_URL.' : 'No DATABASE_URL set — using the local database in data/pglite.');
  console.log('Schema and built-in content are ready.');
  const initial = await ensureInitialAdmin(db);
  if (initial) {
    console.log(`Administrator "${initial.username}" created. Temporary password: ${initial.password ?? '(the value of ADMIN_PASSWORD)'}`);
    console.log('You will be asked to choose a new password at first sign-in.');
  } else {
    console.log('Users already exist — no administrator was created.');
  }
} finally {
  await db.close();
}

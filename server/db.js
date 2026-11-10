// Postgres storage (Supabase in production, PGlite locally).
//
// All tables live in the "ambuintake" schema so they never collide with other
// tables in your Supabase project and are not exposed through Supabase's
// public Data API. Row-level security is enabled with no policies, so the
// anon/authenticated API keys cannot read them either; the server connects
// as the database owner.

import fs from 'node:fs';
import path from 'node:path';
import { connectPostgres, connectPglite } from './db/client.js';
import { SEED_QUESTIONS } from './seed-questions.js';
import { SEED_PAYERS } from './seed-payers.js';

const S = 'ambuintake';
const NOW = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS')";
const NOW_MS = "to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI:SS.MS')";

const JSON_FIELDS = ['options', 'call_types', 'payers', 'triggers', 'detect_yes', 'detect_no'];
const BOOL_FIELDS = ['required', 'active', 'is_system', 'necessity'];

export const QUESTION_FIELDS = [
  'code', 'category', 'text', 'guidance', 'answer_type', 'options', 'call_types', 'payers', 'criterion', 'qualifying_answer',
  'triggers', 'detect_yes', 'detect_no', 'depends_on_code', 'depends_on_answer', 'priority', 'sort_order', 'required',
  'alert_answer', 'alert_text', 'alert_level', 'active', 'necessity',
];

// Medical-necessity questions are skipped for payers that don't require a
// necessity review. Emergency screening and general information are not.
export function defaultNecessity(q) {
  return q.necessity ?? !['emergency', 'info'].includes(q.criterion || 'info');
}

const DEFAULT_SETTINGS = {
  org_name: 'Your Ambulance Service',
};

// Seed version history:
//   3 - CMS question bank, payer profiles, private/facility pay, brokers
//   4 - secondary payer on calls (schema only)
//   5 - Logic Builder flows (schema only)
//   6 - saved pickup facilities (schema only)
//   7 - only private pay and facility pay may skip the necessity review
//   8 - external IDs on payers and facilities, for imports (schema only)
//   9 - starter Logic Builder flow holding the question bank (calls now ask
//       only questions placed in a flow)
const SEED_VERSION = 9;
const CONTENT_VERSION = 3; // last version that added built-in questions/payers
const MIGRATION_LOCK = 724_310_001;

export const SCHEMA_SQL = `
  CREATE SCHEMA IF NOT EXISTS ${S};

  CREATE TABLE IF NOT EXISTS ${S}.questions (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    text TEXT NOT NULL,
    guidance TEXT DEFAULT '',
    answer_type TEXT NOT NULL DEFAULT 'yes_no',
    options TEXT DEFAULT '[]',
    call_types TEXT DEFAULT '[]',
    payers TEXT DEFAULT '[]',
    criterion TEXT NOT NULL DEFAULT 'info',
    qualifying_answer TEXT,
    triggers TEXT DEFAULT '[]',
    detect_yes TEXT DEFAULT '[]',
    detect_no TEXT DEFAULT '[]',
    depends_on_code TEXT,
    depends_on_answer TEXT,
    priority INTEGER NOT NULL DEFAULT 3,
    sort_order INTEGER NOT NULL DEFAULT 0,
    required BOOLEAN NOT NULL DEFAULT false,
    alert_answer TEXT,
    alert_text TEXT,
    alert_level TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    necessity BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS ${S}.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ${S}.users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'call_taker')),
    password_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON ${S}.users (lower(username));

  CREATE TABLE IF NOT EXISTS ${S}.sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES ${S}.users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL,
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS ${S}.login_attempts (
    username TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    locked_until BIGINT NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ${S}.payers (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'payer',
    parent_code TEXT,
    description TEXT NOT NULL DEFAULT '',
    requires_medical_necessity BOOLEAN NOT NULL DEFAULT true,
    prior_auth TEXT NOT NULL DEFAULT '{}',
    prior_auth_note TEXT NOT NULL DEFAULT '',
    certification TEXT NOT NULL DEFAULT '',
    documentation TEXT NOT NULL DEFAULT '[]',
    alternate_transport TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    contact_fax TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    contact_url TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS ${S}.calls (
    id SERIAL PRIMARY KEY,
    call_type TEXT NOT NULL,
    payer TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    answers TEXT NOT NULL DEFAULT '{}',
    transcript TEXT NOT NULL DEFAULT '',
    assessment TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL,
    level_of_service TEXT,
    call_taker TEXT,
    user_id INTEGER REFERENCES ${S}.users(id),
    created_at TEXT NOT NULL DEFAULT ${NOW}
  );
  ALTER TABLE ${S}.calls ADD COLUMN IF NOT EXISTS secondary_payer TEXT;

  CREATE TABLE IF NOT EXISTS ${S}.audit_log (
    id SERIAL PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT ${NOW_MS},
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    ip TEXT
  );
  CREATE INDEX IF NOT EXISTS audit_log_created ON ${S}.audit_log (created_at);
  CREATE INDEX IF NOT EXISTS audit_log_user ON ${S}.audit_log (user_id);

  CREATE TABLE IF NOT EXISTS ${S}.logic_flows (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    call_types TEXT NOT NULL DEFAULT '[]',
    payers TEXT NOT NULL DEFAULT '[]',
    graph TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );

  CREATE TABLE IF NOT EXISTS ${S}.facilities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_email TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT ${NOW},
    updated_at TEXT NOT NULL DEFAULT ${NOW}
  );
  CREATE UNIQUE INDEX IF NOT EXISTS facilities_name ON ${S}.facilities (lower(name));
  -- The record's ID in another system (e.g. a dispatch/billing export), so
  -- re-importing a list updates the same records.
  ALTER TABLE ${S}.facilities ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';
  ALTER TABLE ${S}.payers ADD COLUMN IF NOT EXISTS external_id TEXT NOT NULL DEFAULT '';

  -- The audit trail is append-only.
  CREATE OR REPLACE FUNCTION ${S}.audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'audit_log is append-only'; END $$;
  DROP TRIGGER IF EXISTS audit_log_append_only ON ${S}.audit_log;
  CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON ${S}.audit_log
    FOR EACH ROW EXECUTE FUNCTION ${S}.audit_log_append_only();

  -- Keep Supabase's public API keys out (the server connects as the owner).
  ALTER TABLE ${S}.questions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.login_attempts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.payers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.calls ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.audit_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.logic_flows ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ${S}.facilities ENABLE ROW LEVEL SECURITY;
  DO $$
  DECLARE r TEXT;
  BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ${S} FROM %I', r);
        EXECUTE format('REVOKE ALL ON SCHEMA ${S} FROM %I', r);
      END IF;
    END LOOP;
  END $$;
`;

// Connects using DATABASE_URL (Supabase) or, without it, a local PGlite
// database in ./data/pglite. Pass { memory: true } for a throwaway database.
export async function openDb({ url = process.env.DATABASE_URL, dataDir, memory = false } = {}) {
  let db;
  if (url && !memory) {
    db = await connectPostgres(url);
  } else {
    const dir = memory ? undefined : (dataDir || process.env.PGLITE_DIR || path.resolve('data/pglite'));
    if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
    db = await connectPglite(dir);
  }
  await migrate(db);
  return db;
}

// Creates the schema and seeds the built-in content. Safe to run on every
// start: it is idempotent and serialized with an advisory lock.
export async function migrate(db) {
  // Fast path: already set up.
  try {
    const [row] = await db.query(`SELECT value FROM ${S}.settings WHERE key = 'seed_version'`);
    if (Number(row?.value) >= SEED_VERSION) return;
  } catch {
    // Schema does not exist yet.
  }

  await db.tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await t.exec(SCHEMA_SQL);
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      await t.query(`INSERT INTO ${S}.settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`, [k, v]);
    }
    const [row] = await t.query(`SELECT value FROM ${S}.settings WHERE key = 'seed_version'`);
    if (Number(row?.value) >= SEED_VERSION) return; // another instance finished first

    if (Number(row?.value || 0) < 7) {
      await t.query(`UPDATE ${S}.payers SET requires_medical_necessity = true
        WHERE NOT requires_medical_necessity AND code NOT IN ('private_pay', 'facility_pay')`);
    }

    if (Number(row?.value || 0) < 9) await addStarterFlow(t);

    // Built-in content is added once; later versions only change the schema.
    if (Number(row?.value || 0) < CONTENT_VERSION) {
      // One statement per table keeps the first start fast on serverless hosts.
      await insertMany(t, 'questions', QUESTION_FIELDS, SEED_QUESTIONS.map((q, i) =>
        ({ ...toRow({ active: true, required: false, priority: 3, ...q, necessity: defaultNecessity(q), sort_order: (i + 1) * 10 }), is_system: true })));
      await insertMany(t, 'payers', PAYER_FIELDS, SEED_PAYERS.map((p, i) =>
        ({ ...payerRow({ active: true, kind: 'payer', requires_medical_necessity: true, ...p, sort_order: (i + 1) * 10 }), is_system: true })));
    }
    await settingsRepo(t).set('seed_version', SEED_VERSION);
  });
}

// Calls ask only the questions placed in a Logic Builder flow. So that calls
// keep working after that change (and on a new install), one starter flow
// holds every question in the bank, laid out in columns by category. Admins
// edit it: remove questions, add lines, or build their own flows instead.
export const STARTER_FLOW_NAME = 'Standard intake questions';
async function addStarterFlow(t) {
  const existing = await t.query(`SELECT id FROM ${S}.logic_flows WHERE name = $1`, [STARTER_FLOW_NAME]);
  if (existing.length) return;
  let qs = await t.query(`SELECT code, category FROM ${S}.questions ORDER BY sort_order, id`);
  if (!qs.length) qs = SEED_QUESTIONS.map((q) => ({ code: q.code, category: q.category }));
  const columns = [...new Set(qs.map((q) => q.category))];
  const rowsInColumn = new Map();
  const nodes = qs.map((q, i) => {
    const col = columns.indexOf(q.category);
    const row = rowsInColumn.get(col) || 0;
    rowsInColumn.set(col, row + 1);
    return { id: `n${i + 1}`, type: 'question', code: q.code, match: 'all', x: col * 300, y: row * 230 };
  });
  await t.query(`INSERT INTO ${S}.logic_flows (name, description, active, graph) VALUES ($1, $2, true, $3)`, [
    STARTER_FLOW_NAME,
    'Every question that was in the question bank. Remove what you don’t want asked, or connect answers to follow-up questions and outcomes.',
    JSON.stringify({ nodes, edges: [] }),
  ]);
}

// Inserts many rows in one statement; columns a row doesn't set use DEFAULT.
// Rows whose code already exists are left as they are.
async function insertMany(db, table, fields, rows) {
  if (!rows.length) return;
  const cols = [...fields.filter((f) => rows.some((r) => f in r)), 'is_system'];
  const params = [];
  const tuples = rows.map((r) => `(${cols.map((c) => (c in r ? `$${params.push(r[c])}` : 'DEFAULT')).join(', ')})`);
  await db.query(`INSERT INTO ${S}.${table} (${cols.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (code) DO NOTHING`, params);
}

// Builds "col = $n" lists and parameter arrays.
function assignments(row, start = 1) {
  const cols = Object.keys(row);
  return { sql: cols.map((c, i) => `${c} = $${i + start}`).join(', '), values: cols.map((c) => row[c]) };
}
function insertParts(row) {
  const cols = Object.keys(row);
  return { cols: cols.join(', '), marks: cols.map((_, i) => `$${i + 1}`).join(', '), values: cols.map((c) => row[c]) };
}

// -------------------------------------------------------------- questions
function rowToQuestion(row) {
  if (!row) return null;
  const q = { ...row };
  for (const f of JSON_FIELDS) q[f] = JSON.parse(row[f] || '[]');
  for (const f of BOOL_FIELDS) q[f] = Boolean(row[f]);
  return q;
}

function toRow(input) {
  const row = {};
  for (const f of QUESTION_FIELDS) {
    if (!(f in input)) continue;
    let v = input[f];
    if (JSON_FIELDS.includes(f)) v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (BOOL_FIELDS.includes(f)) v = Boolean(v);
    else if (v === undefined || v === '') v = null;
    row[f] = v;
  }
  return row;
}

export function questionRepo(db) {
  return {
    async list({ activeOnly = false } = {}) {
      const rows = await db.query(`SELECT * FROM ${S}.questions ${activeOnly ? 'WHERE active' : ''} ORDER BY sort_order, id`);
      return rows.map(rowToQuestion);
    },
    async get(id) {
      return rowToQuestion((await db.query(`SELECT * FROM ${S}.questions WHERE id = $1`, [id]))[0]);
    },
    async getByCode(code) {
      return rowToQuestion((await db.query(`SELECT * FROM ${S}.questions WHERE code = $1`, [String(code ?? '')]))[0]);
    },
    async create(input, { system = false } = {}) {
      const row = toRow({ active: true, required: false, priority: 3, ...input, necessity: defaultNecessity(input) });
      if (row.sort_order == null) {
        const [{ m }] = await db.query(`SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM ${S}.questions`);
        row.sort_order = m + 10;
      }
      row.is_system = system;
      const p = insertParts(row);
      const [created] = await db.query(`INSERT INTO ${S}.questions (${p.cols}) VALUES (${p.marks}) RETURNING *`, p.values);
      return rowToQuestion(created);
    },
    async update(id, input) {
      const row = toRow(input);
      if (Object.keys(row).length) {
        const a = assignments(row);
        await db.query(`UPDATE ${S}.questions SET ${a.sql}, updated_at = ${NOW} WHERE id = $${a.values.length + 1}`, [...a.values, id]);
      }
      return this.get(id);
    },
    async remove(id) {
      return (await db.query(`DELETE FROM ${S}.questions WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
  };
}

// ------------------------------------------------------------------ calls
export function callRepo(db) {
  const parse = (row) => row && {
    ...row,
    details: JSON.parse(row.details),
    answers: JSON.parse(row.answers),
    assessment: JSON.parse(row.assessment),
  };
  const values = ({ callType, payer, secondaryPayer, details, answers, transcript, assessment }) => [
    callType,
    payer || null,
    secondaryPayer || null,
    JSON.stringify(details || {}),
    JSON.stringify(answers || {}),
    transcript || '',
    JSON.stringify(assessment || {}),
    assessment?.status || 'incomplete',
    assessment?.levelOfService?.label || null,
  ];
  return {
    async create(call) {
      const [row] = await db.query(`INSERT INTO ${S}.calls
        (call_type, payer, secondary_payer, details, answers, transcript, assessment, status, level_of_service, call_taker, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [...values(call), call.callTaker || null, call.userId ?? null]);
      return parse(row);
    },
    // Replaces the call's content; the call taker and creation time are kept.
    async update(id, call) {
      const [row] = await db.query(`UPDATE ${S}.calls SET call_type = $1, payer = $2, secondary_payer = $3, details = $4, answers = $5,
        transcript = $6, assessment = $7, status = $8, level_of_service = $9 WHERE id = $10 RETURNING *`, [...values(call), id]);
      return parse(row);
    },
    async get(id) {
      return parse((await db.query(`SELECT * FROM ${S}.calls WHERE id = $1`, [id]))[0]);
    },
    async list({ limit = 100 } = {}) {
      const rows = await db.query(`SELECT id, call_type, payer, secondary_payer, details, status, level_of_service, call_taker, created_at
        FROM ${S}.calls ORDER BY id DESC LIMIT $1`, [limit]);
      return rows.map((r) => ({ ...r, details: JSON.parse(r.details) }));
    },
    async stats() {
      const rows = await db.query(`SELECT status, COUNT(*)::int AS n FROM ${S}.calls GROUP BY status`);
      const [{ n: today }] = await db.query(`SELECT COUNT(*)::int AS n FROM ${S}.calls
        WHERE left(created_at, 10) = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD')`);
      return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])), today };
    },
  };
}

// --------------------------------------------------------------- settings
export function settingsRepo(db) {
  return {
    async all() {
      const rows = await db.query(`SELECT key, value FROM ${S}.settings`);
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    async set(key, value) {
      await db.query(`INSERT INTO ${S}.settings (key, value) VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value`, [key, String(value)]);
    },
  };
}

// ------------------------------------------------------------------ users
const USER_COLUMNS = 'id, username, display_name, role, active, must_change_password, last_login_at, created_at, updated_at';
const toUser = (row) => row && { ...row, active: Boolean(row.active), must_change_password: Boolean(row.must_change_password) };

export function userRepo(db) {
  return {
    async count() {
      return (await db.query(`SELECT COUNT(*)::int AS n FROM ${S}.users`))[0].n;
    },
    async countActiveAdmins() {
      return (await db.query(`SELECT COUNT(*)::int AS n FROM ${S}.users WHERE role = 'admin' AND active`))[0].n;
    },
    async list() {
      return (await db.query(`SELECT ${USER_COLUMNS} FROM ${S}.users ORDER BY active DESC, lower(display_name)`)).map(toUser);
    },
    async get(id) {
      return toUser((await db.query(`SELECT ${USER_COLUMNS} FROM ${S}.users WHERE id = $1`, [id]))[0]);
    },
    // Includes the password hash — only for authentication.
    async getForLogin(username) {
      return toUser((await db.query(`SELECT * FROM ${S}.users WHERE lower(username) = lower($1)`, [String(username || '')]))[0]);
    },
    async getPasswordHash(id) {
      return (await db.query(`SELECT password_hash FROM ${S}.users WHERE id = $1`, [id]))[0]?.password_hash;
    },
    async create({ username, display_name, role, password_hash, must_change_password = true }) {
      const [row] = await db.query(`INSERT INTO ${S}.users (username, display_name, role, password_hash, must_change_password)
        VALUES ($1, $2, $3, $4, $5) RETURNING id`, [username, display_name, role, password_hash, Boolean(must_change_password)]);
      return this.get(row.id);
    },
    async update(id, fields) {
      const allowed = ['display_name', 'role', 'active', 'password_hash', 'must_change_password', 'last_login_at'];
      const row = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
      if (Object.keys(row).length) {
        const a = assignments(row);
        await db.query(`UPDATE ${S}.users SET ${a.sql}, updated_at = ${NOW} WHERE id = $${a.values.length + 1}`, [...a.values, id]);
      }
      return this.get(id);
    },
  };
}

// --------------------------------------------------------------- sessions
export function sessionRepo(db) {
  return {
    async create(tokenHash, userId, expiresAt) {
      await db.query(`INSERT INTO ${S}.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [tokenHash, userId, expiresAt]);
    },
    async get(tokenHash) {
      const row = (await db.query(`SELECT * FROM ${S}.sessions WHERE token_hash = $1`, [tokenHash]))[0];
      return row && { ...row, expires_at: Number(row.expires_at) };
    },
    async remove(tokenHash) {
      await db.query(`DELETE FROM ${S}.sessions WHERE token_hash = $1`, [tokenHash]);
    },
    async removeForUser(userId, { except } = {}) {
      await db.query(`DELETE FROM ${S}.sessions WHERE user_id = $1 AND token_hash <> $2`, [userId, except || '']);
    },
    async purgeExpired(now = Date.now()) {
      await db.query(`DELETE FROM ${S}.sessions WHERE expires_at < $1`, [now]);
    },
  };
}

// ---------------------------------------------------------- login lockout
// Failed sign-ins are tracked in the database so every server instance
// (each Netlify function container) sees the same count.
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export function lockoutRepo(db) {
  const key = (username) => String(username).toLowerCase();
  const T = `${S}.login_attempts`;
  return {
    async isLocked(username) {
      const row = (await db.query(`SELECT locked_until FROM ${T} WHERE username = $1`, [key(username)]))[0];
      return Boolean(row && Number(row.locked_until) > Date.now());
    },
    // Returns true when this failure triggered a lock. An expired lock starts a fresh count.
    async fail(username) {
      const now = Date.now();
      const [row] = await db.query(`INSERT INTO ${T} (username, failures, locked_until) VALUES ($1, 1, 0)
        ON CONFLICT (username) DO UPDATE SET
          failures = CASE WHEN ${T}.locked_until > 0 AND ${T}.locked_until <= $2 THEN 1 ELSE ${T}.failures + 1 END,
          locked_until = CASE WHEN ${T}.locked_until > 0 AND ${T}.locked_until <= $2 THEN 0 ELSE ${T}.locked_until END
        RETURNING failures`, [key(username), now]);
      if (row.failures < MAX_FAILED_LOGINS) return false;
      await db.query(`UPDATE ${T} SET locked_until = $2 WHERE username = $1`, [key(username), now + LOCKOUT_MS]);
      return true;
    },
    async clear(username) {
      await db.query(`DELETE FROM ${T} WHERE username = $1`, [key(username)]);
    },
  };
}

// ------------------------------------------------------------------ audit
export function auditRepo(db) {
  const where = ({ userId, action, from, to, q }) => {
    const clauses = [];
    const params = [];
    const add = (sql, ...vals) => clauses.push(sql.replace(/\?/g, () => `$${params.push(vals.shift())}`));
    if (userId) add('user_id = ?', Number(userId));
    if (action) add('action LIKE ?', `${action}%`);
    if (from) add('created_at >= ?', from);
    if (to) add('created_at < ?', to);
    if (q) add('(username ILIKE ? OR details ILIKE ? OR entity_id = ?)', `%${q}%`, `%${q}%`, q);
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  };
  return {
    async log({ user, action, entityType = null, entityId = null, details = {}, ip = null }) {
      await db.query(`INSERT INTO ${S}.audit_log (user_id, username, action, entity_type, entity_id, details, ip)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
        user?.id ?? null, user?.username ?? details.username ?? null, action, entityType,
        entityId == null ? null : String(entityId), JSON.stringify(details), ip,
      ]);
    },
    async list(filters = {}, { limit = 100, offset = 0 } = {}) {
      const { sql, params } = where(filters);
      const [{ n: total }] = await db.query(`SELECT COUNT(*)::int AS n FROM ${S}.audit_log ${sql}`, params);
      const rows = await db.query(`SELECT * FROM ${S}.audit_log ${sql} ORDER BY id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { total, rows: rows.map((r) => ({ ...r, details: JSON.parse(r.details) })) };
    },
    async actions() {
      return (await db.query(`SELECT DISTINCT action FROM ${S}.audit_log ORDER BY action`)).map((r) => r.action);
    },
  };
}

// ----------------------------------------------------------------- payers
export const PAYER_FIELDS = ['code', 'name', 'kind', 'parent_code', 'description', 'requires_medical_necessity', 'prior_auth',
  'prior_auth_note', 'certification', 'documentation', 'alternate_transport', 'contact_name', 'contact_phone', 'contact_fax',
  'contact_email', 'contact_url', 'sort_order', 'active', 'external_id'];

const toPayer = (row) => row && {
  ...row,
  prior_auth: JSON.parse(row.prior_auth || '{}'),
  documentation: JSON.parse(row.documentation || '[]'),
  active: Boolean(row.active),
  is_system: Boolean(row.is_system),
  requires_medical_necessity: Boolean(row.requires_medical_necessity),
  parent_code: row.parent_code || null,
};

function payerRow(input) {
  const row = {};
  for (const f of PAYER_FIELDS) {
    if (!(f in input)) continue;
    let v = input[f];
    if (f === 'prior_auth') v = JSON.stringify(v || {});
    else if (f === 'documentation') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (f === 'active' || f === 'requires_medical_necessity') v = Boolean(v);
    else if (f === 'parent_code') v = v ? String(v) : null;
    else if (f === 'sort_order') v = Number(v) || 0;
    else v = v == null ? '' : String(v);
    row[f] = v;
  }
  return row;
}

// ------------------------------------------------------------- facilities
export const FACILITY_FIELDS = ['name', 'address', 'phone', 'contact_name', 'contact_email', 'active', 'external_id'];
const toFacility = (row) => row && { ...row, active: Boolean(row.active) };

export function facilityRepo(db) {
  return {
    async list({ activeOnly = false } = {}) {
      return (await db.query(`SELECT * FROM ${S}.facilities ${activeOnly ? 'WHERE active' : ''} ORDER BY lower(name)`)).map(toFacility);
    },
    async get(id) {
      return toFacility((await db.query(`SELECT * FROM ${S}.facilities WHERE id = $1`, [id]))[0]);
    },
    async getByName(name) {
      return toFacility((await db.query(`SELECT * FROM ${S}.facilities WHERE lower(name) = lower($1)`, [String(name || '')]))[0]);
    },
    // How many saved calls picked each facility, and when it was last used.
    async usage() {
      // Pickup or destination; a call using one facility for both counts once.
      const rows = await db.query(`SELECT id, COUNT(DISTINCT call_id)::int AS calls, MAX(created_at) AS last_used FROM (
          SELECT details::jsonb ->> 'facility_id' AS id, id AS call_id, created_at FROM ${S}.calls
          UNION ALL
          SELECT details::jsonb ->> 'destination_facility_id', id, created_at FROM ${S}.calls
        ) used WHERE id IS NOT NULL GROUP BY id`);
      return new Map(rows.map((r) => [Number(r.id), { calls: r.calls, last_used: r.last_used }]));
    },
    async remove(id) {
      return (await db.query(`DELETE FROM ${S}.facilities WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
    async create(input, userId = null) {
      const row = Object.fromEntries(Object.entries(input).filter(([k]) => FACILITY_FIELDS.includes(k)));
      row.created_by = userId;
      const p = insertParts(row);
      return toFacility((await db.query(`INSERT INTO ${S}.facilities (${p.cols}) VALUES (${p.marks}) RETURNING *`, p.values))[0]);
    },
    async update(id, input) {
      const row = Object.fromEntries(Object.entries(input).filter(([k]) => FACILITY_FIELDS.includes(k)));
      if (Object.keys(row).length) {
        const a = assignments(row);
        await db.query(`UPDATE ${S}.facilities SET ${a.sql}, updated_at = ${NOW} WHERE id = $${a.values.length + 1}`, [...a.values, id]);
      }
      return this.get(id);
    },
  };
}

// ------------------------------------------------------------ logic flows
const toFlow = (row) => row && {
  ...row,
  active: Boolean(row.active),
  call_types: JSON.parse(row.call_types || '[]'),
  payers: JSON.parse(row.payers || '[]'),
  graph: JSON.parse(row.graph || '{"nodes":[],"edges":[]}'),
};
const flowRow = (input) => {
  const row = {};
  for (const f of ['name', 'description', 'active']) if (f in input) row[f] = input[f];
  for (const f of ['call_types', 'payers', 'graph']) if (f in input) row[f] = JSON.stringify(input[f]);
  return row;
};

export function flowRepo(db) {
  return {
    async list({ activeOnly = false } = {}) {
      return (await db.query(`SELECT * FROM ${S}.logic_flows ${activeOnly ? 'WHERE active' : ''} ORDER BY name, id`)).map(toFlow);
    },
    async get(id) {
      return toFlow((await db.query(`SELECT * FROM ${S}.logic_flows WHERE id = $1`, [id]))[0]);
    },
    async create(input) {
      const p = insertParts(flowRow(input));
      return toFlow((await db.query(`INSERT INTO ${S}.logic_flows (${p.cols}) VALUES (${p.marks}) RETURNING *`, p.values))[0]);
    },
    async update(id, input) {
      const row = flowRow(input);
      if (Object.keys(row).length) {
        const a = assignments(row);
        await db.query(`UPDATE ${S}.logic_flows SET ${a.sql}, updated_at = ${NOW} WHERE id = $${a.values.length + 1}`, [...a.values, id]);
      }
      return this.get(id);
    },
    async remove(id) {
      return (await db.query(`DELETE FROM ${S}.logic_flows WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
  };
}

export function payerRepo(db) {
  return {
    async list({ activeOnly = false } = {}) {
      const rows = await db.query(`SELECT * FROM ${S}.payers ${activeOnly ? 'WHERE active' : ''} ORDER BY kind DESC, sort_order, name`);
      return rows.map(toPayer);
    },
    async get(id) {
      return toPayer((await db.query(`SELECT * FROM ${S}.payers WHERE id = $1`, [id]))[0]);
    },
    async getByCode(code) {
      return toPayer((await db.query(`SELECT * FROM ${S}.payers WHERE code = $1`, [String(code || '')]))[0]);
    },
    async create(input, { system = false } = {}) {
      const row = payerRow({ active: true, kind: 'payer', requires_medical_necessity: true, ...input });
      if (row.sort_order == null) {
        const [{ m }] = await db.query(`SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM ${S}.payers`);
        row.sort_order = m + 10;
      }
      row.is_system = system;
      const p = insertParts(row);
      const [created] = await db.query(`INSERT INTO ${S}.payers (${p.cols}) VALUES (${p.marks}) RETURNING *`, p.values);
      return toPayer(created);
    },
    async update(id, input) {
      const row = payerRow(input);
      if (Object.keys(row).length) {
        const a = assignments(row);
        await db.query(`UPDATE ${S}.payers SET ${a.sql}, updated_at = ${NOW} WHERE id = $${a.values.length + 1}`, [...a.values, id]);
      }
      return this.get(id);
    },
    async remove(id) {
      return (await db.query(`DELETE FROM ${S}.payers WHERE id = $1 RETURNING id`, [id])).length > 0;
    },
  };
}

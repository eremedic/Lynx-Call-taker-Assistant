import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SEED_QUESTIONS } from './seed-questions.js';
import { SEED_PAYERS } from './seed-payers.js';

const JSON_FIELDS = ['options', 'call_types', 'payers', 'triggers', 'detect_yes', 'detect_no'];
const BOOL_FIELDS = ['required', 'active', 'is_system'];

export const QUESTION_FIELDS = [
  'code', 'category', 'text', 'guidance', 'answer_type', 'options', 'call_types', 'payers', 'criterion', 'qualifying_answer',
  'triggers', 'detect_yes', 'detect_no', 'depends_on_code', 'depends_on_answer', 'priority', 'sort_order', 'required',
  'alert_answer', 'alert_text', 'alert_level', 'active',
];

const DEFAULT_SETTINGS = {
  org_name: 'Lynx Ambulance',
  ai_enabled: 'true',
  ai_auto_analyze: 'true',
};

export function openDb(file = process.env.DB_PATH || path.resolve('data/lynx.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      guidance TEXT DEFAULT '',
      answer_type TEXT NOT NULL DEFAULT 'yes_no',
      options TEXT DEFAULT '[]',
      call_types TEXT DEFAULT '[]',
      criterion TEXT NOT NULL DEFAULT 'info',
      qualifying_answer TEXT,
      triggers TEXT DEFAULT '[]',
      detect_yes TEXT DEFAULT '[]',
      detect_no TEXT DEFAULT '[]',
      depends_on_code TEXT,
      depends_on_answer TEXT,
      priority INTEGER NOT NULL DEFAULT 3,
      sort_order INTEGER NOT NULL DEFAULT 0,
      required INTEGER NOT NULL DEFAULT 0,
      alert_answer TEXT,
      alert_text TEXT,
      alert_level TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_type TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      answers TEXT NOT NULL DEFAULT '{}',
      transcript TEXT NOT NULL DEFAULT '',
      assessment TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      level_of_service TEXT,
      call_taker TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'call_taker')),
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS payers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      prior_auth TEXT NOT NULL DEFAULT '{}',
      prior_auth_note TEXT NOT NULL DEFAULT '',
      certification TEXT NOT NULL DEFAULT '',
      documentation TEXT NOT NULL DEFAULT '[]',
      alternate_transport TEXT NOT NULL DEFAULT '',
      contact_name TEXT NOT NULL DEFAULT '',
      contact_phone TEXT NOT NULL DEFAULT '',
      contact_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      ip TEXT
    );
    CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_at);
    CREATE INDEX IF NOT EXISTS audit_log_user ON audit_log (user_id);
    -- The audit trail is append-only.
    CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
  `);
  db.exec('PRAGMA foreign_keys = ON');

  // Migrations for databases created by earlier versions.
  const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols('calls').includes('user_id')) db.exec('ALTER TABLE calls ADD COLUMN user_id INTEGER REFERENCES users(id)');
  if (!cols('calls').includes('payer')) db.exec('ALTER TABLE calls ADD COLUMN payer TEXT');
  if (!cols('questions').includes('payers')) db.exec("ALTER TABLE questions ADD COLUMN payers TEXT DEFAULT '[]'");

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);
  seedContent(db);
  return db;
}

// Seed version history:
//   1 - original CMS question bank
//   2 - payer profiles; payer-scoped questions; prior-auth criterion
const SEED_VERSION = 2;

function seedContent(db) {
  const settings = settingsRepo(db);
  const questions = questionRepo(db);
  const payers = payerRepo(db);
  const fresh = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n === 0;
  const version = fresh ? 0 : Number(settings.all().seed_version || 1);
  if (version >= SEED_VERSION) return;

  const seedOrder = (code) => (SEED_QUESTIONS.findIndex((q) => q.code === code) + 1) * 10;
  db.exec('BEGIN');
  try {
    if (fresh) {
      SEED_QUESTIONS.forEach((q) => questions.create({ ...q, sort_order: seedOrder(q.code) }, { system: true }));
    }
    if (version < 2) {
      SEED_PAYERS.forEach((p, i) => { if (!payers.getByCode(p.code)) payers.create({ ...p, sort_order: (i + 1) * 10 }, { system: true }); });
      if (!fresh) {
        // Questions whose built-in definition changed in version 2.
        for (const code of ['DOC_PRIOR_AUTH', 'DOC_PCS', 'DOC_INPATIENT']) {
          const existing = questions.getByCode(code);
          const seed = SEED_QUESTIONS.find((q) => q.code === code);
          if (existing && seed) {
            questions.update(existing.id, {
              call_types: [], payers: [], triggers: [], detect_yes: [], detect_no: [], options: [],
              depends_on_code: null, depends_on_answer: null, alert_answer: null, alert_text: null, alert_level: null,
              qualifying_answer: null, required: false, ...seed,
            });
          }
        }
        // The payer is now chosen at the top of the call instead of by question.
        const insurance = questions.getByCode('DOC_INSURANCE');
        if (insurance?.is_system) questions.update(insurance.id, { active: false });
        // Add new built-in questions.
        for (const q of SEED_QUESTIONS) {
          if (!questions.getByCode(q.code)) questions.create({ ...q, sort_order: 1000 + seedOrder(q.code) }, { system: true });
        }
      }
    }
    settings.set('seed_version', SEED_VERSION);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

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
    else if (BOOL_FIELDS.includes(f)) v = v ? 1 : 0;
    else if (v === undefined || v === '') v = null;
    row[f] = v;
  }
  return row;
}

export function questionRepo(db) {
  return {
    list({ activeOnly = false } = {}) {
      const sql = `SELECT * FROM questions ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY sort_order, id`;
      return db.prepare(sql).all().map(rowToQuestion);
    },
    get(id) {
      return rowToQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id));
    },
    getByCode(code) {
      return rowToQuestion(db.prepare('SELECT * FROM questions WHERE code = ?').get(code));
    },
    create(input, { system = false } = {}) {
      const row = toRow({ active: true, required: false, priority: 3, ...input });
      if (row.sort_order == null) {
        row.sort_order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM questions').get().m || 0) + 10;
      }
      row.is_system = system ? 1 : 0;
      const cols = Object.keys(row);
      const info = db
        .prepare(`INSERT INTO questions (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => row[c]));
      return this.get(Number(info.lastInsertRowid));
    },
    update(id, input) {
      const row = toRow(input);
      const cols = Object.keys(row);
      if (cols.length) {
        db.prepare(`UPDATE questions SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`)
          .run(...cols.map((c) => row[c]), id);
      }
      return this.get(id);
    },
    remove(id) {
      return db.prepare('DELETE FROM questions WHERE id = ?').run(id).changes > 0;
    },
  };
}

export function callRepo(db) {
  const parse = (row) => row && {
    ...row,
    details: JSON.parse(row.details),
    answers: JSON.parse(row.answers),
    assessment: JSON.parse(row.assessment),
  };
  return {
    create({ callType, payer, details, answers, transcript, assessment, callTaker, userId }) {
      const info = db.prepare(`INSERT INTO calls (call_type, payer, details, answers, transcript, assessment, status, level_of_service, call_taker, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        callType,
        payer || null,
        JSON.stringify(details || {}),
        JSON.stringify(answers || {}),
        transcript || '',
        JSON.stringify(assessment || {}),
        assessment?.status || 'incomplete',
        assessment?.levelOfService?.label || null,
        callTaker || null,
        userId ?? null,
      );
      return this.get(Number(info.lastInsertRowid));
    },
    get(id) {
      return parse(db.prepare('SELECT * FROM calls WHERE id = ?').get(id));
    },
    list({ limit = 100 } = {}) {
      return db.prepare(`SELECT id, call_type, payer, details, status, level_of_service, call_taker, created_at
        FROM calls ORDER BY id DESC LIMIT ?`).all(limit).map((r) => ({ ...r, details: JSON.parse(r.details) }));
    },
    stats() {
      const rows = db.prepare('SELECT status, COUNT(*) AS n FROM calls GROUP BY status').all();
      const today = db.prepare("SELECT COUNT(*) AS n FROM calls WHERE date(created_at) = date('now')").get().n;
      return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])), today };
    },
  };
}

export function settingsRepo(db) {
  return {
    all() {
      return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
    },
    set(key, value) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
    },
  };
}

// ------------------------------------------------------------------ users
const USER_COLUMNS = 'id, username, display_name, role, active, must_change_password, last_login_at, created_at, updated_at';
const toUser = (row) => row && { ...row, active: Boolean(row.active), must_change_password: Boolean(row.must_change_password) };

export function userRepo(db) {
  return {
    count() {
      return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    },
    countActiveAdmins() {
      return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n;
    },
    list() {
      return db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY active DESC, display_name COLLATE NOCASE`).all().map(toUser);
    },
    get(id) {
      return toUser(db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id));
    },
    // Includes the password hash — only for authentication.
    getForLogin(username) {
      return toUser(db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '')));
    },
    getPasswordHash(id) {
      return db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id)?.password_hash;
    },
    create({ username, display_name, role, password_hash, must_change_password = true }) {
      const info = db.prepare(`INSERT INTO users (username, display_name, role, password_hash, must_change_password)
        VALUES (?, ?, ?, ?, ?)`).run(username, display_name, role, password_hash, must_change_password ? 1 : 0);
      return this.get(Number(info.lastInsertRowid));
    },
    update(id, fields) {
      const allowed = ['display_name', 'role', 'active', 'password_hash', 'must_change_password', 'last_login_at'];
      const cols = Object.keys(fields).filter((k) => allowed.includes(k));
      if (cols.length) {
        const vals = cols.map((c) => (typeof fields[c] === 'boolean' ? (fields[c] ? 1 : 0) : fields[c]));
        db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals, id);
      }
      return this.get(id);
    },
  };
}

// --------------------------------------------------------------- sessions
export function sessionRepo(db) {
  return {
    create(tokenHash, userId, expiresAt) {
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash, userId, expiresAt);
    },
    get(tokenHash) {
      return db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);
    },
    remove(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    removeForUser(userId, { except } = {}) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, except || '');
    },
    purgeExpired(now = Date.now()) {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    },
  };
}

// ------------------------------------------------------------------ audit
export function auditRepo(db) {
  const insert = db.prepare(`INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const where = ({ userId, action, from, to, q }) => {
    const clauses = [];
    const params = [];
    if (userId) { clauses.push('user_id = ?'); params.push(Number(userId)); }
    if (action) { clauses.push('action LIKE ?'); params.push(`${action}%`); }
    if (from) { clauses.push('created_at >= ?'); params.push(from); }
    if (to) { clauses.push('created_at < ?'); params.push(to); }
    if (q) { clauses.push('(username LIKE ? OR details LIKE ? OR entity_id = ?)'); params.push(`%${q}%`, `%${q}%`, q); }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  };
  return {
    log({ user, action, entityType = null, entityId = null, details = {}, ip = null }) {
      insert.run(user?.id ?? null, user?.username ?? details.username ?? null, action, entityType,
        entityId == null ? null : String(entityId), JSON.stringify(details), ip);
    },
    list(filters = {}, { limit = 100, offset = 0 } = {}) {
      const { sql, params } = where(filters);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${sql}`).get(...params).n;
      const rows = db.prepare(`SELECT * FROM audit_log ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)
        .map((r) => ({ ...r, details: JSON.parse(r.details) }));
      return { total, rows };
    },
    actions() {
      return db.prepare('SELECT DISTINCT action FROM audit_log ORDER BY action').all().map((r) => r.action);
    },
  };
}

// ----------------------------------------------------------------- payers
const PAYER_FIELDS = ['code', 'name', 'description', 'prior_auth', 'prior_auth_note', 'certification', 'documentation',
  'alternate_transport', 'contact_name', 'contact_phone', 'contact_url', 'sort_order', 'active'];

const toPayer = (row) => row && {
  ...row,
  prior_auth: JSON.parse(row.prior_auth || '{}'),
  documentation: JSON.parse(row.documentation || '[]'),
  active: Boolean(row.active),
  is_system: Boolean(row.is_system),
};

function payerRow(input) {
  const row = {};
  for (const f of PAYER_FIELDS) {
    if (!(f in input)) continue;
    let v = input[f];
    if (f === 'prior_auth') v = JSON.stringify(v || {});
    else if (f === 'documentation') v = JSON.stringify(Array.isArray(v) ? v : []);
    else if (f === 'active') v = v ? 1 : 0;
    else if (f === 'sort_order') v = Number(v) || 0;
    else v = v == null ? '' : String(v);
    row[f] = v;
  }
  return row;
}

export function payerRepo(db) {
  return {
    list({ activeOnly = false } = {}) {
      return db.prepare(`SELECT * FROM payers ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY sort_order, name`).all().map(toPayer);
    },
    get(id) {
      return toPayer(db.prepare('SELECT * FROM payers WHERE id = ?').get(id));
    },
    getByCode(code) {
      return toPayer(db.prepare('SELECT * FROM payers WHERE code = ?').get(String(code || '')));
    },
    create(input, { system = false } = {}) {
      const row = payerRow({ active: true, ...input });
      if (row.sort_order == null) row.sort_order = (db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM payers').get().m || 0) + 10;
      row.is_system = system ? 1 : 0;
      const keys = Object.keys(row);
      const info = db.prepare(`INSERT INTO payers (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map((k) => row[k]));
      return this.get(Number(info.lastInsertRowid));
    },
    update(id, input) {
      const row = payerRow(input);
      const keys = Object.keys(row);
      if (keys.length) {
        db.prepare(`UPDATE payers SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => row[k]), id);
      }
      return this.get(id);
    },
    remove(id) {
      return db.prepare('DELETE FROM payers WHERE id = ?').run(id).changes > 0;
    },
  };
}

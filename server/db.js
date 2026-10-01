import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { SEED_QUESTIONS } from './seed-questions.js';

const JSON_FIELDS = ['options', 'call_types', 'triggers', 'detect_yes', 'detect_no'];
const BOOL_FIELDS = ['required', 'active', 'is_system'];

export const QUESTION_FIELDS = [
  'code', 'category', 'text', 'guidance', 'answer_type', 'options', 'call_types', 'criterion', 'qualifying_answer',
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
  `);

  const count = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (count === 0) {
    const repo = questionRepo(db);
    SEED_QUESTIONS.forEach((q, i) => repo.create({ ...q, sort_order: (i + 1) * 10 }, { system: true }));
  }
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);
  return db;
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
    create({ callType, details, answers, transcript, assessment, callTaker }) {
      const info = db.prepare(`INSERT INTO calls (call_type, details, answers, transcript, assessment, status, level_of_service, call_taker)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        callType,
        JSON.stringify(details || {}),
        JSON.stringify(answers || {}),
        transcript || '',
        JSON.stringify(assessment || {}),
        assessment?.status || 'incomplete',
        assessment?.levelOfService?.label || null,
        callTaker || null,
      );
      return this.get(Number(info.lastInsertRowid));
    },
    get(id) {
      return parse(db.prepare('SELECT * FROM calls WHERE id = ?').get(id));
    },
    list({ limit = 100 } = {}) {
      return db.prepare(`SELECT id, call_type, details, status, level_of_service, call_taker, created_at
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

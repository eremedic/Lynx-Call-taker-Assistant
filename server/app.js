import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, questionRepo, callRepo, settingsRepo, userRepo, sessionRepo, auditRepo, payerRepo, PAYER_FIELDS } from './db.js';
import { PRIOR_AUTH_POLICIES } from './seed-payers.js';
import { evaluateCall, appliesToPayer, skipsNecessity, CALL_TYPES } from './engine/evaluate.js';
import { CATEGORIES } from './seed-questions.js';
import { analyzeTranscript, aiConfigured, AiError } from './ai.js';
import { buildPcs } from './pcs.js';
import {
  ROLES, SESSION_COOKIE, SESSION_TTL_MS, hashPassword, verifyPassword, burnPasswordCheck, passwordProblems,
  generatePassword, newSessionToken, hashToken, parseCookies, sessionCookie, createLockout,
} from './auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const ANSWER_TYPES = ['yes_no', 'choice', 'text', 'number'];
const CRITERIA = ['emergency', 'bed_confined', 'condition', 'als', 'sct', 'disqualifier', 'documentation', 'prior_auth', 'info'];
const ALERT_LEVELS = ['info', 'warning', 'critical'];
const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function validatePayer(input, { partial = false } = {}) {
  const errors = [];
  const need = (f) => !partial || f in input;
  if (need('code') && !/^[a-z][a-z0-9_]{1,40}$/.test(input.code || '')) errors.push('Code must be 2–40 characters: lowercase letters, digits, underscores.');
  if (need('name') && !String(input.name || '').trim()) errors.push('Payer name is required.');
  if ('prior_auth' in input) {
    const pa = input.prior_auth || {};
    if (Object.keys(CALL_TYPES).some((t) => !(pa[t] in PRIOR_AUTH_POLICIES))) errors.push('Choose a prior-authorization policy for every call type.');
  }
  if ('documentation' in input && !Array.isArray(input.documentation)) errors.push('Documentation must be a list.');
  if ('kind' in input && !['payer', 'broker'].includes(input.kind)) errors.push('Invalid payer type.');
  if ('contact_email' in input && input.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.contact_email)) errors.push('Contact email is not valid.');
  if ('contact_url' in input && input.contact_url && !/^https:\/\//i.test(input.contact_url)) errors.push('Contact URL must start with https://');
  return errors;
}

function validateQuestion(input, { partial = false } = {}) {
  const errors = [];
  const need = (f) => !partial || f in input;
  if (need('code') && !/^[A-Z][A-Z0-9_]{1,40}$/.test(input.code || '')) errors.push('Code must be 2–40 characters: capital letters, digits, underscores.');
  if (need('text') && !String(input.text || '').trim()) errors.push('Question text is required.');
  if (need('category') && !String(input.category || '').trim()) errors.push('Category is required.');
  if ('answer_type' in input && !ANSWER_TYPES.includes(input.answer_type)) errors.push('Invalid answer type.');
  if ('criterion' in input && !CRITERIA.includes(input.criterion)) errors.push('Invalid criterion.');
  if ('alert_level' in input && input.alert_level && !ALERT_LEVELS.includes(input.alert_level)) errors.push('Invalid alert level.');
  if ('call_types' in input && (input.call_types || []).some((t) => !(t in CALL_TYPES))) errors.push('Invalid call type.');
  if (input.answer_type === 'choice' && 'options' in input && (input.options || []).length < 2) errors.push('Choice questions need at least two options.');
  if ('priority' in input && ![1, 2, 3].includes(Number(input.priority))) errors.push('Priority must be 1, 2, or 3.');
  return errors;
}

// Field-level before/after for the audit trail.
function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    if (JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)) changes[f] = { from: before[f] ?? null, to: after[f] ?? null };
  }
  return changes;
}

const csvCell = (v) => {
  let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralize spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Creates the first administrator when the database has no users. Until that
// account has signed in for the first time, each start issues a fresh
// temporary password so it is never lost with an old terminal.
export async function ensureInitialAdmin(db, { username = process.env.ADMIN_USERNAME || 'admin', password = process.env.ADMIN_PASSWORD } = {}) {
  const users = userRepo(db);
  if (users.count() > 0) {
    const list = users.list();
    const unclaimed = list.length === 1 && list[0].role === 'admin' && !list[0].last_login_at && list[0].must_change_password;
    if (!unclaimed) return null;
    const admin = list[0];
    const generated = password ? null : generatePassword();
    users.update(admin.id, { password_hash: await hashPassword(password || generated) });
    auditRepo(db).log({ user: null, action: 'user.password_reset', entityType: 'user', entityId: admin.id, details: { username: admin.username, reason: 'initial setup not yet completed; reissued at startup' } });
    return { username: admin.username, password: generated, reissued: true };
  }
  const generated = password ? null : generatePassword();
  const user = users.create({
    username,
    display_name: 'Administrator',
    role: 'admin',
    password_hash: await hashPassword(password || generated),
    must_change_password: true,
  });
  auditRepo(db).log({ user: null, action: 'user.created', entityType: 'user', entityId: user.id, details: { username, role: 'admin', reason: 'initial setup' } });
  return { username, password: generated };
}

export function createApp({ db = openDb() } = {}) {
  const questions = questionRepo(db);
  const calls = callRepo(db);
  const settings = settingsRepo(db);
  const users = userRepo(db);
  const sessions = sessionRepo(db);
  const audit = auditRepo(db);
  const payers = payerRepo(db);
  const lockout = createLockout();
  const activePayer = (code) => {
    const p = code ? payers.getByCode(code) : null;
    if (!p?.active) return null;
    // A broker shows which payer program it books for.
    if (p.parent_code) p.parentName = payers.getByCode(p.parent_code)?.name || null;
    return p;
  };
  // The payer for a call, plus the active transport brokers that book for it.
  const payerContext = (code) => {
    const payer = activePayer(code);
    const brokers = payer && payer.kind !== 'broker'
      ? payers.list({ activeOnly: true }).filter((b) => b.kind === 'broker' && b.parent_code === payer.code)
      : [];
    return { payer, brokers };
  };

  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  // CSRF defense in depth (cookies are already SameSite=Strict): state-changing
  // API calls must be JSON, which cross-site forms cannot send.
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ error: 'Requests must be sent as JSON.' });
    }
    next();
  });
  app.use(express.static(path.join(here, '..', 'public')));

  const log = (req, action, extra = {}) => audit.log({ user: req.user, ip: req.ip, action, ...extra });

  // --------------------------------------------------------------- auth
  const loadUser = (req) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = sessions.get(tokenHash);
    if (!session) return null;
    if (session.expires_at < Date.now()) { sessions.remove(tokenHash); return null; }
    const user = users.get(session.user_id);
    if (!user?.active) return null;
    req.sessionTokenHash = tokenHash;
    return user;
  };

  const requireAuth = (req, res, next) => {
    req.user = loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    if (req.user.must_change_password) return res.status(403).json({ error: 'You must change your password first.', code: 'PASSWORD_CHANGE_REQUIRED' });
    next();
  };
  const requireAdmin = (req, res, next) => requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      log(req, 'access.denied', { details: { path: req.originalUrl } });
      return res.status(403).json({ error: 'Administrator access required.', code: 'FORBIDDEN' });
    }
    next();
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });

    if (lockout.isLocked(username)) {
      audit.log({ user: null, ip: req.ip, action: 'auth.login_blocked', details: { username } });
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes or ask an administrator.' });
    }
    const record = users.getForLogin(username);
    const ok = record ? await verifyPassword(password, record.password_hash) : (await burnPasswordCheck(password), false);
    if (!ok || !record.active) {
      const locked = lockout.fail(username);
      audit.log({ user: record || null, ip: req.ip, action: 'auth.login_failed', details: { username, reason: !ok ? 'bad_credentials' : 'inactive', locked } });
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    lockout.clear(username);

    const token = newSessionToken();
    sessions.purgeExpired();
    sessions.create(hashToken(token), record.id, Date.now() + SESSION_TTL_MS);
    users.update(record.id, { last_login_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
    const user = users.get(record.id);
    audit.log({ user, ip: req.ip, action: 'auth.login', details: { user_agent: String(req.headers['user-agent'] || '').slice(0, 200) } });
    res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_TTL_MS / 1000));
    res.json({ user });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.user = loadUser(req);
    if (req.user) {
      sessions.remove(req.sessionTokenHash);
      log(req, 'auth.logout');
    }
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  });

  app.get('/api/auth/session', (req, res) => res.json({ user: loadUser(req), roles: ROLES }));

  app.post('/api/auth/change-password', async (req, res) => {
    req.user = loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    const { currentPassword, newPassword } = req.body || {};
    if (!(await verifyPassword(String(currentPassword || ''), users.getPasswordHash(req.user.id)))) {
      log(req, 'auth.password_change_failed', { entityType: 'user', entityId: req.user.id });
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const problems = passwordProblems(newPassword, { username: req.user.username });
    if (newPassword === currentPassword) problems.push('New password must be different from the current one.');
    if (problems.length) return res.status(400).json({ error: problems.join(' ') });
    users.update(req.user.id, { password_hash: await hashPassword(newPassword), must_change_password: false });
    sessions.removeForUser(req.user.id, { except: req.sessionTokenHash }); // sign out other devices
    log(req, 'auth.password_changed', { entityType: 'user', entityId: req.user.id });
    res.json({ user: users.get(req.user.id) });
  });

  // ------------------------------------------------------------- config
  const publicSettings = () => {
    const s = settings.all();
    return {
      orgName: s.org_name,
      aiAvailable: aiConfigured() && s.ai_enabled === 'true',
      aiAutoAnalyze: s.ai_auto_analyze === 'true',
    };
  };
  app.get('/api/public-config', (req, res) => res.json({ orgName: settings.all().org_name }));
  app.get('/api/config', requireAuth, (req, res) => {
    res.json({
      ...publicSettings(), callTypes: CALL_TYPES, categories: CATEGORIES, answerTypes: ANSWER_TYPES,
      criteria: CRITERIA, alertLevels: ALERT_LEVELS, roles: ROLES, priorAuthPolicies: PRIOR_AUTH_POLICIES,
      payers: payers.list({ activeOnly: true }).map((p) => ({ code: p.code, name: p.name, kind: p.kind })),
    });
  });

  // ------------------------------------------------------ call taker API
  app.get('/api/questions', requireAuth, (req, res) => res.json(questions.list({ activeOnly: true })));

  app.post('/api/evaluate', requireAuth, (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '', payer = '' } = req.body || {};
    if (!(callType in CALL_TYPES)) return res.status(400).json({ error: 'Invalid call type.' });
    res.json(evaluateCall({ callType, answers, transcript, ...payerContext(payer), questions: questions.list({ activeOnly: true }) }));
  });

  app.post('/api/ai/analyze', requireAuth, async (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '', payer: payerCode = '' } = req.body || {};
    if (!publicSettings().aiAvailable) return res.status(503).json({ error: 'AI analysis is not enabled.' });
    if (!String(transcript).trim()) return res.status(400).json({ error: 'Transcript is empty.' });
    // PHI leaves the system here, so every request is recorded.
    log(req, 'ai.analyze', { details: { transcript_chars: String(transcript).length, call_type: callType } });
    try {
      const payer = activePayer(payerCode);
      res.json(await analyzeTranscript({
        transcript,
        callType: payer ? `${callType} — payer: ${payer.name}` : callType,
        answers,
        questions: questions.list({ activeOnly: true }).filter((q) => appliesToPayer(q, payer) && !(skipsNecessity(payer) && q.necessity)),
      }));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      console.error('AI analysis failed:', err);
      res.status(500).json({ error: 'AI analysis failed.' });
    }
  });

  // Validates a call from the console and re-evaluates it server-side so the
  // stored assessment can't be tampered with.
  const callFromBody = (body = {}) => {
    const { callType, details = {}, answers = {}, transcript = '', payer: payerCode = '' } = body;
    if (!(callType in CALL_TYPES)) return { error: 'Invalid call type.' };
    const { payer, brokers } = payerContext(payerCode);
    const { assessment } = evaluateCall({ callType, answers, transcript, payer, brokers, questions: questions.list({ activeOnly: true }) });
    return { callType, payer: payer?.code, details, answers, transcript, assessment };
  };
  // Call takers can reach their own calls; administrators can reach any call.
  const ownCall = (req, res) => {
    const call = calls.get(Number(req.params.id));
    if (!call || (req.user.role !== 'admin' && call.user_id !== req.user.id)) {
      res.status(404).json({ error: 'Call not found.' });
      return null;
    }
    return call;
  };

  app.post('/api/calls', requireAuth, (req, res) => {
    const input = callFromBody(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const call = calls.create({ ...input, callTaker: req.user.display_name, userId: req.user.id });
    log(req, 'call.saved', { entityType: 'call', entityId: call.id, details: { call_type: input.callType, payer: input.payer || null, status: call.status } });
    res.status(201).json({ id: call.id, status: call.status, created_at: call.created_at });
  });

  app.put('/api/calls/:id', requireAuth, (req, res) => {
    const existing = ownCall(req, res);
    if (!existing) return;
    const input = callFromBody(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const call = calls.update(existing.id, input);
    log(req, 'call.updated', { entityType: 'call', entityId: call.id, details: { call_type: input.callType, payer: input.payer || null, status: call.status } });
    res.json({ id: call.id, status: call.status, created_at: call.created_at });
  });

  app.get('/api/calls/:id/pcs', requireAuth, (req, res) => {
    const call = ownCall(req, res);
    if (!call) return;
    const payer = call.payer ? payers.getByCode(call.payer) : null;
    const pcs = buildPcs({ call, payer, questions: questions.list({ activeOnly: true }), orgName: settings.all().org_name });
    log(req, 'pcs.generated', { entityType: 'call', entityId: call.id });
    res.json(pcs);
  });

  // -------------------------------------------------- admin: questions
  const QUESTION_AUDIT_FIELDS = ['code', 'category', 'text', 'guidance', 'answer_type', 'options', 'call_types', 'payers', 'criterion', 'qualifying_answer',
    'triggers', 'detect_yes', 'detect_no', 'depends_on_code', 'depends_on_answer', 'priority', 'sort_order', 'required', 'alert_answer',
    'alert_text', 'alert_level', 'active', 'necessity'];

  app.get('/api/admin/questions', requireAdmin, (req, res) => res.json(questions.list()));

  const unknownPayers = (input) => (input.payers || []).filter((c) => c !== '@broker' && !payers.getByCode(c));

  app.post('/api/admin/questions', requireAdmin, (req, res) => {
    const errors = validateQuestion(req.body || {});
    if (unknownPayers(req.body || {}).length) errors.push('Unknown payer.');
    if (questions.getByCode(req.body?.code)) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const q = questions.create(req.body);
    log(req, 'question.created', { entityType: 'question', entityId: q.code, details: { text: q.text, category: q.category, criterion: q.criterion } });
    res.status(201).json(q);
  });

  app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const existing = questions.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    const input = { ...req.body };
    if (existing.is_system) delete input.code; // system codes are referenced by the engine
    const errors = validateQuestion({ answer_type: existing.answer_type, ...input }, { partial: true });
    if (unknownPayers(input).length) errors.push('Unknown payer.');
    if (input.code && input.code !== existing.code && questions.getByCode(input.code)) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const updated = questions.update(existing.id, input);
    const changes = diff(existing, updated, QUESTION_AUDIT_FIELDS);
    if (Object.keys(changes).length) log(req, 'question.updated', { entityType: 'question', entityId: updated.code, details: { changes } });
    res.json(updated);
  });

  app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const existing = questions.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'Built-in questions cannot be deleted. Deactivate it instead.' });
    questions.remove(existing.id);
    log(req, 'question.deleted', { entityType: 'question', entityId: existing.code, details: { text: existing.text } });
    res.status(204).end();
  });

  // ----------------------------------------------------- admin: payers
  const PAYER_AUDIT_FIELDS = PAYER_FIELDS;
  // A broker's parent must be an existing payer (not another broker).
  const parentProblems = (input, self) => {
    if (!input.parent_code) return [];
    const parent = payers.getByCode(input.parent_code);
    if (!parent || parent.kind === 'broker' || parent.code === self) return ['Choose a payer program for this broker.'];
    return [];
  };

  app.get('/api/admin/payers', requireAdmin, (req, res) => res.json(payers.list()));

  app.post('/api/admin/payers', requireAdmin, (req, res) => {
    const errors = validatePayer(req.body || {});
    if (!('prior_auth' in (req.body || {}))) errors.push('Choose a prior-authorization policy for every call type.');
    if (payers.getByCode(req.body?.code)) errors.push('A payer with this code already exists.');
    errors.push(...parentProblems(req.body || {}, req.body?.code));
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const p = payers.create(req.body);
    log(req, 'payer.created', { entityType: 'payer', entityId: p.code, details: { name: p.name, prior_auth: p.prior_auth } });
    res.status(201).json(p);
  });

  app.put('/api/admin/payers/:id', requireAdmin, (req, res) => {
    const existing = payers.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Payer not found.' });
    const input = { ...req.body };
    delete input.code; // questions reference payers by code
    const errors = validatePayer(input, { partial: true });
    errors.push(...parentProblems(input, existing.code));
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const updated = payers.update(existing.id, input);
    const changes = diff(existing, updated, PAYER_AUDIT_FIELDS);
    if (Object.keys(changes).length) log(req, 'payer.updated', { entityType: 'payer', entityId: existing.code, details: { changes } });
    res.json(updated);
  });

  app.delete('/api/admin/payers/:id', requireAdmin, (req, res) => {
    const existing = payers.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Payer not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'Built-in payers cannot be deleted. Deactivate it instead.' });
    const linkedBrokers = payers.list().filter((b) => b.parent_code === existing.code).map((b) => b.name);
    if (linkedBrokers.length) return res.status(400).json({ error: `These transport brokers book for this payer — change or delete them first: ${linkedBrokers.join(', ')}.` });
    const used = questions.list().filter((q) => q.payers.includes(existing.code)).map((q) => q.code);
    if (used.length) return res.status(400).json({ error: `Remove this payer from these questions first: ${used.join(', ')}.` });
    payers.remove(existing.id);
    log(req, 'payer.deleted', { entityType: 'payer', entityId: existing.code, details: { name: existing.name } });
    res.status(204).end();
  });

  // ------------------------------------------------------ admin: calls
  app.get('/api/admin/calls', requireAdmin, (req, res) => {
    log(req, 'call.list_viewed');
    res.json(calls.list());
  });
  app.get('/api/admin/calls/:id', requireAdmin, (req, res) => {
    const call = calls.get(Number(req.params.id));
    if (!call) return res.status(404).json({ error: 'Call not found.' });
    log(req, 'call.viewed', { entityType: 'call', entityId: call.id });
    res.json(call);
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const all = questions.list();
    const userList = users.list();
    res.json({
      questions: { total: all.length, active: all.filter((q) => q.active).length, custom: all.filter((q) => !q.is_system).length },
      users: { active: userList.filter((u) => u.active).length, total: userList.length },
      calls: calls.stats(),
    });
  });

  // ------------------------------------------------------ admin: users
  app.get('/api/admin/users', requireAdmin, (req, res) => res.json(users.list()));

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const displayName = String(req.body?.display_name || '').trim();
    const role = req.body?.role;
    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('Username must be 3–32 characters: letters, digits, dot, dash or underscore.');
    if (!displayName) errors.push('Full name is required.');
    if (!(role in ROLES)) errors.push('Invalid role.');
    if (users.getForLogin(username)) errors.push('That username is already taken.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const temporaryPassword = generatePassword();
    const user = users.create({ username, display_name: displayName, role, password_hash: await hashPassword(temporaryPassword), must_change_password: true });
    log(req, 'user.created', { entityType: 'user', entityId: user.id, details: { username, display_name: displayName, role } });
    res.status(201).json({ user, temporaryPassword });
  });

  app.put('/api/admin/users/:id', requireAdmin, (req, res) => {
    const existing = users.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'User not found.' });
    const fields = {};
    if ('display_name' in req.body) {
      fields.display_name = String(req.body.display_name || '').trim();
      if (!fields.display_name) return res.status(400).json({ error: 'Full name is required.' });
    }
    if ('role' in req.body) {
      if (!(req.body.role in ROLES)) return res.status(400).json({ error: 'Invalid role.' });
      fields.role = req.body.role;
    }
    if ('active' in req.body) fields.active = Boolean(req.body.active);

    const losesAdmin = existing.role === 'admin' && existing.active && (fields.role === 'call_taker' || fields.active === false);
    if (losesAdmin && existing.id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
    if (losesAdmin && users.countActiveAdmins() <= 1) return res.status(400).json({ error: 'At least one active administrator is required.' });

    const updated = users.update(existing.id, fields);
    if (fields.active === false) sessions.removeForUser(existing.id); // sign out immediately
    const changes = diff(existing, updated, ['display_name', 'role', 'active']);
    if (Object.keys(changes).length) {
      const action = 'active' in changes ? (updated.active ? 'user.activated' : 'user.deactivated') : 'user.updated';
      log(req, action, { entityType: 'user', entityId: existing.id, details: { username: existing.username, changes } });
    }
    res.json(updated);
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const existing = users.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'User not found.' });
    const temporaryPassword = generatePassword();
    users.update(existing.id, { password_hash: await hashPassword(temporaryPassword), must_change_password: true });
    sessions.removeForUser(existing.id);
    lockout.clear(existing.username);
    log(req, 'user.password_reset', { entityType: 'user', entityId: existing.id, details: { username: existing.username } });
    res.json({ user: users.get(existing.id), temporaryPassword });
  });

  // ------------------------------------------------------ admin: audit
  const auditFilters = (q) => ({ userId: q.user_id, action: q.action, from: q.from, to: q.to, q: q.q ? String(q.q).slice(0, 100) : '' });

  app.get('/api/admin/audit', requireAdmin, (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json({ ...audit.list(auditFilters(req.query), { limit, offset }), actions: audit.actions() });
  });

  app.get('/api/admin/audit/export.csv', requireAdmin, (req, res) => {
    const filters = auditFilters(req.query);
    const { rows } = audit.list(filters, { limit: 100000 });
    log(req, 'audit.exported', { details: { rows: rows.length, filters } });
    const header = ['id', 'timestamp_utc', 'user_id', 'username', 'action', 'entity_type', 'entity_id', 'ip', 'details'];
    const lines = rows.map((r) => [r.id, r.created_at, r.user_id, r.username, r.action, r.entity_type, r.entity_id, r.ip, r.details].map(csvCell).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lynx-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.join(','), ...lines].join('\r\n'));
  });

  // --------------------------------------------------- admin: settings
  app.get('/api/admin/settings', requireAdmin, (req, res) => res.json({ ...settings.all(), ai_configured: aiConfigured() }));
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const before = settings.all();
    for (const key of ['org_name', 'ai_enabled', 'ai_auto_analyze']) if (key in (req.body || {})) settings.set(key, req.body[key]);
    const after = settings.all();
    const changes = diff(before, after, ['org_name', 'ai_enabled', 'ai_auto_analyze']);
    if (Object.keys(changes).length) log(req, 'settings.updated', { details: { changes } });
    res.json({ ...after, ai_configured: aiConfigured() });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  return app;
}

import express from 'express';
import {
  questionRepo, callRepo, settingsRepo, userRepo, sessionRepo, auditRepo, payerRepo, lockoutRepo, PAYER_FIELDS,
} from './db.js';
import { PRIOR_AUTH_POLICIES } from './seed-payers.js';
import { evaluateCall, appliesToPayer, skipsNecessity, CALL_TYPES } from './engine/evaluate.js';
import { CATEGORIES } from './seed-questions.js';
import { analyzeTranscript, aiConfigured, AiError } from './ai.js';
import { buildPcs } from './pcs.js';
import {
  ROLES, SESSION_COOKIE, SESSION_TTL_MS, hashPassword, verifyPassword, burnPasswordCheck, passwordProblems,
  generatePassword, newSessionToken, hashToken, parseCookies, sessionCookie,
} from './auth.js';

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

// The visitor's IP address for the audit log. Behind a trusted proxy (Netlify,
// a load balancer) it comes from the proxy's headers.
function clientIp(req) {
  if (process.env.TRUST_PROXY) {
    const forwarded = req.headers['x-nf-client-connection-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.ip || null;
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

// Creates the first administrator when the database has no users, using
// ADMIN_PASSWORD or a generated password (returned so it can be shown).
//
// With { reissue: true } (the local server), a fresh temporary password is
// also issued on each start until that administrator first signs in, so it is
// never lost with an old terminal. Serverless hosts start often, so they
// don't reissue.
export async function ensureInitialAdmin(db, {
  username = process.env.ADMIN_USERNAME || 'admin',
  password = process.env.ADMIN_PASSWORD,
  reissue = false,
} = {}) {
  const users = userRepo(db);
  const audit = auditRepo(db);
  if ((await users.count()) > 0) {
    if (!reissue) return null;
    const list = await users.list();
    const unclaimed = list.length === 1 && list[0].role === 'admin' && !list[0].last_login_at && list[0].must_change_password;
    if (!unclaimed) return null;
    const admin = list[0];
    const generated = password ? null : generatePassword();
    await users.update(admin.id, { password_hash: await hashPassword(password || generated) });
    await audit.log({ user: null, action: 'user.password_reset', entityType: 'user', entityId: admin.id, details: { username: admin.username, reason: 'initial setup not yet completed; reissued at startup' } });
    return { username: admin.username, password: generated, reissued: true };
  }
  const generated = password ? null : generatePassword();
  let user;
  try {
    user = await users.create({
      username,
      display_name: 'Administrator',
      role: 'admin',
      password_hash: await hashPassword(password || generated),
      must_change_password: true,
    });
  } catch (err) {
    if (err.code === '23505') return null; // another instance created it at the same moment
    throw err;
  }
  await audit.log({ user: null, action: 'user.created', entityType: 'user', entityId: user.id, details: { username, role: 'admin', reason: 'initial setup' } });
  return { username, password: generated };
}

// staticDir: folder of web pages to serve (the local server passes public/).
// On Netlify the pages are served by Netlify itself, so it is omitted.
// This module must not use import.meta: Netlify bundles functions as CommonJS.
export function createApp({ db, staticDir = null }) {
  const questions = questionRepo(db);
  const calls = callRepo(db);
  const settings = settingsRepo(db);
  const users = userRepo(db);
  const sessions = sessionRepo(db);
  const audit = auditRepo(db);
  const payers = payerRepo(db);
  const lockout = lockoutRepo(db);

  const activePayer = async (code) => {
    const p = code ? await payers.getByCode(code) : null;
    if (!p?.active) return null;
    // A broker shows which payer program it books for.
    if (p.parent_code) p.parentName = (await payers.getByCode(p.parent_code))?.name || null;
    return p;
  };
  // The payer for a call, plus the active transport brokers that book for it.
  const payerContext = async (code) => {
    const payer = await activePayer(code);
    const brokers = payer && payer.kind !== 'broker'
      ? (await payers.list({ activeOnly: true })).filter((b) => b.kind === 'broker' && b.parent_code === payer.code)
      : [];
    return { payer, brokers };
  };

  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY);

  // On Netlify, /api/* is rewritten to the function; normalize the path back.
  app.use((req, res, next) => {
    if (req.url.startsWith('/.netlify/functions/api')) req.url = `/api${req.url.slice('/.netlify/functions/api'.length)}`;
    next();
  });
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
  if (staticDir) app.use(express.static(staticDir));

  const log = (req, action, extra = {}) => audit.log({ user: req.user, ip: clientIp(req), action, ...extra });

  // --------------------------------------------------------------- auth
  const loadUser = async (req) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = await sessions.get(tokenHash);
    if (!session) return null;
    if (session.expires_at < Date.now()) { await sessions.remove(tokenHash); return null; }
    const user = await users.get(session.user_id);
    if (!user?.active) return null;
    req.sessionTokenHash = tokenHash;
    return user;
  };

  const requireAuth = async (req, res, next) => {
    req.user = await loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    if (req.user.must_change_password) return res.status(403).json({ error: 'You must change your password first.', code: 'PASSWORD_CHANGE_REQUIRED' });
    next();
  };
  const requireAdmin = (req, res, next) => requireAuth(req, res, async () => {
    if (req.user.role !== 'admin') {
      await log(req, 'access.denied', { details: { path: req.originalUrl } });
      return res.status(403).json({ error: 'Administrator access required.', code: 'FORBIDDEN' });
    }
    next();
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) return res.status(400).json({ error: 'Enter your username and password.' });

    if (await lockout.isLocked(username)) {
      await audit.log({ user: null, ip: clientIp(req), action: 'auth.login_blocked', details: { username } });
      return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes or ask an administrator.' });
    }
    const record = await users.getForLogin(username);
    const ok = record ? await verifyPassword(password, record.password_hash) : (await burnPasswordCheck(password), false);
    if (!ok || !record.active) {
      const locked = await lockout.fail(username);
      await audit.log({ user: record || null, ip: clientIp(req), action: 'auth.login_failed', details: { username, reason: !ok ? 'bad_credentials' : 'inactive', locked } });
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    await lockout.clear(username);

    const token = newSessionToken();
    await sessions.purgeExpired();
    await sessions.create(hashToken(token), record.id, Date.now() + SESSION_TTL_MS);
    const user = await users.update(record.id, { last_login_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
    await audit.log({ user, ip: clientIp(req), action: 'auth.login', details: { user_agent: String(req.headers['user-agent'] || '').slice(0, 200) } });
    res.setHeader('Set-Cookie', sessionCookie(req, token, SESSION_TTL_MS / 1000));
    res.json({ user });
  });

  app.post('/api/auth/logout', async (req, res) => {
    req.user = await loadUser(req);
    if (req.user) {
      await sessions.remove(req.sessionTokenHash);
      await log(req, 'auth.logout');
    }
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    res.json({ ok: true });
  });

  app.get('/api/auth/session', async (req, res) => res.json({ user: await loadUser(req), roles: ROLES }));

  app.post('/api/auth/change-password', async (req, res) => {
    req.user = await loadUser(req);
    if (!req.user) return res.status(401).json({ error: 'Please sign in.', code: 'AUTH_REQUIRED' });
    const { currentPassword, newPassword } = req.body || {};
    if (!(await verifyPassword(String(currentPassword || ''), await users.getPasswordHash(req.user.id)))) {
      await log(req, 'auth.password_change_failed', { entityType: 'user', entityId: req.user.id });
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const problems = passwordProblems(newPassword, { username: req.user.username });
    if (newPassword === currentPassword) problems.push('New password must be different from the current one.');
    if (problems.length) return res.status(400).json({ error: problems.join(' ') });
    const user = await users.update(req.user.id, { password_hash: await hashPassword(newPassword), must_change_password: false });
    await sessions.removeForUser(req.user.id, { except: req.sessionTokenHash }); // sign out other devices
    await log(req, 'auth.password_changed', { entityType: 'user', entityId: req.user.id });
    res.json({ user });
  });

  // ------------------------------------------------------------- config
  const publicSettings = async () => {
    const s = await settings.all();
    return {
      orgName: s.org_name,
      aiAvailable: aiConfigured() && s.ai_enabled === 'true',
      aiAutoAnalyze: s.ai_auto_analyze === 'true',
    };
  };
  app.get('/api/public-config', async (req, res) => res.json({ orgName: (await settings.all()).org_name }));
  app.get('/api/config', requireAuth, async (req, res) => {
    res.json({
      ...(await publicSettings()), callTypes: CALL_TYPES, categories: CATEGORIES, answerTypes: ANSWER_TYPES,
      criteria: CRITERIA, alertLevels: ALERT_LEVELS, roles: ROLES, priorAuthPolicies: PRIOR_AUTH_POLICIES,
      payers: (await payers.list({ activeOnly: true })).map((p) => ({ code: p.code, name: p.name, kind: p.kind })),
    });
  });

  // ------------------------------------------------------ call taker API
  app.get('/api/questions', requireAuth, async (req, res) => res.json(await questions.list({ activeOnly: true })));

  app.post('/api/evaluate', requireAuth, async (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '', payer = '' } = req.body || {};
    if (!(callType in CALL_TYPES)) return res.status(400).json({ error: 'Invalid call type.' });
    const [context, bank] = await Promise.all([payerContext(payer), questions.list({ activeOnly: true })]);
    res.json(evaluateCall({ callType, answers, transcript, ...context, questions: bank }));
  });

  app.post('/api/ai/analyze', requireAuth, async (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '', payer: payerCode = '' } = req.body || {};
    if (!(await publicSettings()).aiAvailable) return res.status(503).json({ error: 'AI analysis is not enabled.' });
    if (!String(transcript).trim()) return res.status(400).json({ error: 'Transcript is empty.' });
    // PHI leaves the system here, so every request is recorded.
    await log(req, 'ai.analyze', { details: { transcript_chars: String(transcript).length, call_type: callType } });
    try {
      const payer = await activePayer(payerCode);
      const bank = await questions.list({ activeOnly: true });
      res.json(await analyzeTranscript({
        transcript,
        callType: payer ? `${callType} — payer: ${payer.name}` : callType,
        answers,
        questions: bank.filter((q) => appliesToPayer(q, payer) && !(skipsNecessity(payer) && q.necessity)),
      }));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      console.error('AI analysis failed:', err);
      res.status(500).json({ error: 'AI analysis failed.' });
    }
  });

  // Validates a call from the console and re-evaluates it server-side so the
  // stored assessment can't be tampered with.
  const callFromBody = async (body = {}) => {
    const { callType, details = {}, answers = {}, transcript = '', payer: payerCode = '' } = body;
    if (!(callType in CALL_TYPES)) return { error: 'Invalid call type.' };
    const { payer, brokers } = await payerContext(payerCode);
    const { assessment } = evaluateCall({ callType, answers, transcript, payer, brokers, questions: await questions.list({ activeOnly: true }) });
    return { callType, payer: payer?.code, details, answers, transcript, assessment };
  };
  // Call takers can reach their own calls; administrators can reach any call.
  const ownCall = async (req, res) => {
    const call = await calls.get(Number(req.params.id) || 0);
    if (!call || (req.user.role !== 'admin' && call.user_id !== req.user.id)) {
      res.status(404).json({ error: 'Call not found.' });
      return null;
    }
    return call;
  };

  app.post('/api/calls', requireAuth, async (req, res) => {
    const input = await callFromBody(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const call = await calls.create({ ...input, callTaker: req.user.display_name, userId: req.user.id });
    await log(req, 'call.saved', { entityType: 'call', entityId: call.id, details: { call_type: input.callType, payer: input.payer || null, status: call.status } });
    res.status(201).json({ id: call.id, status: call.status, created_at: call.created_at });
  });

  app.put('/api/calls/:id', requireAuth, async (req, res) => {
    const existing = await ownCall(req, res);
    if (!existing) return;
    const input = await callFromBody(req.body);
    if (input.error) return res.status(400).json({ error: input.error });
    const call = await calls.update(existing.id, input);
    await log(req, 'call.updated', { entityType: 'call', entityId: call.id, details: { call_type: input.callType, payer: input.payer || null, status: call.status } });
    res.json({ id: call.id, status: call.status, created_at: call.created_at });
  });

  app.get('/api/calls/:id/pcs', requireAuth, async (req, res) => {
    const call = await ownCall(req, res);
    if (!call) return;
    const payer = call.payer ? await payers.getByCode(call.payer) : null;
    const pcs = buildPcs({ call, payer, questions: await questions.list({ activeOnly: true }), orgName: (await settings.all()).org_name });
    await log(req, 'pcs.generated', { entityType: 'call', entityId: call.id });
    res.json(pcs);
  });

  // -------------------------------------------------- admin: questions
  const QUESTION_AUDIT_FIELDS = ['code', 'category', 'text', 'guidance', 'answer_type', 'options', 'call_types', 'payers', 'criterion', 'qualifying_answer',
    'triggers', 'detect_yes', 'detect_no', 'depends_on_code', 'depends_on_answer', 'priority', 'sort_order', 'required', 'alert_answer',
    'alert_text', 'alert_level', 'active', 'necessity'];

  app.get('/api/admin/questions', requireAdmin, async (req, res) => res.json(await questions.list()));

  const unknownPayers = async (input) => {
    const codes = new Set((await payers.list()).map((p) => p.code));
    return (input.payers || []).filter((c) => c !== '@broker' && !codes.has(c));
  };

  app.post('/api/admin/questions', requireAdmin, async (req, res) => {
    const errors = validateQuestion(req.body || {});
    if ((await unknownPayers(req.body || {})).length) errors.push('Unknown payer.');
    if (await questions.getByCode(req.body?.code)) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const q = await questions.create(req.body);
    await log(req, 'question.created', { entityType: 'question', entityId: q.code, details: { text: q.text, category: q.category, criterion: q.criterion } });
    res.status(201).json(q);
  });

  app.put('/api/admin/questions/:id', requireAdmin, async (req, res) => {
    const existing = await questions.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    const input = { ...req.body };
    if (existing.is_system) delete input.code; // system codes are referenced by the engine
    const errors = validateQuestion({ answer_type: existing.answer_type, ...input }, { partial: true });
    if ((await unknownPayers(input)).length) errors.push('Unknown payer.');
    if (input.code && input.code !== existing.code && (await questions.getByCode(input.code))) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const updated = await questions.update(existing.id, input);
    const changes = diff(existing, updated, QUESTION_AUDIT_FIELDS);
    if (Object.keys(changes).length) await log(req, 'question.updated', { entityType: 'question', entityId: updated.code, details: { changes } });
    res.json(updated);
  });

  app.delete('/api/admin/questions/:id', requireAdmin, async (req, res) => {
    const existing = await questions.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'Built-in questions cannot be deleted. Deactivate it instead.' });
    await questions.remove(existing.id);
    await log(req, 'question.deleted', { entityType: 'question', entityId: existing.code, details: { text: existing.text } });
    res.status(204).end();
  });

  // ----------------------------------------------------- admin: payers
  // A broker's parent must be an existing payer (not another broker).
  const parentProblems = async (input, self) => {
    if (!input.parent_code) return [];
    const parent = await payers.getByCode(input.parent_code);
    if (!parent || parent.kind === 'broker' || parent.code === self) return ['Choose a payer program for this broker.'];
    return [];
  };

  app.get('/api/admin/payers', requireAdmin, async (req, res) => res.json(await payers.list()));

  app.post('/api/admin/payers', requireAdmin, async (req, res) => {
    const errors = validatePayer(req.body || {});
    if (!('prior_auth' in (req.body || {}))) errors.push('Choose a prior-authorization policy for every call type.');
    if (await payers.getByCode(req.body?.code)) errors.push('A payer with this code already exists.');
    errors.push(...(await parentProblems(req.body || {}, req.body?.code)));
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const p = await payers.create(req.body);
    await log(req, 'payer.created', { entityType: 'payer', entityId: p.code, details: { name: p.name, prior_auth: p.prior_auth } });
    res.status(201).json(p);
  });

  app.put('/api/admin/payers/:id', requireAdmin, async (req, res) => {
    const existing = await payers.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'Payer not found.' });
    const input = { ...req.body };
    delete input.code; // questions reference payers by code
    const errors = validatePayer(input, { partial: true });
    errors.push(...(await parentProblems(input, existing.code)));
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const updated = await payers.update(existing.id, input);
    const changes = diff(existing, updated, PAYER_FIELDS);
    if (Object.keys(changes).length) await log(req, 'payer.updated', { entityType: 'payer', entityId: existing.code, details: { changes } });
    res.json(updated);
  });

  app.delete('/api/admin/payers/:id', requireAdmin, async (req, res) => {
    const existing = await payers.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'Payer not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'Built-in payers cannot be deleted. Deactivate it instead.' });
    const linkedBrokers = (await payers.list()).filter((b) => b.parent_code === existing.code).map((b) => b.name);
    if (linkedBrokers.length) return res.status(400).json({ error: `These transport brokers book for this payer — change or delete them first: ${linkedBrokers.join(', ')}.` });
    const used = (await questions.list()).filter((q) => q.payers.includes(existing.code)).map((q) => q.code);
    if (used.length) return res.status(400).json({ error: `Remove this payer from these questions first: ${used.join(', ')}.` });
    await payers.remove(existing.id);
    await log(req, 'payer.deleted', { entityType: 'payer', entityId: existing.code, details: { name: existing.name } });
    res.status(204).end();
  });

  // ------------------------------------------------------ admin: calls
  app.get('/api/admin/calls', requireAdmin, async (req, res) => {
    await log(req, 'call.list_viewed');
    res.json(await calls.list());
  });
  app.get('/api/admin/calls/:id', requireAdmin, async (req, res) => {
    const call = await calls.get(Number(req.params.id) || 0);
    if (!call) return res.status(404).json({ error: 'Call not found.' });
    await log(req, 'call.viewed', { entityType: 'call', entityId: call.id });
    res.json(call);
  });

  app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    const [all, userList, callStats] = await Promise.all([questions.list(), users.list(), calls.stats()]);
    res.json({
      questions: { total: all.length, active: all.filter((q) => q.active).length, custom: all.filter((q) => !q.is_system).length },
      users: { active: userList.filter((u) => u.active).length, total: userList.length },
      calls: callStats,
    });
  });

  // ------------------------------------------------------ admin: users
  app.get('/api/admin/users', requireAdmin, async (req, res) => res.json(await users.list()));

  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const displayName = String(req.body?.display_name || '').trim();
    const role = req.body?.role;
    const errors = [];
    if (!USERNAME_RE.test(username)) errors.push('Username must be 3–32 characters: letters, digits, dot, dash or underscore.');
    if (!displayName) errors.push('Full name is required.');
    if (!(role in ROLES)) errors.push('Invalid role.');
    if (await users.getForLogin(username)) errors.push('That username is already taken.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    const temporaryPassword = generatePassword();
    const user = await users.create({ username, display_name: displayName, role, password_hash: await hashPassword(temporaryPassword), must_change_password: true });
    await log(req, 'user.created', { entityType: 'user', entityId: user.id, details: { username, display_name: displayName, role } });
    res.status(201).json({ user, temporaryPassword });
  });

  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    const existing = await users.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'User not found.' });
    const body = req.body || {};
    const fields = {};
    if ('display_name' in body) {
      fields.display_name = String(body.display_name || '').trim();
      if (!fields.display_name) return res.status(400).json({ error: 'Full name is required.' });
    }
    if ('role' in body) {
      if (!(body.role in ROLES)) return res.status(400).json({ error: 'Invalid role.' });
      fields.role = body.role;
    }
    if ('active' in body) fields.active = Boolean(body.active);

    const losesAdmin = existing.role === 'admin' && existing.active && (fields.role === 'call_taker' || fields.active === false);
    if (losesAdmin && existing.id === req.user.id) return res.status(400).json({ error: 'You cannot remove your own administrator access.' });
    if (losesAdmin && (await users.countActiveAdmins()) <= 1) return res.status(400).json({ error: 'At least one active administrator is required.' });

    const updated = await users.update(existing.id, fields);
    if (fields.active === false) await sessions.removeForUser(existing.id); // sign out immediately
    const changes = diff(existing, updated, ['display_name', 'role', 'active']);
    if (Object.keys(changes).length) {
      const action = 'active' in changes ? (updated.active ? 'user.activated' : 'user.deactivated') : 'user.updated';
      await log(req, action, { entityType: 'user', entityId: existing.id, details: { username: existing.username, changes } });
    }
    res.json(updated);
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    const existing = await users.get(Number(req.params.id) || 0);
    if (!existing) return res.status(404).json({ error: 'User not found.' });
    const temporaryPassword = generatePassword();
    const user = await users.update(existing.id, { password_hash: await hashPassword(temporaryPassword), must_change_password: true });
    await sessions.removeForUser(existing.id);
    await lockout.clear(existing.username);
    await log(req, 'user.password_reset', { entityType: 'user', entityId: existing.id, details: { username: existing.username } });
    res.json({ user, temporaryPassword });
  });

  // ------------------------------------------------------ admin: audit
  const auditFilters = (q) => ({ userId: q.user_id, action: q.action, from: q.from, to: q.to, q: q.q ? String(q.q).slice(0, 100) : '' });

  app.get('/api/admin/audit', requireAdmin, async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [page, actions] = await Promise.all([audit.list(auditFilters(req.query), { limit, offset }), audit.actions()]);
    res.json({ ...page, actions });
  });

  app.get('/api/admin/audit/export.csv', requireAdmin, async (req, res) => {
    const filters = auditFilters(req.query);
    const { rows } = await audit.list(filters, { limit: 100000 });
    await log(req, 'audit.exported', { details: { rows: rows.length, filters } });
    const header = ['id', 'timestamp_utc', 'user_id', 'username', 'action', 'entity_type', 'entity_id', 'ip', 'details'];
    const lines = rows.map((r) => [r.id, r.created_at, r.user_id, r.username, r.action, r.entity_type, r.entity_id, r.ip, r.details].map(csvCell).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ambuintake-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header.join(','), ...lines].join('\r\n'));
  });

  // --------------------------------------------------- admin: settings
  app.get('/api/admin/settings', requireAdmin, async (req, res) => res.json({ ...(await settings.all()), ai_configured: aiConfigured() }));
  app.put('/api/admin/settings', requireAdmin, async (req, res) => {
    const before = await settings.all();
    for (const key of ['org_name', 'ai_enabled', 'ai_auto_analyze']) {
      if (key in (req.body || {})) await settings.set(key, req.body[key]);
    }
    const after = await settings.all();
    const changes = diff(before, after, ['org_name', 'ai_enabled', 'ai_auto_analyze']);
    if (Object.keys(changes).length) await log(req, 'settings.updated', { details: { changes } });
    res.json({ ...after, ai_configured: aiConfigured() });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // Unexpected failures (e.g. the database is unreachable) return JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error('Request failed:', req.method, req.originalUrl, err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}

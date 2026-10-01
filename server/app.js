import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, questionRepo, callRepo, settingsRepo } from './db.js';
import { evaluateCall, CALL_TYPES } from './engine/evaluate.js';
import { CATEGORIES } from './seed-questions.js';
import { analyzeTranscript, aiConfigured, AiError } from './ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const ANSWER_TYPES = ['yes_no', 'choice', 'text', 'number'];
const CRITERIA = ['emergency', 'bed_confined', 'condition', 'als', 'sct', 'disqualifier', 'documentation', 'info'];
const ALERT_LEVELS = ['info', 'warning', 'critical'];
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function createApp({ db = openDb(), adminPassword = process.env.ADMIN_PASSWORD || 'admin' } = {}) {
  const questions = questionRepo(db);
  const calls = callRepo(db);
  const settings = settingsRepo(db);
  const sessions = new Map();

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(here, '..', 'public')));

  // --------------------------------------------------------------- auth
  const currentSession = (req) => {
    const token = parseCookies(req.headers.cookie).lynx_admin;
    const s = token && sessions.get(token);
    if (!s || s.expires < Date.now()) return null;
    return s;
  };
  const requireAdmin = (req, res, next) => {
    if (!currentSession(req)) return res.status(401).json({ error: 'Admin login required.' });
    next();
  };

  app.post('/api/admin/login', (req, res) => {
    const supplied = Buffer.from(String(req.body?.password || ''));
    const expected = Buffer.from(adminPassword);
    const ok = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { expires: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie', `lynx_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`);
    res.json({ ok: true });
  });
  app.post('/api/admin/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie).lynx_admin;
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', 'lynx_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });
  app.get('/api/admin/session', (req, res) => res.json({ authenticated: Boolean(currentSession(req)) }));

  // ------------------------------------------------------------- config
  const publicSettings = () => {
    const s = settings.all();
    return {
      orgName: s.org_name,
      aiAvailable: aiConfigured() && s.ai_enabled === 'true',
      aiAutoAnalyze: s.ai_auto_analyze === 'true',
    };
  };
  app.get('/api/config', (req, res) => {
    res.json({ ...publicSettings(), callTypes: CALL_TYPES, categories: CATEGORIES, answerTypes: ANSWER_TYPES, criteria: CRITERIA, alertLevels: ALERT_LEVELS });
  });

  // ------------------------------------------------------ call taker API
  app.get('/api/questions', (req, res) => res.json(questions.list({ activeOnly: true })));

  app.post('/api/evaluate', (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '' } = req.body || {};
    if (!(callType in CALL_TYPES)) return res.status(400).json({ error: 'Invalid call type.' });
    res.json(evaluateCall({ callType, answers, transcript, questions: questions.list({ activeOnly: true }) }));
  });

  app.post('/api/ai/analyze', async (req, res) => {
    const { callType = 'non_emergency', answers = {}, transcript = '' } = req.body || {};
    if (!publicSettings().aiAvailable) return res.status(503).json({ error: 'AI analysis is not enabled.' });
    if (!String(transcript).trim()) return res.status(400).json({ error: 'Transcript is empty.' });
    try {
      res.json(await analyzeTranscript({ transcript, callType, answers, questions: questions.list({ activeOnly: true }) }));
    } catch (err) {
      if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
      console.error('AI analysis failed:', err);
      res.status(500).json({ error: 'AI analysis failed.' });
    }
  });

  app.post('/api/calls', (req, res) => {
    const { callType, details = {}, answers = {}, transcript = '', callTaker = '' } = req.body || {};
    if (!(callType in CALL_TYPES)) return res.status(400).json({ error: 'Invalid call type.' });
    // Re-evaluate server-side so the stored assessment can't be tampered with.
    const { assessment } = evaluateCall({ callType, answers, transcript, questions: questions.list({ activeOnly: true }) });
    const call = calls.create({ callType, details, answers, transcript, assessment, callTaker });
    res.status(201).json({ id: call.id, status: call.status, created_at: call.created_at });
  });

  // ------------------------------------------------------------ admin API
  app.get('/api/admin/questions', requireAdmin, (req, res) => res.json(questions.list()));

  app.post('/api/admin/questions', requireAdmin, (req, res) => {
    const errors = validateQuestion(req.body || {});
    if (questions.getByCode(req.body?.code)) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    res.status(201).json(questions.create(req.body));
  });

  app.put('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const existing = questions.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    const input = { ...req.body };
    if (existing.is_system) delete input.code; // system codes are referenced by the engine
    const errors = validateQuestion({ answer_type: existing.answer_type, ...input }, { partial: true });
    if (input.code && input.code !== existing.code && questions.getByCode(input.code)) errors.push('A question with this code already exists.');
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });
    res.json(questions.update(existing.id, input));
  });

  app.delete('/api/admin/questions/:id', requireAdmin, (req, res) => {
    const existing = questions.get(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Question not found.' });
    if (existing.is_system) return res.status(400).json({ error: 'Built-in questions cannot be deleted. Deactivate it instead.' });
    questions.remove(existing.id);
    res.status(204).end();
  });

  app.get('/api/admin/calls', requireAdmin, (req, res) => res.json(calls.list()));
  app.get('/api/admin/calls/:id', requireAdmin, (req, res) => {
    const call = calls.get(Number(req.params.id));
    if (!call) return res.status(404).json({ error: 'Call not found.' });
    res.json(call);
  });

  app.get('/api/admin/stats', requireAdmin, (req, res) => {
    const all = questions.list();
    res.json({
      questions: { total: all.length, active: all.filter((q) => q.active).length, custom: all.filter((q) => !q.is_system).length },
      calls: calls.stats(),
    });
  });

  app.get('/api/admin/settings', requireAdmin, (req, res) => res.json({ ...settings.all(), ai_configured: aiConfigured() }));
  app.put('/api/admin/settings', requireAdmin, (req, res) => {
    const allowed = ['org_name', 'ai_enabled', 'ai_auto_analyze'];
    for (const key of allowed) if (key in (req.body || {})) settings.set(key, req.body[key]);
    res.json({ ...settings.all(), ai_configured: aiConfigured() });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  return app;
}

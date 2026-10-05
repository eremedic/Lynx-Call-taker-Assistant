import { api, esc, toast, debounce, requireUser, mountUserMenu, STATUS_LABELS, CRITERION_LABELS, CRITERION_CHIPS, formatAnswer } from './common.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  user: null,
  config: null,
  questions: [],
  byCode: new Map(),
  callType: 'non_emergency',
  payer: '',
  details: {},
  answers: {},
  transcript: '',
  evaluation: null,
  rejected: new Set(), // `${code}|${answer}` suggestions the call taker dismissed
  skipped: new Set(),
  aiSuggestions: {},
  aiQuestions: [],
  aiSummary: '',
  aiBusy: false,
  aiAnalyzedLength: 0,
  startedAt: null,
  dirty: false,
  savedId: null,
};

// ------------------------------------------------------------------ setup
async function init() {
  state.user = await requireUser();
  mountUserMenu($('#user-menu'), state.user);
  $('#admin-link').hidden = state.user.role !== 'admin';
  if (new URLSearchParams(location.search).has('denied')) {
    toast('That page requires administrator access.', 'error');
    history.replaceState(null, '', location.pathname);
  }
  window.lynxBeforeSignOut = () => !state.dirty || confirm('Sign out and discard the current call? It has unsaved changes.');
  try {
    const [config, questions] = await Promise.all([api('/api/config'), api('/api/questions')]);
    state.config = config;
    setQuestions(questions);
    $('#org-name').textContent = config.orgName ? `${config.orgName} · Call-Taker Assistant` : 'Call-Taker Assistant';
    $('#ai-btn').hidden = !config.aiAvailable;
    $('#payer').innerHTML = '<option value="">Select payer…</option>'
      + config.payers.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('');
  } catch (err) {
    toast(`Could not load configuration: ${err.message}`, 'error');
    return;
  }
  bindEvents();
  setupSpeech();
  setInterval(tickTimer, 1000);
  setCallType('non_emergency');
}

function setQuestions(list) {
  state.questions = list;
  state.byCode = new Map(list.map((q) => [q.code, q]));
}

function bindEvents() {
  document.querySelectorAll('#call-type button').forEach((b) =>
    b.addEventListener('click', () => { markActive(); setCallType(b.dataset.type); }));

  document.querySelectorAll('[data-detail]').forEach((input) =>
    input.addEventListener('input', () => {
      markActive();
      state.details[input.dataset.detail] = input.value;
    }));

  $('#payer').addEventListener('change', (e) => {
    markActive();
    state.payer = e.target.value;
    evaluate();
  });

  const transcript = $('#transcript');
  transcript.addEventListener('input', () => {
    markActive();
    state.transcript = transcript.value;
    evaluateSoon();
    maybeAutoAnalyze();
  });

  $('#accept-all').addEventListener('click', () => {
    for (const s of currentSuggestions()) state.answers[s.code] = s.answer;
    evaluate();
  });
  $('#ai-btn').addEventListener('click', () => runAi());
  $('#save-call').addEventListener('click', saveCall);
  $('#copy-summary').addEventListener('click', copyNarrative);
  $('#print').addEventListener('click', () => window.print());
  $('#new-call').addEventListener('click', newCall);

  // Delegated handlers for dynamically rendered answer controls.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-answer]');
    if (btn) {
      const { code, answer } = btn.dataset;
      setAnswer(code, state.answers[code] === answer ? '' : answer);
      return;
    }
    const accept = e.target.closest('[data-accept]');
    if (accept) return setAnswer(accept.dataset.accept, accept.dataset.value);
    const reject = e.target.closest('[data-reject]');
    if (reject) {
      state.rejected.add(`${reject.dataset.reject}|${reject.dataset.value}`);
      return render();
    }
    const skip = e.target.closest('[data-skip]');
    if (skip) {
      state.skipped.add(skip.dataset.skip);
      return render();
    }
    const toggle = e.target.closest('[data-toggle-cat]');
    if (toggle) {
      const body = toggle.nextElementSibling;
      body.hidden = !body.hidden;
      toggle.setAttribute('aria-expanded', String(!body.hidden));
      return;
    }
    const asked = e.target.closest('[data-ai-asked]');
    if (asked) {
      const q = state.aiQuestions[Number(asked.dataset.aiAsked)];
      q.asked = !q.asked;
      renderAiQuestions();
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-answer-input]');
    if (el) setAnswer(el.dataset.answerInput, el.value);
    const note = e.target.closest('[data-ai-note]');
    if (note) state.aiQuestions[Number(note.dataset.aiNote)].note = note.value;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-answer-input]') && e.target.tagName === 'INPUT') e.target.blur();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) e.preventDefault();
  });
}

function markActive() {
  if (!state.startedAt) state.startedAt = Date.now();
  state.dirty = true;
}

function tickTimer() {
  const el = $('#call-timer');
  if (!state.startedAt) { el.textContent = '00:00'; el.classList.remove('live'); return; }
  const s = Math.floor((Date.now() - state.startedAt) / 1000);
  el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  el.classList.toggle('live', !state.savedId);
}

function setCallType(type) {
  state.callType = type;
  document.querySelectorAll('#call-type button').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === type);
    b.setAttribute('aria-checked', String(b.dataset.type === type));
  });
  evaluate();
}

function setAnswer(code, value) {
  markActive();
  if (value === undefined || value === null || String(value).trim() === '') delete state.answers[code];
  else state.answers[code] = value;
  evaluate();
}

// ------------------------------------------------------------- evaluation
let evalSeq = 0;
async function evaluate() {
  const seq = ++evalSeq;
  try {
    const result = await api('/api/evaluate', {
      method: 'POST',
      body: { callType: state.callType, payer: state.payer, answers: state.answers, transcript: state.transcript },
    });
    if (seq !== evalSeq) return; // a newer evaluation is in flight
    state.evaluation = result;
    render();
  } catch (err) {
    toast(`Evaluation failed: ${err.message}`, 'error');
  }
}
const evaluateSoon = debounce(evaluate, 250);

function currentSuggestions() {
  const ev = state.evaluation;
  if (!ev) return [];
  const out = new Map();
  for (const [code, s] of Object.entries(ev.suggestions)) {
    out.set(code, { code, answer: s.answer, evidence: s.evidence, source: 'Heard' });
  }
  for (const [code, s] of Object.entries(state.aiSuggestions)) {
    const q = state.byCode.get(code);
    if (!q || out.has(code)) continue;
    if (q.call_types.length && !q.call_types.includes(state.callType)) continue;
    if (q.payers.length && !q.payers.includes(state.payer)) continue;
    out.set(code, { code, answer: s.answer, evidence: s.evidence, source: 'AI' });
  }
  return [...out.values()].filter((s) =>
    String(state.answers[s.code] ?? '').toLowerCase() !== String(s.answer).toLowerCase()
    && !state.rejected.has(`${s.code}|${s.answer}`));
}

// ----------------------------------------------------------------- render
function render() {
  if (!state.evaluation) return;
  const focus = captureFocus();
  renderAskNext();
  renderSuggestions();
  renderChecklist();
  renderAssessment();
  restoreFocus(focus);
}

function captureFocus() {
  const el = document.activeElement;
  if (!el?.dataset?.answerInput) return null;
  return { code: el.dataset.answerInput, value: el.value, start: el.selectionStart, end: el.selectionEnd, where: el.closest('#ask-next') ? 'ask' : 'list' };
}
function restoreFocus(f) {
  if (!f) return;
  const scope = f.where === 'ask' ? '#ask-next' : '#checklist';
  const el = document.querySelector(`${scope} [data-answer-input="${CSS.escape(f.code)}"]`);
  if (!el) return;
  el.value = f.value;
  el.focus();
  try { el.setSelectionRange(f.start, f.end); } catch { /* not a text input */ }
}

function answerControls(q, { large = false } = {}) {
  const current = state.answers[q.code];
  const size = large ? '' : 'btn-sm';
  if (q.answer_type === 'yes_no') {
    return `
      <button type="button" class="btn ${size} btn-yes ${current === 'yes' ? 'active' : ''}" data-code="${esc(q.code)}" data-answer="yes">Yes</button>
      <button type="button" class="btn ${size} btn-no ${current === 'no' ? 'active' : ''}" data-code="${esc(q.code)}" data-answer="no">No</button>`;
  }
  if (q.answer_type === 'choice') {
    if (large) {
      return q.options.map((o) => `<button type="button" class="btn btn-choice ${current === o ? 'active' : ''}" data-code="${esc(q.code)}" data-answer="${esc(o)}">${esc(o)}</button>`).join('');
    }
    return `<select class="select" data-answer-input="${esc(q.code)}" aria-label="${esc(q.text)}">
      <option value="">Select…</option>
      ${q.options.map((o) => `<option ${current === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  const type = q.answer_type === 'number' ? 'number' : 'text';
  return `<input class="input" type="${type}" data-answer-input="${esc(q.code)}" value="${esc(current ?? '')}" placeholder="Type answer, press Enter" aria-label="${esc(q.text)}" ${large ? 'style="max-width: 460px"' : ''}>`;
}

function renderAskNext() {
  const ev = state.evaluation;
  const box = $('#ask-next');
  const queue = ev.queue.filter((c) => !state.skipped.has(c));
  const code = queue[0] || (ev.nextQuestion && !state.skipped.has(ev.nextQuestion) ? ev.nextQuestion : null);
  const pending = currentSuggestions().length;

  if (!code) {
    box.classList.add('done');
    box.innerHTML = `
      <div class="eyebrow" style="color: var(--green-600)">✓ Interview complete</div>
      <div class="question">${pending ? `Confirm the ${pending} detected answer${pending > 1 ? 's' : ''} below.` : 'All prompted questions have been addressed.'}</div>
      <div class="guidance">${state.skipped.size ? `${state.skipped.size} question(s) were skipped — they are still listed in the checklist.` : 'Review the assessment and save the call record.'}</div>`;
    return;
  }
  const q = state.byCode.get(code);
  box.classList.remove('done');
  const heard = ev.triggeredCodes.includes(code);
  const upNext = queue.slice(1, 4).map((c) => `<li>${esc(state.byCode.get(c)?.text)}</li>`).join('');
  box.innerHTML = `
    <div class="eyebrow">Ask next
      ${q.criterion !== 'info' ? `<span class="chip ${CRITERION_CHIPS[q.criterion] || ''}">${esc(CRITERION_LABELS[q.criterion] || q.criterion)}</span>` : ''}
      ${q.required ? '<span class="chip chip-amber">Required</span>' : ''}
      ${heard ? '<span class="chip chip-violet">Based on conversation</span>' : ''}
    </div>
    <div class="question">${esc(q.text)}</div>
    ${q.guidance ? `<div class="guidance">${esc(q.guidance)}</div>` : ''}
    <div class="controls">
      ${answerControls(q, { large: true })}
      <button type="button" class="btn btn-ghost" data-skip="${esc(code)}">Skip</button>
    </div>
    ${upNext ? `<div class="up-next">Up next<ol>${upNext}</ol></div>` : ''}`;
}

function renderSuggestions() {
  const list = currentSuggestions();
  $('#suggestions-card').hidden = list.length === 0;
  $('#suggestions').innerHTML = list.map((s) => {
    const q = state.byCode.get(s.code);
    return `
      <div class="suggestion">
        <div class="body">
          <div class="q">${esc(q?.text || s.code)}</div>
          <div class="evidence">“${esc(s.evidence)}”</div>
        </div>
        <div class="actions">
          <span class="chip ${s.source === 'AI' ? 'chip-violet' : 'chip-blue'}">${esc(s.source)}: ${esc(formatAnswer(s.answer))}</span>
          <button type="button" class="btn btn-sm btn-primary" data-accept="${esc(s.code)}" data-value="${esc(s.answer)}">Accept</button>
          <button type="button" class="btn btn-sm btn-ghost" data-reject="${esc(s.code)}" data-value="${esc(s.answer)}" aria-label="Dismiss">✕</button>
        </div>
      </div>`;
  }).join('');
}

function renderChecklist() {
  const ev = state.evaluation;
  const visible = new Set(ev.visibleCodes);
  const sugg = new Map(currentSuggestions().map((s) => [s.code, s]));
  const groups = new Map();
  for (const q of state.questions) {
    if (!visible.has(q.code)) continue;
    if (!groups.has(q.category)) groups.set(q.category, []);
    groups.get(q.category).push(q);
  }
  // Preserve collapsed state between renders.
  const collapsed = new Set([...document.querySelectorAll('#checklist .cat-group')]
    .filter((g) => g.querySelector('.cat-body')?.hidden).map((g) => g.dataset.cat));

  let answered = 0;
  let html = '';
  for (const [cat, qs] of groups) {
    const done = qs.filter((q) => state.answers[q.code] !== undefined).length;
    answered += done;
    html += `
      <div class="cat-group" data-cat="${esc(cat)}">
        <button type="button" class="cat-head" data-toggle-cat aria-expanded="${!collapsed.has(cat)}">
          <span>${esc(cat)}</span><span class="count">${done}/${qs.length} answered</span>
        </button>
        <div class="cat-body" ${collapsed.has(cat) ? 'hidden' : ''}>
          ${qs.map((q) => {
            const s = sugg.get(q.code);
            const isAnswered = state.answers[q.code] !== undefined;
            return `
              <div class="q-row ${isAnswered ? 'answered' : ''} ${ev.nextQuestion === q.code ? 'next' : ''}">
                <div>
                  <div class="q-text">${esc(q.text)}</div>
                  <div class="q-meta">
                    <span class="chip ${CRITERION_CHIPS[q.criterion] || ''}">${esc(CRITERION_LABELS[q.criterion] || q.criterion)}</span>
                    ${q.required ? '<span class="chip chip-amber">Required</span>' : ''}
                    ${!q.is_system ? '<span class="chip">Custom</span>' : ''}
                    ${s ? `<span class="chip ${s.source === 'AI' ? 'chip-violet' : 'chip-blue'}">${esc(s.source)}: ${esc(formatAnswer(s.answer))}</span>` : ''}
                  </div>
                </div>
                <div class="q-controls">${answerControls(q)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }
  $('#checklist').innerHTML = html || '<div class="empty">No questions configured.</div>';
  $('#checklist-count').textContent = `${answered} of ${ev.visibleCodes.length} answered`;
}

function checkItem(mark, text) {
  const symbol = mark === 'ok' ? '✓' : mark === 'bad' ? '✕' : '•';
  return `<li><span class="mark ${mark}">${symbol}</span><span>${esc(text)}</span></li>`;
}

const PA_CHIPS = { required: 'chip-red', varies: 'chip-amber', not_required: 'chip-green' };

function renderPayer(p) {
  $('#payer-card').hidden = !p;
  if (!p) return;
  $('#payer-name').textContent = p.name;
  const pa = $('#payer-pa');
  pa.className = `chip ${PA_CHIPS[p.priorAuth] || ''}`;
  pa.textContent = p.priorAuthLabel;
  $('#payer-pa-note').textContent = p.priorAuthNote;
  const c = p.contact;
  const safeUrl = /^https:\/\//i.test(c.url) ? c.url : '';
  $('#payer-contact').innerHTML = [
    c.name && `<div><strong>Contact:</strong> ${esc(c.name)}</div>`,
    c.phone && `<div><strong>Phone:</strong> <a href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">${esc(c.phone)}</a></div>`,
    safeUrl && `<div><strong>Portal:</strong> <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(safeUrl)}</a></div>`,
  ].filter(Boolean).join('');
}

function renderAssessment() {
  const a = state.evaluation.assessment;
  const banner = $('#status-banner');
  banner.className = `status-banner status-${a.status}`;
  $('#status-value').textContent = STATUS_LABELS[a.status] || a.status;
  $('#status-label').textContent = `Medical necessity · ${a.payer ? a.payer.name : 'CMS criteria'}`;
  $('#status-summary').textContent = a.summary;
  $('#emergency-bar').hidden = !(a.emergencyFlag && state.callType !== 'emergency');

  $('#progress-bar').style.width = `${a.progress.percent}%`;
  $('#progress-text').textContent = `${a.progress.answered}/${a.progress.total} · ${a.progress.percent}%`;
  $('#los-name').textContent = a.levelOfService.label;
  $('#los-code').hidden = !a.levelOfService.hcpcs;
  $('#los-code').textContent = a.levelOfService.hcpcs ? `HCPCS ${a.levelOfService.hcpcs}` : '';

  renderPayer(a.payer);

  $('#alerts-card').hidden = a.alerts.length === 0;
  const icons = { critical: '⚠', warning: '!', info: 'i' };
  $('#alerts').innerHTML = a.alerts.map((al) =>
    `<div class="alert alert-${esc(al.level)}"><span class="icon">${icons[al.level] || '!'}</span><span>${esc(al.text)}</span></div>`).join('');

  const bedShort = { BED_GET_UP: 'Unable to get up from bed without assistance', BED_AMBULATE: 'Unable to ambulate', BED_SIT: 'Unable to sit in a chair or wheelchair' };
  $('#bed-list').innerHTML = a.bedConfinement.components.map((c) => {
    const mark = c.met ? 'ok' : c.answer ? 'bad' : 'open';
    return checkItem(mark, bedShort[c.code] || c.text);
  }).join('') || '<li class="muted small">Not applicable</li>';

  $('#support-list').innerHTML = a.supporting.length
    ? a.supporting.map((s) => checkItem('ok', s.text)).join('')
    : '<li class="muted small">None documented yet.</li>';

  $('#disq-wrap').hidden = a.disqualifiers.length === 0;
  $('#disq-list').innerHTML = a.disqualifiers.map((d) => checkItem('bad', d.text)).join('');

  $('#missing-card').hidden = a.missing.length === 0;
  $('#missing-list').innerHTML = a.missing.map((m) => checkItem('open', m.text)).join('');

  $('#doc-list').innerHTML = [
    ...a.documentationGaps.map((t) => checkItem('bad', t)),
    ...a.documentation.map((t) => checkItem('open', t)),
  ].join('');
}

// --------------------------------------------------------------------- AI
const maybeAutoAnalyze = debounce(() => {
  if (!state.config?.aiAvailable || !state.config.aiAutoAnalyze) return;
  if (state.transcript.length - state.aiAnalyzedLength < 60) return;
  runAi({ quiet: true });
}, 5000);

async function runAi({ quiet = false } = {}) {
  if (state.aiBusy || !state.transcript.trim()) {
    if (!quiet && !state.transcript.trim()) toast('The transcript is empty.');
    return;
  }
  state.aiBusy = true;
  const btn = $('#ai-btn');
  btn.disabled = true;
  btn.textContent = '✦ Analyzing…';
  const analyzedLength = state.transcript.length;
  try {
    const r = await api('/api/ai/analyze', {
      method: 'POST',
      body: { callType: state.callType, payer: state.payer, answers: state.answers, transcript: state.transcript },
    });
    state.aiAnalyzedLength = analyzedLength;
    state.aiSuggestions = Object.fromEntries(r.suggested_answers.map((s) => [s.code, s]));
    const existing = new Set(state.aiQuestions.map((q) => q.question.toLowerCase()));
    for (const q of r.additional_questions) {
      if (!existing.has(q.question.toLowerCase())) state.aiQuestions.push({ ...q, asked: false, note: '' });
    }
    state.aiSummary = r.summary || state.aiSummary;
    fillDetailsFromAi(r.call_details || {});
    renderAiQuestions();
    render();
    if (!quiet) toast('AI analysis updated.', 'success');
  } catch (err) {
    if (!quiet) toast(err.message, 'error');
  } finally {
    state.aiBusy = false;
    btn.disabled = false;
    btn.textContent = '✦ Analyze with AI';
  }
}

function fillDetailsFromAi(details) {
  for (const [key, value] of Object.entries({ patient_name: details.patient_name, pickup_location: details.pickup_location, destination: details.destination })) {
    const input = document.querySelector(`[data-detail="${key}"]`);
    if (input && value && !input.value.trim()) {
      input.value = value;
      state.details[key] = value;
    }
  }
}

function renderAiQuestions() {
  $('#ai-questions-card').hidden = state.aiQuestions.length === 0 && !state.aiSummary;
  const summary = state.aiSummary ? `<div class="alert alert-info"><span class="icon">✦</span><span>${esc(state.aiSummary)}</span></div>` : '';
  $('#ai-questions').innerHTML = summary + state.aiQuestions.map((q, i) => `
    <div class="suggestion">
      <div class="body">
        <div class="q" style="${q.asked ? 'text-decoration: line-through; color: var(--ink-500)' : ''}">${esc(q.question)}</div>
        <div class="evidence">${esc(q.rationale)}</div>
        <input class="input" style="margin-top: 6px" placeholder="Caller's answer (optional)" data-ai-note="${i}" value="${esc(q.note)}">
      </div>
      <div class="actions"><button type="button" class="btn btn-sm ${q.asked ? 'btn-yes active' : ''}" data-ai-asked="${i}">${q.asked ? '✓ Asked' : 'Mark asked'}</button></div>
    </div>`).join('');
}

// ----------------------------------------------------------------- speech
let recognition = null;
let listening = false;

function setupSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#mic-btn');
  if (!SR) {
    btn.disabled = true;
    btn.title = 'Speech recognition is not supported in this browser. Use Chrome or Edge, or type notes.';
    $('#mic-status').textContent = 'Speech not supported — type notes';
    return;
  }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.trim();
      if (e.results[i].isFinal) {
        const box = $('#transcript');
        const sep = box.value && !/\s$/.test(box.value) ? ' ' : '';
        box.value += `${sep}${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
        box.scrollTop = box.scrollHeight;
        state.transcript = box.value;
        markActive();
        evaluateSoon();
        maybeAutoAnalyze();
      } else {
        interim += `${text} `;
      }
    }
    $('#interim').textContent = interim;
  };
  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('Microphone access was denied.', 'error');
      stopListening();
    }
  };
  // Chrome ends recognition after silence; restart while the call taker wants it on.
  recognition.onend = () => {
    if (listening) {
      try { recognition.start(); } catch { /* already started */ }
    }
  };

  btn.addEventListener('click', () => (listening ? stopListening() : startListening()));
}

function startListening() {
  try {
    recognition.start();
  } catch { /* already started */ }
  listening = true;
  markActive();
  const btn = $('#mic-btn');
  btn.classList.add('listening');
  btn.textContent = '■ Stop listening';
  $('#mic-status').textContent = 'Listening…';
}

function stopListening() {
  listening = false;
  recognition?.stop();
  const btn = $('#mic-btn');
  btn.classList.remove('listening');
  btn.textContent = '🎙 Start listening';
  $('#mic-status').textContent = '';
  $('#interim').textContent = '';
}

// ----------------------------------------------------------- save / reset
function buildNarrative() {
  const a = state.evaluation?.assessment;
  const d = state.details;
  const lines = [];
  lines.push(`Call type: ${state.config.callTypes[state.callType]}`);
  if (a?.payer) lines.push(`Payer: ${a.payer.name}${d.member_id ? ` — member ID ${d.member_id}` : ''} (prior authorization: ${a.payer.priorAuthLabel})`);
  lines.push(`Call taker: ${state.user.display_name}`);
  if (d.patient_name) lines.push(`Patient: ${d.patient_name}${d.patient_dob ? ` (DOB ${d.patient_dob})` : ''}`);
  if (d.caller_name || d.caller_facility) lines.push(`Caller: ${[d.caller_name, d.caller_facility].filter(Boolean).join(', ')}${d.caller_phone ? ` — ${d.caller_phone}` : ''}`);
  if (d.pickup_location || d.destination) lines.push(`Trip: ${d.pickup_location || '?'} → ${d.destination || '?'}${d.appointment ? ` (appt ${d.appointment.replace('T', ' ')})` : ''}`);
  if (a) {
    lines.push(`Assessment: ${STATUS_LABELS[a.status]} — ${a.levelOfService.label}${a.levelOfService.hcpcs ? ` (${a.levelOfService.hcpcs})` : ''}`);
    lines.push(`Bed-confined (CMS 3-part test): ${a.bedConfinement.met ? 'Yes' : 'No / not established'}`);
    if (a.supporting.length) lines.push(`Supporting conditions: ${a.supporting.map((s) => s.text.replace(/\?$/, '')).join('; ')}`);
  }
  if (state.aiSummary) lines.push(`Summary: ${state.aiSummary}`);
  lines.push('', 'Documented responses:');
  for (const q of state.questions) {
    if (state.answers[q.code] !== undefined) lines.push(`- ${q.text} ${formatAnswer(state.answers[q.code])}`);
  }
  const followUps = state.aiQuestions.filter((q) => q.asked || q.note);
  if (followUps.length) {
    lines.push('', 'Additional questions:');
    for (const q of followUps) lines.push(`- ${q.question} ${q.note || '(asked)'}`);
  }
  return lines.join('\n');
}

async function copyNarrative() {
  try {
    await navigator.clipboard.writeText(buildNarrative());
    toast('Narrative copied to clipboard.', 'success');
  } catch {
    toast('Clipboard is not available in this browser.', 'error');
  }
}

async function saveCall() {
  if (!state.evaluation) return;
  const btn = $('#save-call');
  btn.disabled = true;
  try {
    const r = await api('/api/calls', {
      method: 'POST',
      body: {
        callType: state.callType,
        payer: state.payer,
        details: { ...state.details, ai_summary: state.aiSummary, ai_questions: state.aiQuestions, duration_seconds: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0 },
        answers: state.answers,
        transcript: state.transcript,
      },
    });
    state.savedId = r.id;
    state.dirty = false;
    toast(`Call #${r.id} saved.`, 'success');
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function newCall() {
  if (state.dirty && !confirm('Discard the current call? It has unsaved changes.')) return;
  if (listening) stopListening();
  Object.assign(state, {
    callType: 'non_emergency', payer: '', details: {}, answers: {}, transcript: '', evaluation: null,
    rejected: new Set(), skipped: new Set(), aiSuggestions: {}, aiQuestions: [], aiSummary: '', aiAnalyzedLength: 0,
    startedAt: null, dirty: false, savedId: null,
  });
  document.querySelectorAll('[data-detail]').forEach((i) => { i.value = ''; });
  $('#transcript').value = '';
  $('#payer').value = '';
  renderAiQuestions();
  try {
    setQuestions(await api('/api/questions')); // pick up any admin changes
  } catch { /* keep the existing bank */ }
  setCallType('non_emergency');
}

init();

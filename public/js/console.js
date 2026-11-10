import { api, esc, toast, showLoadFailure, watchForUpdates, requireUser, mountUserMenu, payerOptions, STATUS_LABELS, CRITERION_LABELS, CRITERION_CHIPS, formatAnswer } from './common.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  user: null,
  config: null,
  questions: [],
  byCode: new Map(),
  callType: 'non_emergency',
  payer: '',
  secondaryPayer: '',
  setupDone: false,
  facilities: [],
  facilityId: null,
  details: {},
  answers: {},
  notes: {}, // question code -> the call taker's note
  transcript: '', // general call notes
  evaluation: null,
  startedAt: null,
  dirty: false,
  savedId: null,
};

// ------------------------------------------------------------------ setup
async function init() {
  state.user = await requireUser();
  mountUserMenu($('#user-menu'), state.user);
  watchForUpdates({ isBusy: () => state.dirty });
  $('#admin-link').hidden = state.user.role !== 'admin';
  if (new URLSearchParams(location.search).has('denied')) {
    toast('That page requires administrator access.', 'error');
    history.replaceState(null, '', location.pathname);
  }
  window.beforeSignOut = () => !state.dirty || confirm('Sign out and discard the current call? It has unsaved changes.');
  try {
    const [config, questions] = await Promise.all([api('/api/config'), api('/api/questions')]);
    state.config = config;
    setQuestions(questions);
    $('#org-name').textContent = config.orgName ? `${config.orgName} · Call-Taker Assistant` : 'Call-Taker Assistant';
    $('#payer').innerHTML = `<option value="">Select insurance…</option>${payerOptions(config.payers)}`;
    renderSecondaryOptions();
  } catch (err) {
    showLoadFailure(err);
    return;
  }
  bindEvents();
  renderTabs();
  showTab('trip');
  setInterval(tickTimer, 1000);
  setCallType('non_emergency');
}

// The secondary list offers every payer except the one chosen as primary.
function renderSecondaryOptions() {
  const others = state.config.payers.filter((p) => p.code !== state.payer);
  $('#secondary-payer').innerHTML = `<option value="">None</option>${payerOptions(others, state.secondaryPayer)}`;
}

function setSecondaryPayer(code) {
  state.secondaryPayer = code;
  $('#secondary-payer').value = code;
  $('#secondary-member-field').hidden = !code;
}

function setQuestions(list) {
  state.questions = list;
  state.byCode = new Map(list.map((q) => [q.code, q]));
}

function bindEvents() {
  $('#call-type').addEventListener('change', (e) => {
    markActive();
    if (e.target.value) setCallType(e.target.value);
    renderTabs();
  });

  // The same detail can appear twice (e.g. pickup address in Call Setup and
  // Call Details); keep every copy in step.
  document.querySelectorAll('[data-detail]').forEach((input) => {
    const sync = () => {
      markActive();
      setDetail(input.dataset.detail, input.value, input);
      if (input.dataset.detail === 'requested_level') { renderPopouts(); evaluate(); } // decision trees can start from the level
      renderTabs();
    };
    input.addEventListener('input', sync);
    if (input.tagName === 'SELECT') input.addEventListener('change', sync);
  });

  bindSetup();

  $('#payer').addEventListener('change', (e) => {
    markActive();
    state.payer = e.target.value;
    if (state.secondaryPayer === state.payer) setSecondaryPayer('');
    renderSecondaryOptions();
    renderTabs();
    evaluate();
  });
  $('#secondary-payer').addEventListener('change', (e) => {
    markActive();
    setSecondaryPayer(e.target.value);
  });

  const notes = $('#transcript');
  notes.addEventListener('input', () => {
    markActive();
    state.transcript = notes.value;
  });

  $('#save-call').addEventListener('click', () => saveCall());
  $('#generate-pcs').addEventListener('click', generatePcs);
  $('#copy-summary').addEventListener('click', copyNarrative);
  $('#print').addEventListener('click', () => window.print());
  $('#new-call').addEventListener('click', newCall);

  // Answers (drop-downs and inputs) and per-question notes in the form.
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-answer-input]');
    if (el) setAnswer(el.dataset.answerInput, el.value);
  });
  document.addEventListener('input', (e) => {
    const note = e.target.closest('[data-note]');
    if (!note) return;
    markActive();
    const text = note.value;
    if (text.trim()) state.notes[note.dataset.note] = text;
    else delete state.notes[note.dataset.note];
    // A payer question appears on two tabs; keep both note boxes in step.
    document.querySelectorAll(`[data-note="${CSS.escape(note.dataset.note)}"]`).forEach((other) => { if (other !== note) other.value = text; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input[data-answer-input]')) e.target.blur();
  });
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-toggle-cat]');
    if (!toggle) return;
    const body = toggle.nextElementSibling;
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
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
  evaluate();
}

function setDetail(key, value, except = null) {
  state.details[key] = value;
  document.querySelectorAll(`[data-detail="${key}"]`).forEach((el) => { if (el !== except) el.value = value ?? ''; });
}

// ------------------------------------------------------------- call setup
// The first step of every call: trip type, level, insurance, and the pickup
// facility and caller. The listening and questions start after it.
const SETUP_REQUIRED = [
  ['call-type', 'trip type', () => $('#call-type').value, 'trip'],
  ['s-requested_level', 'ALS or BLS', () => state.details.requested_level, 'trip'],
  ['payer', 'insurance', () => state.payer, 'payer'],
];

// ------------------------------------------------------------------- tabs
const TABS = ['trip', 'patient', 'locations', 'payer', 'questions', 'review'];
let currentTab = 'trip';

function showTab(name, { focusId = null } = {}) {
  if (!TABS.includes(name)) return;
  currentTab = name;
  document.querySelectorAll('[data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('[data-tabpanel]').forEach((panel) => { panel.hidden = panel.dataset.tabpanel !== name; });
  document.querySelector(`[data-tabpanel="${name}"]`)?.scrollTo?.(0, 0);
  if (focusId) $(`#${focusId}`)?.focus();
  if (name === 'questions' && state.setupDone && !focusId) {
    // Start at the first unanswered question.
    document.querySelector('#checklist .q-row:not(.answered) [data-answer-input]')?.focus();
  }
}

// Tab markers (✓ done, • required info missing, counts) and the Questions gate.
function renderTabs() {
  const d = state.details;
  const missing = SETUP_REQUIRED.filter(([, , value]) => !value());
  state.setupDone = missing.length === 0;
  $('#questions-gate').hidden = state.setupDone;
  $('#intake-steps').hidden = !state.setupDone;
  $('#gate-missing').innerHTML = missing.map(([id, label, , tab]) =>
    `<button class="btn" type="button" data-goto-tab="${tab}" data-focus="${id}">Choose the ${esc(label)} →</button>`).join('');

  const a = state.evaluation?.assessment;
  const marks = {
    trip: $('#call-type').value && d.requested_level ? ['done', '✓'] : ['todo', '•'],
    patient: d.patient_name ? ['done', '✓'] : ['', ''],
    locations: d.caller_facility || d.pickup_location ? ['done', '✓'] : ['', ''],
    payer: state.payer ? ['done', '✓'] : ['todo', '•'],
    questions: a ? ['count', `${a.progress.answered}/${a.progress.total}`] : ['', ''],
    review: a ? [`status-dot status-dot-${a.status}`, ''] : ['', ''],
  };
  for (const [tab, [cls, text]] of Object.entries(marks)) {
    const el = document.querySelector(`[data-tab-state="${tab}"]`);
    el.className = `tab-state ${cls}`;
    el.textContent = text;
    el.title = cls === 'todo' ? 'Required information missing' : '';
  }
  renderCallSummary();
}

function renderCallSummary() {
  const d = state.details;
  const payer = state.config.payers.find((p) => p.code === state.payer)?.name;
  const second = state.config.payers.find((p) => p.code === state.secondaryPayer)?.name;
  const trip = { emergency: 'Emergency', non_emergency: 'Non-emergency', repetitive: 'Non-emergency, repetitive' }[$('#call-type').value];
  const item = (label, value, tab) => (value ? `<button type="button" class="summary-item" data-goto-tab="${tab}"><span>${esc(label)}</span><strong>${esc(value)}</strong></button>` : '');
  const html = [
    item('Trip', [trip, d.requested_level].filter(Boolean).join(' · '), 'trip'),
    item('Patient', [d.patient_name, d.patient_dob && `DOB ${d.patient_dob}`].filter(Boolean).join(' · '), 'patient'),
    item('Pickup', [d.caller_facility, d.pickup_location].filter(Boolean).join(', '), 'locations'),
    item('Caller', [d.caller_name, d.caller_phone, d.caller_email].filter(Boolean).join(' · '), 'locations'),
    item('Drop-off', [d.destination_facility, d.destination].filter(Boolean).join(', '), 'locations'),
    item('Insurance', [payer, second && `2nd: ${second}`].filter(Boolean).join(' · '), 'payer'),
  ].join('');
  $('#call-summary').innerHTML = html || '<p class="muted small" style="margin: 0">Nothing entered yet. Start with the Trip tab.</p>';
}

function bindSetup() {
  // Tabs: click, arrow keys, Alt+1…6, and any [data-goto-tab] button.
  $('.tabbar').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) showTab(tab.dataset.tab);
  });
  $('.tabbar').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = TABS.indexOf(currentTab);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    showTab(TABS[next]);
    $(`#tab-${TABS[next]}`).focus();
  });
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto-tab]');
    if (go) showTab(go.dataset.gotoTab, { focusId: go.dataset.focus || null });
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-6]$/.test(e.key)) {
      e.preventDefault();
      showTab(TABS[Number(e.key) - 1]);
    }
  });
  $('#facility-name').addEventListener('click', () => openFacility('pickup'));
  $('#destination-name').addEventListener('click', () => openFacility('destination'));
  $('#facility-select').addEventListener('change', (e) => fillFacilityForm(state.facilities.find((f) => String(f.id) === e.target.value)));
  $('#facility-form').addEventListener('submit', saveFacility);
  $('#facility-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close-facility]') || e.target === e.currentTarget) closeFacility();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#facility-modal').hidden) closeFacility(); });
}

// --------------------------------------------------------- facility pop-out
// One shared list of saved facilities, used for both the pickup and the
// destination. The pop-out knows which one it is filling.
const FACILITY_TARGETS = {
  pickup: {
    idKey: 'facility_id', nameKey: 'caller_facility', button: '#facility-name', title: 'Pickup facility',
    empty: 'Choose or add a facility…', labels: ['Phone (call back)', 'Caller name', 'Caller email address'],
  },
  destination: {
    idKey: 'destination_facility_id', nameKey: 'destination_facility', button: '#destination-name', title: 'Destination facility',
    empty: 'Choose or add a destination…', labels: ['Phone', 'Contact name', 'Contact email address'],
  },
};

async function openFacility(target = 'pickup') {
  const t = FACILITY_TARGETS[target];
  state.facilityTarget = target;
  try {
    state.facilities = await api('/api/facilities');
  } catch (err) {
    toast(`Could not load saved facilities: ${err.message}`, 'error');
  }
  const currentId = state.details[t.idKey];
  $('#facility-select').innerHTML = '<option value="">+ New facility</option>'
    + state.facilities.map((f) => `<option value="${f.id}" ${f.id === currentId ? 'selected' : ''}>${esc(f.name)}${f.address ? ` — ${esc(f.address)}` : ''}</option>`).join('');
  $('#facility-modal-title').textContent = t.title;
  [$('#f-fac-phone-label').textContent, $('#f-fac-contact-label').textContent, $('#f-fac-email-label').textContent] = t.labels;
  const d = state.details;
  const current = state.facilities.find((f) => f.id === currentId);
  const typed = target === 'pickup'
    ? (d.caller_facility ? { name: d.caller_facility, address: d.pickup_location, phone: d.caller_phone, contact_name: d.caller_name, contact_email: d.caller_email } : null)
    : (d.destination_facility || d.destination ? { name: d.destination_facility, address: d.destination } : null);
  fillFacilityForm(current || typed, { keepSelect: !current });
  $('#facility-error').hidden = true;
  $('#facility-modal').hidden = false;
  (state.facilities.length ? $('#facility-select') : $('#f-fac-name')).focus();
}

function fillFacilityForm(f, { keepSelect = false } = {}) {
  const el = $('#facility-form').elements;
  for (const key of ['name', 'address', 'phone', 'contact_name', 'contact_email']) el[key].value = f?.[key] || '';
  if (!keepSelect) $('#facility-select').value = f?.id ? String(f.id) : '';
  $('#facility-save').textContent = f?.id ? 'Use facility' : 'Save & use facility';
}

function closeFacility() {
  $('#facility-modal').hidden = true;
  $(FACILITY_TARGETS[state.facilityTarget || 'pickup'].button).focus();
}

async function saveFacility(e) {
  e.preventDefault();
  const el = e.target.elements;
  const body = Object.fromEntries(['name', 'address', 'phone', 'contact_name', 'contact_email'].map((k) => [k, el[k].value.trim()]));
  const chosen = state.facilities.find((f) => String(f.id) === $('#facility-select').value);
  let facility;
  try {
    if (chosen) {
      // Keep the saved facility up to date with anything the call taker changed.
      const changed = Object.keys(body).some((k) => (chosen[k] || '') !== body[k]);
      facility = changed ? await api(`/api/facilities/${chosen.id}`, { method: 'PUT', body }) : chosen;
    } else {
      facility = await api('/api/facilities', { method: 'POST', body });
      toast(`Saved “${facility.name}” for future calls.`, 'success');
    }
  } catch (err) {
    $('#facility-error').textContent = err.message;
    $('#facility-error').hidden = false;
    return;
  }
  applyFacility(facility, state.facilityTarget || 'pickup');
  closeFacility();
}

function applyFacility(f, target = 'pickup') {
  markActive();
  if (target === 'destination') {
    setDetail('destination_facility_id', f.id);
    setDetail('destination_facility', f.name);
    setDetail('destination', f.address || '');
    setDetail('destination_phone', f.phone || '');
  } else {
    state.facilityId = f.id;
    setDetail('facility_id', f.id);
    setDetail('caller_facility', f.name);
    setDetail('pickup_location', f.address || '');
    setDetail('caller_phone', f.phone || '');
    setDetail('caller_name', f.contact_name || '');
    setDetail('caller_email', f.contact_email || '');
  }
  renderFacilityButton();
  renderTabs();
}

function renderFacilityButton() {
  for (const t of Object.values(FACILITY_TARGETS)) {
    const name = state.details[t.nameKey];
    const btn = $(t.button);
    btn.textContent = name || t.empty;
    btn.classList.toggle('chosen', Boolean(name));
  }
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
      // The form lists every question that applies, not only those prompted by the conversation.
      // Only questions placed in a Logic Builder flow are asked; the form lists all of them.
      body: { callType: state.callType, payer: state.payer, answers: state.answers, allQuestions: true, logicOnly: true, level: state.details.requested_level || '' },
    });
    if (seq !== evalSeq) return; // a newer evaluation is in flight
    state.evaluation = result;
    render();
  } catch (err) {
    toast(`Evaluation failed: ${err.message}`, 'error');
  }
}

// ----------------------------------------------------------------- render
function render() {
  if (!state.evaluation) return;
  const focus = captureFocus();
  renderChecklist();
  renderPopouts();
  renderAssessment();
  restoreFocus(focus);
  renderTabs();
}

// The form is redrawn after each answer; keep the call taker's place.
function captureFocus() {
  const el = document.activeElement;
  const key = el?.dataset?.answerInput ? 'answer-input' : el?.dataset?.note ? 'note' : null;
  const form = el?.closest('.q-form');
  if (!key || !form?.id) return null;
  return { key, form: form.id, code: el.dataset.answerInput || el.dataset.note, value: el.value, start: el.selectionStart, end: el.selectionEnd };
}
function restoreFocus(f) {
  if (!f) return;
  const el = document.querySelector(`#${f.form} [data-${f.key}="${CSS.escape(f.code)}"]`);
  if (!el) return;
  if (el.tagName !== 'SELECT') el.value = f.value;
  el.focus();
  try { el.setSelectionRange(f.start, f.end); } catch { /* not a text input */ }
}

// A drop-down for yes/no and multiple-choice questions; a box for numbers and text.
function answerControls(q) {
  const current = state.answers[q.code] ?? '';
  const label = `aria-label="Answer: ${esc(q.text)}"`;
  if (q.answer_type === 'yes_no' || q.answer_type === 'choice') {
    const options = q.answer_type === 'yes_no' ? [['yes', 'Yes'], ['no', 'No']] : (q.options || []).map((o) => [o, o]);
    return `<select class="select ${current ? 'has-value' : ''}" data-answer-input="${esc(q.code)}" ${label}>
      <option value="">Select…</option>
      ${options.map(([value, text]) => `<option value="${esc(value)}" ${String(current).toLowerCase() === String(value).toLowerCase() ? 'selected' : ''}>${esc(text)}</option>`).join('')}
    </select>`;
  }
  const type = q.answer_type === 'number' ? 'number' : 'text';
  return `<input class="input ${current ? 'has-value' : ''}" type="${type}" data-answer-input="${esc(q.code)}" value="${esc(current)}" placeholder="${type === 'number' ? 'Number' : 'Answer'}" ${label}>`;
}

const KEY_ROWS = { bed_confined: 'qualify', condition: 'qualify', als: 'qualify', sct: 'qualify', disqualifier: 'disqualify', emergency: 'emergency' };

// One question: text and hints, an answer drop-down, and a notes box.
function questionRow(q) {
  const key = KEY_ROWS[q.criterion];
  const qualifying = q.qualifying_answer ? formatAnswer(q.qualifying_answer.split('|')[0]) : '';
  return `
    <div class="q-row ${state.answers[q.code] !== undefined ? 'answered' : ''} ${key ? `key-row key-${key}` : ''}">
      <div class="q-main">
        <div class="q-text">${esc(q.text)}</div>
        <div class="q-meta">
          <span class="chip ${CRITERION_CHIPS[q.criterion] || ''}">${esc(CRITERION_LABELS[q.criterion] || q.criterion)}</span>
          ${q.required ? '<span class="chip chip-amber">Required</span>' : ''}
          ${key === 'qualify' && qualifying ? `<span class="chip chip-green">Qualifies if ${esc(qualifying)}</span>` : ''}
          ${key === 'disqualify' && qualifying ? `<span class="chip chip-amber">Rules out if ${esc(qualifying)}</span>` : ''}
          ${key === 'emergency' ? '<span class="chip chip-red">Ask first</span>' : ''}
        </div>
        ${q.guidance ? `<div class="q-guidance">${esc(q.guidance)}</div>` : ''}
      </div>
      <div class="q-answer">${answerControls(q)}</div>
      <div class="q-note"><input class="input" data-note="${esc(q.code)}" value="${esc(state.notes[q.code] || '')}" placeholder="Notes" aria-label="Notes: ${esc(q.text)}" maxlength="500"></div>
    </div>`;
}

// ------------------------------------------------------------- pop-outs
// Nothing pops out until the insurance is chosen. Then, on the Payer Info tab:
//   - decision trees from the Logic Builder (payer, level or trip type)
//   - the medical-necessity and reasonableness questions (payers that need them)
//   - the requested level's questions (BLS / ALS / SCT)
//   - the payer's own questions
// Questions are grouped by their Question Bank criterion, so new questions
// land in the right place. All of them also stay on the Questions tab, and
// answers stay in sync.
const LEVEL_CRITERIA = {
  BLS: { criteria: ['condition'], label: 'BLS', intro: 'A Yes to any of these conditions supports a BLS ambulance. Bed confinement, the other way to qualify, is in the medical-necessity questions above.' },
  ALS: { criteria: ['als'], label: 'ALS', intro: 'ALS requires a need for advanced life support during transport. A Yes here supports ALS. Without one, the trip qualifies at most as BLS.' },
  SCT: { criteria: ['sct'], label: 'Specialty Care Transport', intro: 'SCT requires care beyond the scope of a paramedic, such as titrated drips or ventilator management.' },
};
const NECESSITY_CRITERIA = ['bed_confined', 'disqualifier'];
const REASONABLENESS_CODES = ['TX_REASON', 'TX_NEAREST'];

const popped = {};
function renderPopout(id, { questions, title, intro, tone = '', key }) {
  const box = $(`#${id}`);
  box.hidden = questions.length === 0;
  if (!questions.length) { popped[id] = null; return; }
  const done = questions.filter((q) => state.answers[q.code] !== undefined).length;
  $(`#${id}-title`).textContent = title;
  $(`#${id}-count`).textContent = `${done} of ${questions.length} answered`;
  $(`#${id}-intro`).textContent = intro;
  $(`#${id}-list`).innerHTML = questions.map(questionRow).join('');
  box.classList.remove('tone-qualify', 'tone-payer', 'tone-no-necessity', 'tone-als', 'tone-sct');
  if (tone) box.classList.add(`tone-${tone}`);
  // Pop out once each time the choice behind it changes.
  if (popped[id] !== key) {
    popped[id] = key;
    box.classList.remove('pop-in');
    void box.offsetWidth;
    box.classList.add('pop-in');
    return box; // newly popped
  }
  return null;
}

// Decision trees from the Logic Builder: the questions reached so far, in
// order. Answering one reveals the next; the outcome shows once it's reached.
const OUTCOME_TEXT = {
  status: { meets: 'Meets criteria', likely: 'Likely meets: finish documentation', review: 'Needs supervisor review', not_met: 'Does not meet criteria' },
  level: { sct: 'Level of service: SCT', als: 'Level of service: ALS', bls: 'Level of service: BLS', none: 'Ambulance not indicated' },
};
function renderTrees(containerId, trees) {
  const fresh = trees.find((t) => !popped[`tree-${t.id}`]);
  $(`#${containerId}`).innerHTML = trees.map((t) => {
    const qs = t.questions.map((c) => state.byCode.get(c)).filter(Boolean);
    const done = qs.filter((q) => state.answers[q.code] !== undefined).length;
    const outcomes = t.outcomes.map((o) => {
      const text = o.kind === 'alert' || o.kind === 'document' ? o.text : [OUTCOME_TEXT[o.kind]?.[o.value], o.text].filter(Boolean).join(': ');
      return `<li class="tree-outcome kind-${esc(o.kind)}">${esc(text)}</li>`;
    }).join('');
    const waiting = qs.length && done === qs.length && !outcomes;
    return `
      <div class="card popout-questions tone-tree ${popped[`tree-${t.id}`] ? '' : 'pop-in'}" data-tree="${esc(t.id)}">
        <div class="card-header"><h2 class="card-title">Decision tree: ${esc(t.name)}</h2><span class="muted small">${done} of ${qs.length} answered</span></div>
        <p class="popout-intro">Answer each question. The next one appears based on the answer.</p>
        <div id="tree-${esc(t.id)}-list" class="q-form">${qs.map(questionRow).join('')}</div>
        ${outcomes ? `<div class="tree-result"><div class="tree-result-label">Outcome</div><ul>${outcomes}</ul></div>` : ''}
        ${waiting ? '<div class="tree-result muted small">No outcome is set for this path yet.</div>' : ''}
      </div>`;
  }).join('');
  for (const t of trees) popped[`tree-${t.id}`] = true;
  return fresh ? document.querySelector(`#${containerId} [data-tree="${CSS.escape(String(fresh.id))}"]`) : null;
}

function renderPopouts() {
  if (!state.evaluation) return;
  // No questions pop out until the insurance is chosen; then they all
  // appear together on the Payer Info tab.
  if (!state.payer) {
    $('#payer-trees').innerHTML = '';
    $('#trip-trees').innerHTML = '';
    for (const id of ['level-questions', 'necessity-questions', 'payer-questions']) { $(`#${id}`).hidden = true; popped[id] = null; }
    for (const key of Object.keys(popped)) if (key.startsWith('tree-')) delete popped[key];
    return;
  }
  const trees = state.evaluation.trees || [];
  const newlyShown = [
    renderTrees('trip-trees', trees.filter((t) => !t.payerTree)),
    renderTrees('payer-trees', trees.filter((t) => t.payerTree)),
  ];
  // A tree that goes away (e.g. the payer changed) pops out again next time.
  const live = new Set(trees.map((t) => `tree-${t.id}`));
  for (const key of Object.keys(popped)) if (key.startsWith('tree-') && !live.has(key)) delete popped[key];
  const inTree = new Set(trees.flatMap((t) => t.questions));
  const visible = new Set(state.evaluation.visibleCodes);
  // Tree questions are shown in their tree, not again in the boxes below.
  const shown = (q) => visible.has(q.code) && !inTree.has(q.code);
  const payer = state.config.payers.find((p) => p.code === state.payer);
  const level = LEVEL_CRITERIA[state.details.requested_level];

  // The chosen level's questions (none for private / facility pay).
  newlyShown.splice(1, 0, renderPopout('level-questions', {
    questions: level ? state.questions.filter((q) => shown(q) && level.criteria.includes(q.criterion)) : [],
    title: level ? `${level.label} questions` : '',
    intro: level?.intro || '',
    tone: state.details.requested_level === 'BLS' ? 'qualify' : state.details.requested_level === 'SCT' ? 'sct' : 'als',
    key: state.details.requested_level || null,
  }));

  // Payer tab: necessity and reasonableness, for every payer that needs it.
  const needsReview = payer && payer.requires_medical_necessity !== false;
  newlyShown.push(renderPopout('necessity-questions', {
    questions: needsReview ? state.questions.filter((q) => shown(q) && (NECESSITY_CRITERIA.includes(q.criterion) || REASONABLENESS_CODES.includes(q.code))) : [],
    title: 'Medical necessity & reasonableness',
    intro: `${payer?.name || 'This payer'} requires the medical-necessity and reasonableness questions. The patient qualifies if all three bed-confinement answers are Yes, or if a condition on the Trip tab applies. Either way, the trip must not be possible by other means.`,
    tone: 'qualify',
    key: needsReview ? payer.code : null,
  }));

  // Payer tab: the payer's own questions (private pay, facility pay, Medicaid…).
  newlyShown.push(renderPopout('payer-questions', {
    questions: payer ? state.questions.filter((q) => shown(q) && q.payers?.length && q.category !== 'Documentation') : [],
    title: payer ? `${payer.name}: questions` : '',
    intro: payer?.requires_medical_necessity === false
      ? `${payer.name} doesn’t need a medical-necessity review. Ask these payment questions instead.`
      : `Questions specific to ${payer?.name || 'this payer'}.`,
    tone: payer?.requires_medical_necessity === false ? 'no-necessity' : 'payer',
    key: payer?.code || null,
  }));

  // Bring the first new pop-out on the open tab into view.
  const first = newlyShown.find((el) => el && !el.closest('[data-tabpanel]')?.hidden);
  first?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderChecklist() {
  const ev = state.evaluation;
  const visible = new Set(ev.visibleCodes);
  const groups = new Map();
  for (const q of state.questions) {
    if (!visible.has(q.code)) continue;
    if (!groups.has(q.category)) groups.set(q.category, []);
    groups.get(q.category).push(q);
  }
  // Keep collapsed sections collapsed between redraws.
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
          ${qs.map(questionRow).join('')}
        </div>
      </div>`;
  }
  $('#checklist').innerHTML = html || '<div class="empty">No questions are set up for this call yet. An administrator adds them in Admin → Logic Builder.</div>';
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
  $('#payer-name').textContent = p.kind === 'broker' ? 'Transport broker' : p.name;
  $('#payer-name').title = p.name;
  $('#payer-parent').hidden = p.kind !== 'broker';
  $('#payer-parent').innerHTML = p.kind === 'broker'
    ? `<strong>${esc(p.name)}</strong>${p.parentName ? ` — books trips for <strong>${esc(p.parentName)}</strong>` : ''}`
    : '';
  $('#payer-necessity').textContent = p.requiresMedicalNecessity ? 'Required: questions asked' : 'Not required';
  $('#payer-necessity').className = `chip ${p.requiresMedicalNecessity ? 'chip-amber' : 'chip-blue'}`;
  const pa = $('#payer-pa');
  pa.className = `chip ${PA_CHIPS[p.priorAuth] || ''}`;
  pa.textContent = p.priorAuthLabel;
  $('#payer-pa-note').textContent = p.priorAuthNote;
  const c = p.contact;
  const safeUrl = /^https:\/\//i.test(c.url) ? c.url : '';
  $('#payer-contact').innerHTML = [
    c.name && `<div><strong>Contact:</strong> ${esc(c.name)}</div>`,
    c.phone && `<div><strong>Phone:</strong> <a href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">${esc(c.phone)}</a></div>`,
    c.fax && `<div><strong>Fax:</strong> ${esc(c.fax)}</div>`,
    c.email && `<div><strong>Email:</strong> <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>`,
    safeUrl && `<div><strong>Portal:</strong> <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(safeUrl)}</a></div>`,
  ].filter(Boolean).join('');
  $('#payer-brokers').hidden = !p.brokers.length;
  $('#payer-brokers').innerHTML = p.brokers.length
    ? `<strong>Transport brokers for this payer:</strong><ul style="margin: 4px 0 0; padding-left: 18px">${p.brokers.map((b) =>
      `<li>${esc(b.name)}${b.phone ? ` — <a href="tel:${esc(b.phone.replace(/[^0-9+]/g, ''))}">${esc(b.phone)}</a>` : ''}</li>`).join('')}</ul>`
    : '';
}

// The headline, icon and step-by-step guidance for the Medical Necessity panel.
const RESULT_VIEW = {
  meets: { icon: '✓', title: 'Medical Necessity Met', next: 'Next steps' },
  likely: { icon: '✓', title: 'Likely Met — Finish Up', next: 'To finish' },
  review: { icon: '!', title: 'Needs Review', next: 'What to do next' },
  not_met: { icon: '✕', title: 'Medical Necessity Not Met', next: 'What to do next' },
  not_required: { icon: 'i', title: 'Medical Necessity Not Required', next: 'Next steps' },
  incomplete: { icon: '…', title: 'Gathering Information', next: '' },
};

function nextSteps(a, callType) {
  const payer = a.payer?.name || 'this payer';
  const level = a.levelOfService?.label || 'the recommended level';
  const steps = [];
  if (a.emergencyFlag && callType !== 'emergency') steps.push('Possible emergency: follow your emergency protocol now (dispatch an emergency response or transfer to 911) before continuing the intake.');
  if (a.status === 'meets' || a.status === 'likely') {
    if (a.status === 'meets') steps.push(`Ambulance transport is supported for ${payer}. Schedule it as ${level}.`);
    else steps.push(`Ambulance transport is supported for ${payer} (${level}), but the record isn’t complete yet.`);
    for (const m of (a.missing || []).slice(0, 3)) steps.push(`Ask: ${m.text}`);
    for (const g of (a.documentationGaps || []).slice(0, 2)) steps.push(`Resolve: ${g}`);
    if (a.payer?.priorAuth === 'required') steps.push('Prior authorization is required: get or confirm the authorization number before scheduling.');
    const asked = state.details.requested_level;
    const rec = /Specialty/.test(level) ? 'SCT' : /ALS/.test(level) ? 'ALS' : /BLS/.test(level) ? 'BLS' : null;
    const rank = { BLS: 1, ALS: 2, SCT: 3 };
    if (asked && rec && rank[asked] > rank[rec]) steps.push(`${asked} was requested, but only ${rec}-level needs are documented so far. Ask about ${asked}-level needs (e.g. cardiac monitoring, IV medications${asked === 'SCT' ? ', drips or ventilator' : ''}), or schedule ${rec}.`);
    if (asked && rec && rank[asked] < rank[rec]) steps.push(`${asked} was requested, but the answers point to ${rec}. Confirm the level with the caller before scheduling.`);
    if (callType !== 'emergency') steps.push('Get a signed Physician Certification Statement (PCS) before transport. Use “Generate PCS form”.');
    steps.push('Confirm the pick-up time, address and destination, then save the call record.');
  } else if (a.status === 'not_met') {
    steps.push(`Don’t schedule an ambulance under ${payer}: the answers don’t meet medical-necessity criteria.`);
    const alt = (a.alerts || []).find((al) => al.code === 'PAYER_ALTERNATE');
    steps.push(alt ? `Offer the alternative: ${alt.text}` : 'Offer other transport: wheelchair van, stretcher van, or another option your service provides.');
    steps.push('If the caller still wants an ambulance, explain it may not be covered and offer private pay. For Medicare patients, have the patient sign an Advance Beneficiary Notice (ABN) before transport.');
    steps.push('If the caller reports a change in condition, update the answers. The result is recalculated automatically.');
    steps.push('Escalate to a supervisor if there is any clinical concern, and save the call record.');
  } else if (a.status === 'review') {
    for (const d of (a.disqualifiers || []).slice(0, 2)) steps.push(`Clarify with the caller: ${d.text}`);
    steps.push('The answers conflict. Re-ask the questions above and correct any answer that was misheard.');
    steps.push('If it’s still unclear, escalate to a supervisor before scheduling.');
  } else if (a.status === 'not_required') {
    steps.push(`${payer} doesn’t require a medical-necessity review. Confirm payment details and the transport.`);
    steps.push('Save the call record.');
  }
  return steps;
}

let lastStatus = null;
function announceResult(a) {
  const changed = lastStatus !== null && a.status !== lastStatus;
  lastStatus = a.status;
  if (!changed) return;
  const banner = $('#status-banner');
  banner.classList.remove('flash');
  void banner.offsetWidth; // restart the animation
  banner.classList.add('flash');
  if (a.status === 'meets') toast('Medical necessity MET: see the next steps on the right.', 'success');
  else if (a.status === 'not_met') toast('Medical necessity NOT met: see what to do next on the right.', 'error');
  else if (a.status === 'review') toast('Conflicting answers: needs review.', 'warning');
}

function renderAssessment() {
  const a = state.evaluation.assessment;
  const banner = $('#status-banner');
  const view = RESULT_VIEW[a.status] || RESULT_VIEW.incomplete;
  banner.className = `status-banner status-${a.status}${banner.classList.contains('flash') ? ' flash' : ''}`;
  $('#status-icon').textContent = view.icon;
  $('#status-value').textContent = view.title;
  $('#status-label').textContent = `Medical necessity · ${a.payer ? a.payer.name : 'CMS criteria'}`;
  $('#status-summary').textContent = a.summary;
  const steps = nextSteps(a, state.callType);
  $('#status-next').hidden = steps.length === 0;
  $('#status-next-title').textContent = view.next || 'What to do next';
  $('#status-steps').innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
  announceResult(a);
  $('#emergency-bar').hidden = !(a.emergencyFlag && state.callType !== 'emergency');

  $('#progress-bar').style.width = `${a.progress.percent}%`;
  $('#progress-text').textContent = `${a.progress.answered}/${a.progress.total} · ${a.progress.percent}%`;
  $('#los-name').textContent = a.levelOfService.label;
  $('#los-code').hidden = !a.levelOfService.hcpcs;
  $('#los-code').textContent = a.levelOfService.hcpcs ? `HCPCS ${a.levelOfService.hcpcs}` : '';

  renderPayer(a.payer);
  $('#criteria-card').hidden = a.status === 'not_required';

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

// ----------------------------------------------------------- save / reset
function buildNarrative() {
  const a = state.evaluation?.assessment;
  const d = state.details;
  const lines = [];
  lines.push(`Call type: ${state.config.callTypes[state.callType]}`);
  if (a?.payer) lines.push(`Payer: ${a.payer.name}${d.member_id ? ` — member ID ${d.member_id}` : ''} (prior authorization: ${a.payer.priorAuthLabel})`);
  const secondary = state.config.payers.find((p) => p.code === state.secondaryPayer);
  if (secondary) lines.push(`Secondary payer: ${secondary.name}${d.secondary_member_id ? ` — member ID ${d.secondary_member_id}` : ''}`);
  lines.push(`Call taker: ${state.user.display_name}`);
  if (d.patient_name) lines.push(`Patient: ${d.patient_name}${d.patient_dob ? ` (DOB ${d.patient_dob})` : ''}`);
  if (d.requested_level) lines.push(`Level requested: ${d.requested_level}`);
  if (d.caller_name || d.caller_facility) lines.push(`Caller: ${[d.caller_name, d.caller_facility].filter(Boolean).join(', ')}${d.caller_phone ? ` — ${d.caller_phone}` : ''}${d.caller_email ? ` — ${d.caller_email}` : ''}`);
  const from = [d.caller_facility, d.pickup_location].filter(Boolean).join(', ');
  const to = [d.destination_facility, d.destination].filter(Boolean).join(', ');
  if (from || to) lines.push(`Trip: ${from || '?'} → ${to || '?'}${d.appointment ? ` (appt ${d.appointment.replace('T', ' ')})` : ''}`);
  if (a) {
    lines.push(`Assessment: ${STATUS_LABELS[a.status]} — ${a.levelOfService.label}${a.levelOfService.hcpcs ? ` (${a.levelOfService.hcpcs})` : ''}`);
    lines.push(`Bed-confined (CMS 3-part test): ${a.bedConfinement.met ? 'Yes' : 'No / not established'}`);
    if (a.supporting.length) lines.push(`Supporting conditions: ${a.supporting.map((s) => s.text.replace(/\?$/, '')).join('; ')}`);
  }
  lines.push('', 'Documented responses:');
  for (const q of state.questions) {
    const answer = state.answers[q.code];
    const note = state.notes[q.code];
    if (answer === undefined && !note) continue;
    lines.push(`- ${q.text} ${answer !== undefined ? formatAnswer(answer) : '(no answer)'}${note ? ` (note: ${note.trim()})` : ''}`);
  }
  if (state.transcript.trim()) lines.push('', 'Call notes:', state.transcript.trim());
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

// Saves the call, or updates it if it was already saved. Returns the call ID.
async function saveCall({ quiet = false } = {}) {
  if (!state.evaluation) return null;
  const btn = $('#save-call');
  btn.disabled = true;
  try {
    const body = {
      callType: state.callType,
      payer: state.payer,
      secondaryPayer: state.secondaryPayer,
      details: { ...state.details, question_notes: state.notes, duration_seconds: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : 0 },
      answers: state.answers,
      transcript: state.transcript,
      allQuestions: true,
      logicOnly: true,
    };
    const r = state.savedId
      ? await api(`/api/calls/${state.savedId}`, { method: 'PUT', body })
      : await api('/api/calls', { method: 'POST', body });
    const updated = Boolean(state.savedId);
    state.savedId = r.id;
    state.dirty = false;
    if (!quiet) toast(`Call #${r.id} ${updated ? 'updated' : 'saved'}.`, 'success');
    return r.id;
  } catch (err) {
    toast(`Save failed: ${err.message}`, 'error');
    return null;
  } finally {
    btn.disabled = false;
  }
}

async function generatePcs() {
  if (state.callType === 'emergency' && !confirm('A PCS is generally not required for emergency transports. Generate one anyway?')) return;
  if (state.evaluation?.assessment.status === 'not_required' && !confirm('This payer does not require medical necessity. Generate a PCS anyway?')) return;
  // Open the tab now (inside the click) so pop-up blockers allow it.
  const tab = window.open('about:blank', '_blank');
  const id = state.dirty || !state.savedId ? await saveCall({ quiet: true }) : state.savedId;
  if (!id) { tab?.close(); return; }
  const url = `pcs.html?call=${id}`;
  if (tab) tab.location.href = url;
  else location.href = url;
  toast(`Call #${id} saved — PCS opened in a new tab.`, 'success');
}

async function newCall() {
  if (state.dirty && !confirm('Discard the current call? It has unsaved changes.')) return;
  Object.assign(state, {
    callType: 'non_emergency', payer: '', secondaryPayer: '', facilityId: null, details: {}, answers: {}, notes: {}, transcript: '', evaluation: null,
    startedAt: null, dirty: false, savedId: null,
  });
  document.querySelectorAll('[data-detail]').forEach((i) => { i.value = ''; });
  $('#transcript').value = '';
  $('#payer').value = '';
  $('#call-type').value = '';
  renderFacilityButton();
  renderTabs();
  showTab('trip');
  renderSecondaryOptions();
  $('#secondary-member-field').hidden = true;
  lastStatus = null;
  try {
    setQuestions(await api('/api/questions')); // pick up any admin changes
  } catch { /* keep the existing bank */ }
  setCallType('non_emergency');
}

init().catch(showLoadFailure);

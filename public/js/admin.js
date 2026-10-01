import { api, esc, toast, STATUS_LABELS, STATUS_CHIPS, CRITERION_LABELS, CRITERION_CHIPS, PRIORITY_LABELS, formatAnswer, formatDate } from './common.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = { config: null, questions: [], editing: null };

const TYPE_LABELS = { yes_no: 'Yes / No', choice: 'Choice', text: 'Text', number: 'Number' };

// ------------------------------------------------------------------- auth
async function init() {
  state.config = await api('/api/config');
  const { authenticated } = await api('/api/admin/session');
  if (authenticated) showApp();
  else showLogin();

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('#password').value } });
      $('#password').value = '';
      showApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
      $('#login-error').hidden = false;
    }
  });
  $('#logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    showLogin();
  });
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#password').focus();
}

let bound = false;
async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#login-error').hidden = true;
  $('#org-name').textContent = `${state.config.orgName || ''} · Admin Dashboard`;
  if (!bound) { bindEvents(); bound = true; }
  showView(location.hash.slice(1) || 'overview');
}

// Any 401 means the session expired.
async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) { showLogin(); return null; }
    toast(err.message, 'error');
    return null;
  }
}

// ------------------------------------------------------------- navigation
function bindEvents() {
  $$('.sidenav [data-view]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) showView(go.dataset.goto);
    if (e.target.closest('[data-close]') || e.target.classList.contains('modal-backdrop')) closeModals();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

  $('#add-question').addEventListener('click', () => openQuestion(null));
  $('#q-search').addEventListener('input', renderQuestions);
  $('#q-category').addEventListener('change', renderQuestions);
  $('#q-status').addEventListener('change', renderQuestions);
  $('#q-form').addEventListener('submit', saveQuestion);
  $('#f-answer_type').addEventListener('change', syncTypeFields);
  $('#refresh-calls').addEventListener('click', loadCalls);
  $('#settings-form').addEventListener('submit', saveSettings);

  $('#q-rows').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openQuestion(state.questions.find((q) => q.id === Number(edit.dataset.edit)));
    const del = e.target.closest('[data-delete]');
    if (del) return deleteQuestion(Number(del.dataset.delete));
  });
  $('#q-rows').addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-active]');
    if (toggle) {
      const updated = await guarded(() => api(`/api/admin/questions/${toggle.dataset.active}`, { method: 'PUT', body: { active: toggle.checked } }));
      if (updated) {
        Object.assign(state.questions.find((q) => q.id === updated.id), updated);
        renderQuestions();
        toast(`Question ${updated.active ? 'activated' : 'deactivated'}.`, 'success');
      } else {
        toggle.checked = !toggle.checked;
      }
    }
    const order = e.target.closest('[data-order]');
    if (order) {
      const updated = await guarded(() => api(`/api/admin/questions/${order.dataset.order}`, { method: 'PUT', body: { sort_order: Number(order.value) || 0 } }));
      if (updated) await loadQuestions();
    }
  });
  $('#calls-table').addEventListener('click', (e) => {
    const row = e.target.closest('[data-call]');
    if (row) openCall(Number(row.dataset.call));
  });
  $('#recent-calls').addEventListener('click', (e) => {
    const row = e.target.closest('[data-call]');
    if (row) openCall(Number(row.dataset.call));
  });
}

function showView(view) {
  if (!['overview', 'questions', 'calls', 'settings'].includes(view)) view = 'overview';
  history.replaceState(null, '', `#${view}`);
  $$('.sidenav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== view; });
  if (view === 'overview') loadOverview();
  if (view === 'questions') loadQuestions();
  if (view === 'calls') loadCalls();
  if (view === 'settings') loadSettings();
}

function closeModals() {
  $$('.modal-backdrop').forEach((m) => { m.hidden = true; });
}

// --------------------------------------------------------------- overview
async function loadOverview() {
  const [stats, calls] = await Promise.all([guarded(() => api('/api/admin/stats')), guarded(() => api('/api/admin/calls'))]);
  if (!stats) return;
  const s = stats.calls.byStatus;
  const totalCalls = Object.values(s).reduce((a, b) => a + b, 0);
  const meeting = (s.meets || 0) + (s.likely || 0);
  const card = (label, value, sub = '') => `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div>`;
  $('#stats').innerHTML = [
    card('Active questions', stats.questions.active, `${stats.questions.total} total`),
    card('Custom questions', stats.questions.custom, 'Added by administrators'),
    card('Calls today', stats.calls.today, `${totalCalls} all time`),
    card('Meeting necessity', totalCalls ? `${Math.round((meeting / totalCalls) * 100)}%` : '—', `${meeting} of ${totalCalls} calls`),
  ].join('');
  $('#recent-calls').innerHTML = callsTable((calls || []).slice(0, 8));
}

// -------------------------------------------------------------- questions
async function loadQuestions() {
  const list = await guarded(() => api('/api/admin/questions'));
  if (!list) return;
  state.questions = list;
  const cats = [...new Set([...state.config.categories, ...list.map((q) => q.category)])];
  const selected = $('#q-category').value;
  $('#q-category').innerHTML = `<option value="">All categories</option>${cats.map((c) => `<option ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')}`;
  $('#category-list').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  renderQuestions();
}

function renderQuestions() {
  const term = $('#q-search').value.trim().toLowerCase();
  const cat = $('#q-category').value;
  const status = $('#q-status').value;
  const rows = state.questions.filter((q) => {
    if (cat && q.category !== cat) return false;
    if (status === 'active' && !q.active) return false;
    if (status === 'inactive' && q.active) return false;
    if (status === 'custom' && q.is_system) return false;
    if (!term) return true;
    return [q.code, q.text, q.category, q.guidance, ...q.triggers, ...q.detect_yes, ...q.detect_no].join(' ').toLowerCase().includes(term);
  });
  $('#q-rows').innerHTML = rows.length ? rows.map((q) => `
    <tr class="${q.active ? '' : 'inactive'}">
      <td><input class="input" style="width: 64px; padding: 4px 6px" type="number" value="${q.sort_order}" data-order="${q.id}" aria-label="Sort order"></td>
      <td>
        <div style="font-weight: 600">${esc(q.text)}</div>
        <div class="q-meta" style="display:flex; gap:6px; margin-top:4px; flex-wrap: wrap">
          <span class="code">${esc(q.code)}</span>
          <span class="chip">${esc(q.category)}</span>
          ${q.is_system ? '' : '<span class="chip chip-blue">Custom</span>'}
          ${q.required ? '<span class="chip chip-amber">Required</span>' : ''}
          ${q.triggers.length ? `<span class="chip chip-violet" title="${esc(q.triggers.join(', '))}">Conditional</span>` : ''}
          ${q.call_types.length ? `<span class="chip">${esc(q.call_types.map((t) => state.config.callTypes[t]?.split(' ')[0]).join(', '))}</span>` : ''}
        </div>
      </td>
      <td class="nowrap">${esc(TYPE_LABELS[q.answer_type])}</td>
      <td><span class="chip ${CRITERION_CHIPS[q.criterion] || ''}">${esc(CRITERION_LABELS[q.criterion])}</span></td>
      <td class="nowrap">${esc(PRIORITY_LABELS[q.priority])}</td>
      <td><label class="switch"><input type="checkbox" data-active="${q.id}" ${q.active ? 'checked' : ''} aria-label="Active"><span class="track"></span></label></td>
      <td class="actions">
        <button type="button" class="btn btn-sm" data-edit="${q.id}">Edit</button>
        ${q.is_system ? '' : `<button type="button" class="btn btn-sm btn-danger" data-delete="${q.id}">Delete</button>`}
      </td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">No questions match your filters.</td></tr>';
}

const lines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);

function openQuestion(q) {
  state.editing = q;
  const form = $('#q-form');
  form.reset();
  $('#q-error').hidden = true;
  $('#q-modal-title').textContent = q ? 'Edit Question' : 'Add Question';

  $('#f-criterion').innerHTML = state.config.criteria.map((c) => `<option value="${c}">${esc(CRITERION_LABELS[c])}</option>`).join('');
  $('#f-call_types').innerHTML = Object.entries(state.config.callTypes).map(([k, label]) =>
    `<label><input type="checkbox" name="call_types" value="${k}"> ${esc(label)}</label>`).join('');
  $('#f-depends_on_code').innerHTML = '<option value="">— Not a follow-up —</option>' + state.questions
    .filter((o) => !q || o.id !== q.id)
    .map((o) => `<option value="${esc(o.code)}">${esc(o.code)} — ${esc(o.text.slice(0, 60))}</option>`).join('');

  const v = q || {
    code: '', category: '', text: '', guidance: '', answer_type: 'yes_no', options: [], call_types: [], criterion: 'condition',
    qualifying_answer: 'yes', triggers: [], detect_yes: [], detect_no: [], depends_on_code: '', depends_on_answer: '',
    priority: 2, required: false, active: true, alert_answer: '', alert_text: '', alert_level: 'warning',
  };
  const el = form.elements;
  el.code.value = v.code;
  el.code.disabled = Boolean(q?.is_system);
  el.category.value = v.category;
  el.text.value = v.text;
  el.guidance.value = v.guidance || '';
  el.answer_type.value = v.answer_type;
  el.options.value = (v.options || []).join('\n');
  el.criterion.value = v.criterion;
  el.qualifying_answer.value = v.qualifying_answer || '';
  el.priority.value = String(v.priority);
  el.triggers.value = v.triggers.join('\n');
  el.detect_yes.value = v.detect_yes.join('\n');
  el.detect_no.value = v.detect_no.join('\n');
  el.depends_on_code.value = v.depends_on_code || '';
  el.depends_on_answer.value = v.depends_on_answer || '';
  el.required.checked = Boolean(v.required);
  el.active.checked = v.active !== false;
  el.alert_answer.value = v.alert_answer || '';
  el.alert_text.value = v.alert_text || '';
  el.alert_level.value = v.alert_level || 'warning';
  $$('#f-call_types input').forEach((cb) => { cb.checked = v.call_types.includes(cb.value); });
  syncTypeFields();

  $('#q-modal').hidden = false;
  el.text.focus();
}

function syncTypeFields() {
  const type = $('#f-answer_type').value;
  $$('[data-show-for]').forEach((f) => { f.hidden = f.dataset.showFor !== type; });
}

async function saveQuestion(e) {
  e.preventDefault();
  const el = e.target.elements;
  const body = {
    category: el.category.value.trim(),
    text: el.text.value.trim(),
    guidance: el.guidance.value.trim(),
    answer_type: el.answer_type.value,
    options: el.answer_type.value === 'choice' ? lines(el.options.value) : [],
    call_types: $$('#f-call_types input:checked').map((cb) => cb.value),
    criterion: el.criterion.value,
    qualifying_answer: el.qualifying_answer.value.trim(),
    priority: Number(el.priority.value),
    triggers: lines(el.triggers.value),
    detect_yes: el.answer_type.value === 'yes_no' ? lines(el.detect_yes.value) : [],
    detect_no: el.answer_type.value === 'yes_no' ? lines(el.detect_no.value) : [],
    depends_on_code: el.depends_on_code.value,
    depends_on_answer: el.depends_on_answer.value.trim(),
    required: el.required.checked,
    active: el.active.checked,
    alert_answer: el.alert_answer.value.trim(),
    alert_text: el.alert_text.value.trim(),
    alert_level: el.alert_level.value,
  };
  if (!state.editing?.is_system) body.code = el.code.value.trim().toUpperCase();

  const problems = [];
  if (!body.text) problems.push('Question text is required.');
  if (!body.category) problems.push('Category is required.');
  if (body.alert_answer && !body.alert_text) problems.push('Enter an alert message, or clear the alert answer.');
  if (body.depends_on_code && !body.depends_on_answer) problems.push('Enter the answer that triggers this follow-up.');
  if (problems.length) {
    $('#q-error').textContent = problems.join(' ');
    $('#q-error').hidden = false;
    return;
  }

  try {
    if (state.editing) await api(`/api/admin/questions/${state.editing.id}`, { method: 'PUT', body });
    else await api('/api/admin/questions', { method: 'POST', body });
  } catch (err) {
    if (err.status === 401) return showLogin();
    $('#q-error').textContent = err.message;
    $('#q-error').hidden = false;
    return;
  }
  closeModals();
  toast(state.editing ? 'Question updated.' : 'Question added. It will appear on the next call.', 'success');
  loadQuestions();
}

async function deleteQuestion(id) {
  const q = state.questions.find((x) => x.id === id);
  if (!q || !confirm(`Delete question "${q.text}"? This cannot be undone.`)) return;
  const ok = await guarded(() => api(`/api/admin/questions/${id}`, { method: 'DELETE' }).then(() => true));
  if (ok) {
    toast('Question deleted.', 'success');
    loadQuestions();
  }
}

// ------------------------------------------------------------------ calls
function callsTable(calls) {
  if (!calls.length) return '<div class="empty">No calls saved yet. Calls appear here after the call taker clicks “Save Call Record”.</div>';
  return `<table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Patient</th><th>Type</th><th>Assessment</th><th>Level of service</th><th>Call taker</th></tr></thead>
    <tbody>${calls.map((c) => `
      <tr class="clickable" data-call="${c.id}">
        <td>${c.id}</td>
        <td>${esc(formatDate(c.created_at))}</td>
        <td>${esc(c.details.patient_name || '—')}</td>
        <td>${esc(state.config.callTypes[c.call_type]?.split(' (')[0] || c.call_type)}</td>
        <td><span class="chip ${STATUS_CHIPS[c.status] || ''}">${esc(STATUS_LABELS[c.status] || c.status)}</span></td>
        <td>${esc(c.level_of_service || '—')}</td>
        <td>${esc(c.call_taker || '—')}</td>
      </tr>`).join('')}</tbody></table>`;
}

async function loadCalls() {
  const calls = await guarded(() => api('/api/admin/calls'));
  if (calls) $('#calls-table').innerHTML = callsTable(calls);
}

async function openCall(id) {
  const c = await guarded(() => api(`/api/admin/calls/${id}`));
  if (!c) return;
  const a = c.assessment;
  const d = c.details;
  const qByCode = new Map(state.questions.map((q) => [q.code, q]));
  if (!state.questions.length) {
    (await guarded(() => api('/api/admin/questions')) || []).forEach((q) => qByCode.set(q.code, q));
  }
  const detailRows = [
    ['Call type', state.config.callTypes[c.call_type]],
    ['Patient', [d.patient_name, d.patient_dob && `DOB ${d.patient_dob}`].filter(Boolean).join(' · ')],
    ['Member ID', d.member_id],
    ['Caller', [d.caller_name, d.caller_facility, d.caller_phone].filter(Boolean).join(' · ')],
    ['Pick-up', d.pickup_location],
    ['Destination', d.destination],
    ['Appointment', d.appointment?.replace('T', ' ')],
    ['Call taker', c.call_taker],
    ['Duration', d.duration_seconds ? `${Math.floor(d.duration_seconds / 60)}m ${d.duration_seconds % 60}s` : ''],
  ].filter(([, v]) => v);

  $('#call-modal-title').textContent = `Call #${c.id} — ${formatDate(c.created_at)}`;
  $('#call-detail').innerHTML = `
    <div class="status-banner status-${esc(a.status)}" style="margin-bottom: 16px">
      <div class="label">CMS Medical Necessity</div>
      <div class="value">${esc(STATUS_LABELS[a.status])}</div>
      <p>${esc(a.summary)} <strong>${esc(a.levelOfService?.label || '')}${a.levelOfService?.hcpcs ? ` (${esc(a.levelOfService.hcpcs)})` : ''}</strong></p>
    </div>
    <dl class="kv">${detailRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${a.alerts?.length ? `<div class="section-label">Alerts</div>${a.alerts.map((al) => `<div class="alert alert-${esc(al.level)}">${esc(al.text)}</div>`).join('')}` : ''}
    ${d.ai_summary ? `<div class="section-label">AI summary</div><p>${esc(d.ai_summary)}</p>` : ''}
    <div class="section-label">Responses</div>
    <table class="table"><tbody>${Object.entries(c.answers).map(([code, v]) =>
      `<tr><td>${esc(qByCode.get(code)?.text || code)}</td><td style="white-space:nowrap; font-weight:600">${esc(formatAnswer(v))}</td></tr>`).join('') || '<tr><td class="muted">No responses recorded.</td></tr>'}</tbody></table>
    ${(d.ai_questions || []).filter((q) => q.asked || q.note).length ? `<div class="section-label">AI follow-up questions</div>
      <ul>${d.ai_questions.filter((q) => q.asked || q.note).map((q) => `<li>${esc(q.question)} <strong>${esc(q.note || '(asked)')}</strong></li>`).join('')}</ul>` : ''}
    <div class="section-label">Transcript</div>
    <div class="card-body" style="background: var(--surface-2); border-radius: var(--radius-sm); white-space: pre-wrap; max-height: 260px; overflow-y: auto">${esc(c.transcript) || '<span class="muted">No transcript.</span>'}</div>`;
  $('#call-modal').hidden = false;
}

// --------------------------------------------------------------- settings
async function loadSettings() {
  const s = await guarded(() => api('/api/admin/settings'));
  if (!s) return;
  renderSettings(s);
}

function renderSettings(s) {
  const form = $('#settings-form').elements;
  form.org_name.value = s.org_name || '';
  form.ai_enabled.checked = s.ai_enabled === 'true';
  form.ai_auto_analyze.checked = s.ai_auto_analyze === 'true';
  const status = $('#ai-status');
  status.className = `alert ${s.ai_configured ? 'alert-info' : 'alert-warning'}`;
  status.innerHTML = s.ai_configured
    ? '<span class="icon">✓</span><span>An Anthropic API key is configured on the server. AI analysis is available to call takers when enabled below.</span>'
    : '<span class="icon">!</span><span>No AI key configured. Set <code>ANTHROPIC_API_KEY</code> in the server environment and restart to enable AI analysis. Keyword detection works without it.</span>';
}

async function saveSettings(e) {
  e.preventDefault();
  const form = e.target.elements;
  const s = await guarded(() => api('/api/admin/settings', {
    method: 'PUT',
    body: { org_name: form.org_name.value.trim(), ai_enabled: form.ai_enabled.checked, ai_auto_analyze: form.ai_auto_analyze.checked },
  }));
  if (!s) return;
  state.config.orgName = s.org_name;
  $('#org-name').textContent = `${s.org_name} · Admin Dashboard`;
  renderSettings(s);
  toast('Settings saved.', 'success');
}

init().catch((err) => toast(err.message, 'error'));

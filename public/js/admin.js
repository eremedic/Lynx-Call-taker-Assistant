import { api, esc, toast, requireUser, mountUserMenu, ROLE_LABELS, STATUS_LABELS, STATUS_CHIPS, CRITERION_LABELS, CRITERION_CHIPS, PRIORITY_LABELS, formatAnswer, formatDate } from './common.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = { payers: [], editingPayer: null, editingKind: 'payer', user: null, config: null, questions: [], editing: null, users: [], editingUser: null, auditOffset: 0 };
const AUDIT_PAGE = 50;

const TYPE_LABELS = { yes_no: 'Yes / No', choice: 'Choice', text: 'Text', number: 'Number' };

// ------------------------------------------------------------------- init
async function init() {
  state.user = await requireUser({ role: 'admin' });
  state.config = await api('/api/config');
  state.payers = await api('/api/admin/payers');
  mountUserMenu($('#user-menu'), state.user);
  $('#org-name').textContent = `${state.config.orgName || ''} · Admin Dashboard`;
  $('#app').hidden = false;
  bindEvents();
  showView(location.hash.slice(1) || 'overview');
}

async function guarded(fn) {
  try {
    return await fn();
  } catch (err) {
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
  $('#f-criterion').addEventListener('change', (e) => {
    if (!state.editing) $('#q-form').elements.necessity.checked = !['emergency', 'info'].includes(e.target.value);
  });
  $('#refresh-calls').addEventListener('click', loadCalls);
  $('#settings-form').addEventListener('submit', saveSettings);
  $('#add-user').addEventListener('click', () => openUser(null));
  $('#add-payer').addEventListener('click', () => openPayer(null, 'payer'));
  $('#add-broker').addEventListener('click', () => openPayer(null, 'broker'));
  $('#add-broker-2').addEventListener('click', () => openPayer(null, 'broker'));
  // Choosing a broker's payer program fills in that payer's rules as a starting point.
  $('#p-parent_code').addEventListener('change', (e) => {
    const parent = state.payers.find((x) => x.code === e.target.value);
    if (parent && !state.editingPayer) fillPayerRules($('#payer-form').elements, { ...parent, prior_auth: { ...parent.prior_auth, non_emergency: 'required', repetitive: 'required' } });
  });
  $('#payer-form').addEventListener('submit', savePayer);
  $('#payer-rows').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-payer]');
    if (edit) return openPayer(state.payers.find((p) => p.id === Number(edit.dataset.editPayer)));
    const del = e.target.closest('[data-delete-payer]');
    if (del) return deletePayer(state.payers.find((p) => p.id === Number(del.dataset.deletePayer)));
  });
  $('#payer-rows').addEventListener('change', async (e) => {
    const toggle = e.target.closest('[data-payer-active]');
    if (!toggle) return;
    const updated = await guarded(() => api(`/api/admin/payers/${toggle.dataset.payerActive}`, { method: 'PUT', body: { active: toggle.checked } }));
    if (!updated) { toggle.checked = !toggle.checked; return; }
    toast(`${updated.name} ${updated.active ? 'activated' : 'deactivated'}.`, 'success');
    loadPayers();
  });
  $('#user-form').addEventListener('submit', saveUser);
  $('#copy-password').addEventListener('click', () => {
    navigator.clipboard.writeText($('#temp-password').textContent).then(() => toast('Copied.', 'success'), () => toast('Clipboard unavailable.', 'error'));
  });
  $('#user-rows').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-user]');
    if (edit) return openUser(state.users.find((u) => u.id === Number(edit.dataset.editUser)));
    const reset = e.target.closest('[data-reset-user]');
    if (reset) return resetPassword(state.users.find((u) => u.id === Number(reset.dataset.resetUser)));
  });
  $('#audit-filters').addEventListener('input', debounceAudit);
  $('#audit-filters').addEventListener('submit', (e) => e.preventDefault());
  $('#audit-prev').addEventListener('click', () => { state.auditOffset = Math.max(0, state.auditOffset - AUDIT_PAGE); loadAudit(); });
  $('#audit-next').addEventListener('click', () => { state.auditOffset += AUDIT_PAGE; loadAudit(); });
  $('#export-audit').addEventListener('click', () => { location.href = `/api/admin/audit/export.csv?${auditQuery()}`; });

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
  if (!['overview', 'questions', 'payers', 'calls', 'users', 'audit', 'settings'].includes(view)) view = 'overview';
  history.replaceState(null, '', `#${view}`);
  $$('.sidenav [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== view; });
  if (view === 'overview') loadOverview();
  if (view === 'questions') loadQuestions();
  if (view === 'calls') loadCalls();
  if (view === 'settings') loadSettings();
  if (view === 'users') loadUsers();
  if (view === 'payers') loadPayers();
  if (view === 'audit') { state.auditOffset = 0; loadAuditUsers().then(loadAudit); }
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
  const reviewed = totalCalls - (s.not_required || 0); // private / facility pay calls aren't reviewed
  const card = (label, value, sub = '') => `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div>`;
  $('#stats').innerHTML = [
    card('Active questions', stats.questions.active, `${stats.questions.total} total`),
    card('Calls today', stats.calls.today, `${totalCalls} all time`),
    card('Active users', stats.users.active, `${stats.users.total} accounts`),
    card('Meeting necessity', reviewed ? `${Math.round((meeting / reviewed) * 100)}%` : '—', `${meeting} of ${reviewed} reviewed calls`),
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
          ${q.payers.length ? `<span class="chip chip-green">${esc(q.payers.map(payerName).join(', '))}</span>` : ''}
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
  $('#f-payers').innerHTML = [{ code: '@broker', name: 'Any transport broker' }, ...state.payers].map((p) =>
    `<label><input type="checkbox" name="payers" value="${esc(p.code)}"> ${esc(p.name)}${p.kind === 'broker' ? ' (broker)' : ''}</label>`).join('');
  $('#f-call_types').innerHTML = Object.entries(state.config.callTypes).map(([k, label]) =>
    `<label><input type="checkbox" name="call_types" value="${k}"> ${esc(label)}</label>`).join('');
  $('#f-depends_on_code').innerHTML = '<option value="">— Not a follow-up —</option>' + state.questions
    .filter((o) => !q || o.id !== q.id)
    .map((o) => `<option value="${esc(o.code)}">${esc(o.code)} — ${esc(o.text.slice(0, 60))}</option>`).join('');

  const v = q || {
    code: '', category: '', text: '', guidance: '', answer_type: 'yes_no', options: [], call_types: [], payers: [], criterion: 'condition',
    qualifying_answer: 'yes', triggers: [], detect_yes: [], detect_no: [], depends_on_code: '', depends_on_answer: '',
    priority: 2, required: false, active: true, necessity: true, alert_answer: '', alert_text: '', alert_level: 'warning',
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
  el.necessity.checked = Boolean(v.necessity);
  el.active.checked = v.active !== false;
  el.alert_answer.value = v.alert_answer || '';
  el.alert_text.value = v.alert_text || '';
  el.alert_level.value = v.alert_level || 'warning';
  $$('#f-call_types input').forEach((cb) => { cb.checked = v.call_types.includes(cb.value); });
  $$('#f-payers input').forEach((cb) => { cb.checked = v.payers.includes(cb.value); });
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
    payers: $$('#f-payers input:checked').map((cb) => cb.value),
    criterion: el.criterion.value,
    qualifying_answer: el.qualifying_answer.value.trim(),
    priority: Number(el.priority.value),
    triggers: lines(el.triggers.value),
    detect_yes: el.answer_type.value === 'yes_no' ? lines(el.detect_yes.value) : [],
    detect_no: el.answer_type.value === 'yes_no' ? lines(el.detect_no.value) : [],
    depends_on_code: el.depends_on_code.value,
    depends_on_answer: el.depends_on_answer.value.trim(),
    required: el.required.checked,
    necessity: el.necessity.checked,
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

// ----------------------------------------------------------------- payers
const payerName = (code) => state.payers.find((p) => p.code === code)?.name || code;
const PA_CHIPS = { required: 'chip-red', varies: 'chip-amber', not_required: 'chip-green' };
const paChip = (policy) => `<span class="chip ${PA_CHIPS[policy] || ''}">${esc(state.config.priorAuthPolicies[policy] || '—')}</span>`;

const activeToggle = (p) => `<label class="switch"><input type="checkbox" data-payer-active="${p.id}" ${p.active ? 'checked' : ''} aria-label="Active"><span class="track"></span></label>`;
const rowActions = (p) => `
  <button type="button" class="btn btn-sm" data-edit-payer="${p.id}">Edit</button>
  ${p.is_system ? '' : `<button type="button" class="btn btn-sm btn-danger" data-delete-payer="${p.id}">Delete</button>`}`;

async function loadPayers() {
  const [list, qs] = await Promise.all([guarded(() => api('/api/admin/payers')), guarded(() => api('/api/admin/questions'))]);
  if (!list) return;
  state.payers = list;
  if (qs) state.questions = qs;
  const plain = list.filter((p) => p.kind !== 'broker');
  const brokers = list.filter((p) => p.kind === 'broker');

  $('#payer-rows').innerHTML = plain.map((p) => {
    const count = state.questions.filter((q) => q.payers.includes(p.code)).length;
    const brokerCount = brokers.filter((b) => b.parent_code === p.code).length;
    return `
      <tr class="${p.active ? '' : 'inactive'}">
        <td><strong>${esc(p.name)}</strong> ${p.is_system ? '' : '<span class="chip chip-blue">Custom</span>'}
          ${p.requires_medical_necessity ? '' : '<span class="chip chip-violet">No necessity review</span>'}
          <div class="code" style="margin-top: 2px">${esc(p.code)}</div>
          <div class="small muted" style="margin-top: 4px; max-width: 420px">${esc(p.description)}</div>
          ${brokerCount ? `<div class="small" style="margin-top: 4px">${brokerCount} transport broker${brokerCount > 1 ? 's' : ''}</div>` : ''}</td>
        <td>${paChip(p.prior_auth.non_emergency)}</td>
        <td>${paChip(p.prior_auth.repetitive)}</td>
        <td>${paChip(p.prior_auth.emergency)}</td>
        <td class="nowrap">${count ? `${count} payer-specific` : '<span class="muted">—</span>'}</td>
        <td>${activeToggle(p)}</td>
        <td class="actions">${rowActions(p)}</td>
      </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty">No payers configured.</td></tr>';

  $('#broker-rows').innerHTML = brokers.map((b) => `
    <tr class="${b.active ? '' : 'inactive'}">
      <td><strong>${esc(b.name)}</strong><div class="code" style="margin-top: 2px">${esc(b.code)}</div>
        ${b.description ? `<div class="small muted" style="margin-top: 4px; max-width: 360px">${esc(b.description)}</div>` : ''}</td>
      <td>${b.parent_code ? esc(payerName(b.parent_code)) : '<span class="muted">—</span>'}</td>
      <td>${paChip(b.prior_auth.non_emergency)}</td>
      <td class="small">${[b.contact_name, b.contact_phone && `Phone ${b.contact_phone}`, b.contact_fax && `Fax ${b.contact_fax}`, b.contact_email]
        .filter(Boolean).map(esc).join('<br>') || '<span class="muted">—</span>'}</td>
      <td>${activeToggle(b)}</td>
      <td class="actions">${rowActions(b)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">No transport brokers yet. Click “+ Add Broker” to add one.</td></tr>';
}

const PAYER_TEXT_FIELDS = ['name', 'code', 'description', 'prior_auth_note', 'certification', 'alternate_transport',
  'contact_name', 'contact_phone', 'contact_fax', 'contact_email', 'contact_url'];

function fillPayerRules(el, v) {
  for (const f of ['prior_auth_note', 'certification', 'alternate_transport']) el[f].value = v[f] || '';
  el.documentation.value = (v.documentation || []).join('\n');
  el.requires_medical_necessity.checked = v.requires_medical_necessity !== false;
  $$('[data-pa]').forEach((sel) => { sel.value = v.prior_auth?.[sel.dataset.pa] || 'varies'; });
}

function openPayer(p, kind = p?.kind || 'payer') {
  state.editingPayer = p;
  state.editingKind = kind;
  const isBroker = kind === 'broker';
  const form = $('#payer-form');
  form.reset();
  $('#payer-error').hidden = true;
  $('#payer-modal-title').textContent = p ? `Edit ${p.name}` : isBroker ? 'Add Transport Broker' : 'Add Payer';
  $('#p-name').placeholder = isBroker ? 'e.g. ModivCare — Ohio' : 'e.g. Texas Medicaid — Superior HealthPlan';
  $('#p-code').placeholder = isBroker ? 'e.g. broker_modivcare_oh' : 'e.g. medicaid_tx_superior';
  $('#p-prior-auth').innerHTML = Object.entries(state.config.callTypes).map(([type, label]) => `
    <div class="field">
      <label for="pa-${type}">${esc(label)}</label>
      <select id="pa-${type}" class="select" data-pa="${type}">
        ${Object.entries(state.config.priorAuthPolicies).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}
      </select>
    </div>`).join('');
  $('#p-parent-wrap').hidden = !isBroker;
  $('#p-parent_code').innerHTML = '<option value="">— Not linked to a payer —</option>' + state.payers
    .filter((x) => x.kind !== 'broker')
    .map((x) => `<option value="${esc(x.code)}">${esc(x.name)}</option>`).join('');

  const v = p || {
    code: '', name: '', description: '', parent_code: '', requires_medical_necessity: true,
    prior_auth: isBroker
      ? { emergency: 'not_required', non_emergency: 'required', repetitive: 'required' }
      : { emergency: 'not_required', non_emergency: 'varies', repetitive: 'varies' },
    prior_auth_note: isBroker ? 'The broker must assign the trip before transport. Record the broker trip number.' : '',
    certification: '', documentation: [], alternate_transport: '', active: true,
  };
  const el = form.elements;
  for (const f of PAYER_TEXT_FIELDS) el[f].value = v[f] || '';
  el.code.disabled = Boolean(p);
  el.parent_code.value = v.parent_code || '';
  el.active.checked = v.active;
  fillPayerRules(el, v);
  $('#payer-modal').hidden = false;
  el.name.focus();
}

async function savePayer(e) {
  e.preventDefault();
  const el = e.target.elements;
  const body = {
    name: el.name.value.trim(),
    description: el.description.value.trim(),
    requires_medical_necessity: el.requires_medical_necessity.checked,
    prior_auth: Object.fromEntries($$('[data-pa]').map((sel) => [sel.dataset.pa, sel.value])),
    prior_auth_note: el.prior_auth_note.value.trim(),
    certification: el.certification.value.trim(),
    documentation: lines(el.documentation.value),
    alternate_transport: el.alternate_transport.value.trim(),
    contact_name: el.contact_name.value.trim(),
    contact_phone: el.contact_phone.value.trim(),
    contact_fax: el.contact_fax.value.trim(),
    contact_email: el.contact_email.value.trim(),
    contact_url: el.contact_url.value.trim(),
    active: el.active.checked,
  };
  if (state.editingKind === 'broker') body.parent_code = el.parent_code.value || null;
  if (!state.editingPayer) {
    body.code = el.code.value.trim().toLowerCase();
    body.kind = state.editingKind;
  }
  try {
    if (state.editingPayer) await api(`/api/admin/payers/${state.editingPayer.id}`, { method: 'PUT', body });
    else await api('/api/admin/payers', { method: 'POST', body });
  } catch (err) {
    $('#payer-error').textContent = err.message;
    $('#payer-error').hidden = false;
    return;
  }
  closeModals();
  const what = state.editingKind === 'broker' ? 'Broker' : 'Payer';
  toast(state.editingPayer ? `${what} updated.` : `${what} added. It now appears in the call taker's payer list.`, 'success');
  loadPayers();
}

async function deletePayer(p) {
  if (!p || !confirm(`Delete payer "${p.name}"? This cannot be undone.`)) return;
  const ok = await guarded(() => api(`/api/admin/payers/${p.id}`, { method: 'DELETE' }).then(() => true));
  if (ok) {
    toast('Payer deleted.', 'success');
    loadPayers();
  }
}

// ------------------------------------------------------------------ calls
function callsTable(calls) {
  if (!calls.length) return '<div class="empty">No calls saved yet. Calls appear here after the call taker clicks “Save Call Record”.</div>';
  return `<table class="table">
    <thead><tr><th>#</th><th>Date</th><th>Patient</th><th>Type</th><th>Payer</th><th>Assessment</th><th>Level of service</th><th>Call taker</th></tr></thead>
    <tbody>${calls.map((c) => `
      <tr class="clickable" data-call="${c.id}">
        <td>${c.id}</td>
        <td>${esc(formatDate(c.created_at))}</td>
        <td>${esc(c.details.patient_name || '—')}</td>
        <td>${esc(state.config.callTypes[c.call_type]?.split(' (')[0] || c.call_type)}</td>
        <td>${esc(c.payer ? payerName(c.payer) : '—')}</td>
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
    ['Payer', c.payer ? `${payerName(c.payer)}${a.payer ? ` — prior authorization: ${a.payer.priorAuthLabel}` : ''}` : 'Not selected'],
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
    <div style="display: flex; justify-content: flex-end; margin: -4px 0 12px">
      <a class="btn btn-sm" href="pcs.html?call=${c.id}&from=admin" target="_blank" rel="noopener">Open PCS form</a>
    </div>
    <div class="status-banner status-${esc(a.status)}" style="margin-bottom: 16px">
      <div class="label">Medical Necessity${a.payer ? ` · ${esc(a.payer.name)}` : ''}</div>
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

// ------------------------------------------------------------------ users
async function loadUsers() {
  const list = await guarded(() => api('/api/admin/users'));
  if (!list) return;
  state.users = list;
  $('#user-rows').innerHTML = list.map((u) => `
    <tr class="${u.active ? '' : 'inactive'}">
      <td><strong>${esc(u.display_name)}</strong>${u.id === state.user.id ? ' <span class="chip">You</span>' : ''}</td>
      <td class="code">${esc(u.username)}</td>
      <td><span class="chip ${u.role === 'admin' ? 'chip-violet' : 'chip-blue'}">${esc(ROLE_LABELS[u.role])}</span></td>
      <td>${!u.active ? '<span class="chip">Inactive</span>' : u.must_change_password ? '<span class="chip chip-amber">Password change pending</span>' : '<span class="chip chip-green">Active</span>'}</td>
      <td class="nowrap">${u.last_login_at ? esc(formatDate(u.last_login_at)) : '<span class="muted">Never</span>'}</td>
      <td class="actions">
        <button type="button" class="btn btn-sm" data-edit-user="${u.id}">Edit</button>
        <button type="button" class="btn btn-sm" data-reset-user="${u.id}">Reset password</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">No users.</td></tr>';
}

function openUser(u) {
  state.editingUser = u;
  const el = $('#user-form').elements;
  $('#user-form').reset();
  $('#user-error').hidden = true;
  $('#user-modal-title').textContent = u ? `Edit ${u.display_name}` : 'Add User';
  el.display_name.value = u?.display_name || '';
  el.username.value = u?.username || '';
  el.username.disabled = Boolean(u);
  el.role.value = u?.role || 'call_taker';
  el.active.checked = u ? u.active : true;
  $('#u-active-wrap').hidden = !u;
  $('#u-hint').textContent = u
    ? 'Deactivating an account signs the user out immediately. Accounts are never deleted so the audit trail stays intact.'
    : 'A temporary password will be generated. The user must change it at first sign-in.';
  $('#user-modal').hidden = false;
  el.display_name.focus();
}

async function saveUser(e) {
  e.preventDefault();
  const el = e.target.elements;
  const u = state.editingUser;
  try {
    if (u) {
      await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: { display_name: el.display_name.value.trim(), role: el.role.value, active: el.active.checked } });
      closeModals();
      toast('User updated.', 'success');
    } else {
      const r = await api('/api/admin/users', { method: 'POST', body: { display_name: el.display_name.value.trim(), username: el.username.value.trim(), role: el.role.value } });
      closeModals();
      showTempPassword(r.user, r.temporaryPassword, 'created');
    }
    loadUsers();
  } catch (err) {
    $('#user-error').textContent = err.message;
    $('#user-error').hidden = false;
  }
}

async function resetPassword(u) {
  if (!u || !confirm(`Reset the password for ${u.display_name}? They will be signed out everywhere.`)) return;
  const r = await guarded(() => api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' }));
  if (!r) return;
  showTempPassword(r.user, r.temporaryPassword, 'reset');
  loadUsers();
}

function showTempPassword(user, password, what) {
  $('#password-intro').innerHTML = what === 'created'
    ? `Account <strong>${esc(user.username)}</strong> created for ${esc(user.display_name)}.`
    : `Password reset for <strong>${esc(user.username)}</strong>.`;
  $('#temp-password').textContent = password;
  $('#password-modal').hidden = false;
}

// ------------------------------------------------------------------ audit
const ACTION_LABELS = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_blocked': 'Sign-in blocked (locked)',
  'auth.password_changed': 'Changed password',
  'auth.password_change_failed': 'Password change failed',
  'access.denied': 'Access denied',
  'call.saved': 'Saved call',
  'call.updated': 'Updated call',
  'pcs.generated': 'Generated PCS form',
  'call.viewed': 'Viewed call record',
  'call.list_viewed': 'Viewed call log',
  'ai.analyze': 'Sent transcript to AI',
  'question.created': 'Created question',
  'question.updated': 'Edited question',
  'question.deleted': 'Deleted question',
  'user.created': 'Created user',
  'user.updated': 'Edited user',
  'user.activated': 'Activated user',
  'user.deactivated': 'Deactivated user',
  'user.password_reset': 'Reset password',
  'settings.updated': 'Changed settings',
  'payer.created': 'Created payer',
  'payer.updated': 'Edited payer',
  'payer.deleted': 'Deleted payer',
  'audit.exported': 'Exported audit log',
};
const ACTION_CHIPS = { 'auth.login_failed': 'chip-red', 'auth.login_blocked': 'chip-red', 'access.denied': 'chip-red', 'user.deactivated': 'chip-amber', 'user.password_reset': 'chip-amber', 'ai.analyze': 'chip-violet', 'call.viewed': 'chip-blue', 'call.list_viewed': 'chip-blue' };

// Local calendar dates → UTC timestamps matching the stored format.
const toUtc = (date, addDays = 0) => {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + addDays);
  return d.toISOString().replace('T', ' ').slice(0, 23);
};

function auditQuery() {
  const f = $('#audit-filters').elements;
  const p = new URLSearchParams();
  if (f.q.value.trim()) p.set('q', f.q.value.trim());
  if (f.user_id.value) p.set('user_id', f.user_id.value);
  if (f.action.value) p.set('action', f.action.value);
  if (f.from.value) p.set('from', toUtc(f.from.value));
  if (f.to.value) p.set('to', toUtc(f.to.value, 1));
  return p.toString();
}

let auditTimer;
function debounceAudit() {
  clearTimeout(auditTimer);
  auditTimer = setTimeout(() => { state.auditOffset = 0; loadAudit(); }, 250);
}

async function loadAuditUsers() {
  const list = await guarded(() => api('/api/admin/users'));
  if (!list) return;
  const sel = $('#audit-filters').elements.user_id;
  const current = sel.value;
  sel.innerHTML = '<option value="">All users</option>' + list.map((u) => `<option value="${u.id}" ${String(u.id) === current ? 'selected' : ''}>${esc(u.display_name)} (${esc(u.username)})</option>`).join('');
}

function describeDetails(d) {
  if (!d || !Object.keys(d).length) return '';
  if (d.changes) {
    return Object.entries(d.changes).map(([k, v]) => `${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`).join('\n');
  }
  return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
}

async function loadAudit() {
  const r = await guarded(() => api(`/api/admin/audit?${auditQuery()}&limit=${AUDIT_PAGE}&offset=${state.auditOffset}`));
  if (!r) return;
  const actionSel = $('#audit-filters').elements.action;
  const current = actionSel.value;
  actionSel.innerHTML = '<option value="">All actions</option>' + r.actions.map((a) => `<option value="${esc(a)}" ${a === current ? 'selected' : ''}>${esc(ACTION_LABELS[a] || a)}</option>`).join('');
  $('#audit-rows').innerHTML = r.rows.map((row) => `
    <tr>
      <td class="nowrap">${esc(formatDate(row.created_at.slice(0, 19)))}<div class="small muted">#${row.id}</div></td>
      <td>${esc(row.username || 'system')}</td>
      <td><span class="chip ${ACTION_CHIPS[row.action] || ''}" title="${esc(row.action)}">${esc(ACTION_LABELS[row.action] || row.action)}</span></td>
      <td class="code">${row.entity_type ? `${esc(row.entity_type)} ${esc(row.entity_id ?? '')}` : ''}</td>
      <td><div class="audit-details">${esc(describeDetails(row.details))}</div></td>
      <td class="code">${esc(row.ip || '')}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="empty">No audit entries match these filters.</td></tr>';
  const first = r.total ? state.auditOffset + 1 : 0;
  $('#audit-count').textContent = `${first}–${state.auditOffset + r.rows.length} of ${r.total} entries`;
  $('#audit-prev').disabled = state.auditOffset === 0;
  $('#audit-next').disabled = state.auditOffset + r.rows.length >= r.total;
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

// Admin → Logic Builder: a drag-and-drop canvas for linking questions and
// answers to outcomes. Boxes are dragged from the palette, moved by their
// header, and connected by dragging from an answer's dot to another box.
// The rules themselves live in flow-logic.js, shared with the server.
import { api, esc, toast } from './common.js';
import {
  portsFor, runFlow, validateGraph, hasCycle, OUTCOME_KINDS, STATUS_OPTIONS, LEVEL_OPTIONS, ALERT_LEVELS, NUMBER_OPS,
  CONDITION_FIELDS, conditionPorts, LEVELS, TRIP_TYPES,
} from './flow-logic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_WIDTH = 250;
const MIN_WIDTH = 180;
const MAX_WIDTH = 640;
const MAX_HEIGHT = 900;
const nodeWidth = (n) => n.w || NODE_WIDTH;
// Position and size of a box. A stored height is a minimum: content never gets cut off.
const boxStyle = (n) => `left:${n.x}px; top:${n.y}px; width:${nodeWidth(n)}px;${n.h ? ` min-height:${n.h}px;` : ''}`;
const OUTCOME_ICONS = { status: '✓', level: '⬆', alert: '!', document: '✎' };

let deps; // { getQuestions, getPayers, getConfig, openQuestion }
const ed = {
  flows: [],
  flow: null, // working copy: { id|null, name, active, call_types, payers, graph }
  savedJson: '', // to detect unsaved changes
  scale: 1,
  panX: 40,
  panY: 30,
  selected: null, // { type: 'node', id } | { type: 'edge', index }
  testMode: false,
  testAnswers: {},
  testCtx: { payer: '', level: '', callType: '' }, // Test mode: the call's payer / level / trip type
  gesture: null, // current drag: pan | node | wire
};

const questionsByCode = () => new Map(deps.getQuestions().map((q) => [q.code, q]));
const graph = () => ed.flow.graph;
const nodeById = (id) => graph().nodes.find((n) => n.id === id);
const incomingCount = (id) => graph().edges.filter((e) => e.to === id).length;
const flowJson = (f) => JSON.stringify({ name: f.name, active: f.active, call_types: f.call_types, payers: f.payers, graph: f.graph });

export function logicHasUnsavedChanges() {
  return Boolean(ed.flow) && flowJson(ed.flow) !== ed.savedJson;
}

function markChanged() {
  $('#lb-save').classList.toggle('pulse', logicHasUnsavedChanges());
  $('#lb-unsaved').hidden = !logicHasUnsavedChanges();
}

// --------------------------------------------------------------- loading
export function initLogicBuilder(d) {
  deps = d;
  bind();
}

export async function showLogicBuilder() {
  try {
    ed.flows = await api('/api/admin/flows');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  if (ed.flow?.id) {
    const fresh = ed.flows.find((f) => f.id === ed.flow.id);
    if (fresh && !logicHasUnsavedChanges()) openFlow(fresh);
  } else if (!ed.flow && ed.flows.length) {
    openFlow(ed.flows[0]);
  }
  renderFlowPicker();
  renderPalette();
  renderAll();
}

function openFlow(flow) {
  ed.flow = structuredClone({
    id: flow.id ?? null, name: flow.name, active: flow.active !== false,
    call_types: flow.call_types || [], payers: flow.payers || [], graph: flow.graph || { nodes: [], edges: [] },
  });
  ed.savedJson = flow.id ? flowJson(ed.flow) : '';
  ed.selected = null;
  ed.testAnswers = {};
  ed.testCtx = { payer: '', level: '', callType: '' };
  $('#lb-errors').hidden = true;
  renderFlowPicker();
  renderAll();
  renderPalette(); // mark this flow's questions as on the canvas
  requestAnimationFrame(fitView);
}

function confirmDiscard() {
  return !logicHasUnsavedChanges() || confirm('Discard the unsaved changes to this flow?');
}

// ------------------------------------------------------------- rendering
function renderFlowPicker() {
  const sel = $('#lb-flow');
  const options = ed.flows.map((f) => `<option value="${f.id}" ${ed.flow?.id === f.id ? 'selected' : ''}>${esc(f.name)}${f.active ? '' : ' (off)'}</option>`);
  if (ed.flow && !ed.flow.id) options.unshift(`<option value="" selected>${esc(ed.flow.name || 'New flow')} (not saved)</option>`);
  sel.innerHTML = options.join('') || '<option value="">No flows yet</option>';
  const has = Boolean(ed.flow);
  for (const id of ['lb-name', 'lb-active', 'lb-scope', 'lb-test', 'lb-delete', 'lb-save']) $(`#${id}`).disabled = !has;
  $('#lb-name').value = ed.flow?.name || '';
  $('#lb-active').checked = Boolean(ed.flow?.active);
  $('#lb-scope').textContent = `Applies to: ${scopeLabel()}`;
  $('#lb-workspace').hidden = !has;
  $('#lb-start').hidden = has;
  markChanged();
}

function scopeLabel() {
  if (!ed.flow) return 'All calls';
  const cfg = deps.getConfig();
  const parts = [];
  if (ed.flow.call_types.length) parts.push(ed.flow.call_types.map((t) => cfg.callTypes[t]?.split(' (')[0] || t).join(', '));
  if (ed.flow.payers.length) {
    const names = new Map(deps.getPayers().map((p) => [p.code, p.name]));
    parts.push(ed.flow.payers.map((c) => names.get(c) || c).join(', '));
  }
  return parts.join(' · ') || 'All calls';
}

const CRITERION_SHORT = {
  emergency: 'Emergency', bed_confined: 'Bed confinement', condition: 'Condition', als: 'ALS', sct: 'SCT',
  disqualifier: 'Rules out', documentation: 'Documentation', prior_auth: 'Prior auth', info: 'Information',
};
const ANSWER_SHORT = { yes_no: 'Yes / No', choice: 'Choice', number: 'Number', text: 'Text' };

// The question list: grouped by category, searchable, each with an Add button.
function renderPalette() {
  const term = $('#lb-search').value.trim().toLowerCase();
  const cat = $('#lb-category').value;
  const all = deps.getQuestions();
  const onCanvas = new Set((ed.flow?.graph.nodes || []).filter((n) => n.type === 'question').map((n) => n.code));

  // Category filter options (keep the current choice).
  const cats = [...new Set(all.map((q) => q.category))];
  $('#lb-category').innerHTML = `<option value="">All categories (${all.length})</option>`
    + cats.map((c) => `<option value="${esc(c)}" ${c === cat ? 'selected' : ''}>${esc(c)} (${all.filter((q) => q.category === c).length})</option>`).join('');

  const list = all.filter((q) => (!cat || q.category === cat)
    && (!term || `${q.text} ${q.code} ${q.category} ${CRITERION_SHORT[q.criterion] || ''}`.toLowerCase().includes(term)));
  $('#lb-q-total').textContent = String(all.length);

  const groups = new Map();
  for (const q of list) {
    if (!groups.has(q.category)) groups.set(q.category, []);
    groups.get(q.category).push(q);
  }
  $('#lb-questions').innerHTML = [...groups].map(([category, qs]) => `
    <div class="lb-pal-group">
      <div class="lb-pal-group-head">${esc(category)} <span>${qs.length}</span></div>
      ${qs.map((q) => {
        const used = onCanvas.has(q.code);
        return `
        <div class="lb-q ${used ? 'used' : ''}" draggable="true" data-add-question="${esc(q.code)}" title="${esc(q.text)}

Drag onto the canvas, or click + Add.">
          <div class="lb-q-text">${esc(q.text)}</div>
          <div class="lb-q-meta">
            <span class="lb-tag tag-${esc(q.criterion)}">${esc(CRITERION_SHORT[q.criterion] || q.criterion)}</span>
            <span class="lb-tag">${esc(ANSWER_SHORT[q.answer_type] || q.answer_type)}</span>
            ${q.active ? '' : '<span class="lb-tag tag-inactive">Inactive</span>'}
            ${used ? '<span class="lb-tag tag-used">✓ On canvas</span>' : ''}
            <button type="button" class="btn btn-sm lb-q-add" tabindex="-1">${used ? 'Show' : '+ Add'}</button>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('') || `<div class="lb-pal-empty">No questions match${term ? ` “${esc(term)}”` : ''}.<br><button type="button" class="btn btn-sm" data-pal-clear>Clear search</button></div>`;
}

function renderAll() {
  if (!ed.flow) return;
  applyTransform();
  renderNodes();
  drawEdges();
  renderTestSummary();
  $('#lb-empty').hidden = graph().nodes.length > 0;
  markChanged();
}

function answerControl(q) {
  const v = ed.testAnswers[q.code] ?? '';
  if (q.answer_type === 'yes_no' || q.answer_type === 'choice') {
    const opts = q.answer_type === 'yes_no' ? [['yes', 'Yes'], ['no', 'No']] : (q.options || []).map((o) => [o, o]);
    return `<select class="select" data-test="${esc(q.code)}" aria-label="Test answer"><option value="">— no answer —</option>
      ${opts.map(([val, label]) => `<option value="${esc(val)}" ${v === val ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  }
  return `<input class="input" data-test="${esc(q.code)}" value="${esc(v)}" type="${q.answer_type === 'number' ? 'number' : 'text'}" placeholder="Test answer">`;
}

function matchControl(n) {
  const count = incomingCount(n.id);
  if (count < 2) return '';
  return `<label class="lnode-match">${n.type === 'question' ? 'Ask when' : 'Happens when'}
    <select class="select" data-match="${n.id}">
      <option value="all" ${n.match !== 'any' ? 'selected' : ''}>ALL ${count} lines match</option>
      <option value="any" ${n.match === 'any' ? 'selected' : ''}>ANY line matches</option>
    </select></label>`;
}

function questionNodeHtml(n, q, run) {
  const gated = incomingCount(n.id) > 0;
  const state = ed.testMode ? (run.nodeOn.get(n.id) ? 'on' : gated ? 'off' : '') : '';
  const ports = portsFor(n, q);
  return `
    <div class="lnode lnode-question ${state} ${ed.selected?.id === n.id ? 'selected' : ''}" data-node="${n.id}" style="${boxStyle(n)}">
      <div class="lnode-in" data-in="${n.id}" title="Lines into this box decide when the question is asked"></div>
      <div class="lnode-head" data-drag="${n.id}">
        <span class="lnode-type">Question</span><span class="lnode-code">${esc(n.code)}</span>
        <button type="button" class="lnode-del" data-del-node="${n.id}" aria-label="Remove box">×</button>
      </div>
      <div class="lnode-title">${q ? esc(q.text) : `<span style="color: var(--red-600)">Question ${esc(n.code)} no longer exists</span>`}</div>
      ${gated ? `<div class="lnode-note">${ed.testMode && state === 'off' ? 'Not asked with these answers' : 'Only asked when the lines coming in match'}</div>` : ''}
      ${matchControl(n)}
      ${ed.testMode && q ? `<div class="lnode-test">${answerControl(q)}</div>` : ''}
      <div class="lnode-ports">
        ${ports.map((p) => `<div class="lport"><span>${esc(p.label)}</span>
          <span class="lnode-out port-${p.key === 'yes' ? 'yes' : p.key === 'no' ? 'no' : 'other'}" data-out="${n.id}" data-port="${esc(p.key)}" title="Drag to another box"></span></div>`).join('')}
      </div>
      ${q?.answer_type === 'number' ? `<div class="lnode-cond">
        ${(n.conditions || []).map((c, i) => `<span class="chip">${esc(c.op)} ${esc(c.value)} <button type="button" data-del-cond="${n.id}:${i}" aria-label="Remove condition">×</button></span>`).join('')}
        <div class="lnode-cond-add">
          <select class="select" data-cond-op="${n.id}">${NUMBER_OPS.map((o) => `<option>${o}</option>`).join('')}</select>
          <input class="input" data-cond-value="${n.id}" type="number" placeholder="Value">
          <button type="button" class="btn btn-sm" data-add-cond="${n.id}">+ Answer range</button>
        </div></div>` : ''}
      <div class="lnode-resize" data-resize="${n.id}" title="Drag to resize · double-click for the default size" aria-hidden="true"></div>
    </div>`;
}

function outcomeNodeHtml(n, run) {
  const count = incomingCount(n.id);
  const fires = ed.testMode && run.nodeOn.get(n.id);
  const options = (map, value) => Object.entries(map).map(([k, label]) => `<option value="${k}" ${value === k ? 'selected' : ''}>${esc(label)}</option>`).join('');
  let body = '';
  if (n.kind === 'status') {
    body = `<select class="select" data-field="value" data-node-field="${n.id}"><option value="">Choose a result…</option>${options(STATUS_OPTIONS, n.value)}</select>
      <textarea class="textarea" rows="2" data-field="text" data-node-field="${n.id}" placeholder="Explanation shown to the call taker (optional)">${esc(n.text || '')}</textarea>`;
  } else if (n.kind === 'level') {
    body = `<select class="select" data-field="value" data-node-field="${n.id}"><option value="">Choose a level…</option>${options(LEVEL_OPTIONS, n.value)}</select>`;
  } else if (n.kind === 'alert') {
    body = `<select class="select" data-field="value" data-node-field="${n.id}">${options(ALERT_LEVELS, n.value || 'warning')}</select>
      <textarea class="textarea" rows="2" data-field="text" data-node-field="${n.id}" placeholder="Message shown to the call taker">${esc(n.text || '')}</textarea>`;
  } else {
    body = `<textarea class="textarea" rows="2" data-field="text" data-node-field="${n.id}" placeholder="What must be documented, e.g. signed PCS from the attending physician">${esc(n.text || '')}</textarea>`;
  }
  return `
    <div class="lnode lnode-outcome kind-${n.kind} ${fires ? 'on' : ed.testMode ? 'off' : ''} ${ed.selected?.id === n.id ? 'selected' : ''}" data-node="${n.id}" style="${boxStyle(n)}">
      <div class="lnode-in" data-in="${n.id}" title="Draw lines from answers into this box"></div>
      <div class="lnode-head" data-drag="${n.id}">
        <span class="lnode-type">${OUTCOME_ICONS[n.kind]} Outcome</span>
        ${fires ? '<span class="lnode-fires">Fires</span>' : ''}
        <button type="button" class="lnode-del" data-del-node="${n.id}" aria-label="Remove box">×</button>
      </div>
      <div class="lnode-body">
        <select class="select lnode-kind" data-field="kind" data-node-field="${n.id}">${options(OUTCOME_KINDS, n.kind)}</select>
        ${body}
        ${matchControl(n)}
        ${count === 0 ? '<div class="lnode-note">Draw a line from an answer into this box.</div>' : ''}
      </div>
      <div class="lnode-resize" data-resize="${n.id}" title="Drag to resize · double-click for the default size" aria-hidden="true"></div>
    </div>`;
}

// The call details Test mode checks condition boxes against.
function testContext() {
  const p = deps.getPayers().find((x) => x.code === ed.testCtx.payer);
  return { payer: p ? { code: p.code, parent_code: p.parent_code } : null, level: ed.testCtx.level, callType: ed.testCtx.callType };
}
const runTest = () => runFlow(graph(), ed.testAnswers, testContext());

// A condition box starts a tree from something chosen in Call Setup.
function conditionNodeHtml(n, run) {
  const gated = incomingCount(n.id) > 0;
  const state = ed.testMode ? (run.nodeOn.get(n.id) ? 'on' : 'off') : '';
  const payers = deps.getPayers();
  const picked = new Set(n.values || []);
  const body = n.field === 'payer'
    ? `<div class="lnode-payers">${payers.map((p) => `<label><input type="checkbox" data-cond-payer="${n.id}" value="${esc(p.code)}" ${picked.has(p.code) ? 'checked' : ''}> ${esc(p.name)}${p.kind === 'broker' ? ' (broker)' : ''}</label>`).join('')}</div>
       <div class="lnode-note">Yes = one of the checked payers. Brokers count as the payer they book for.</div>`
    : `<div class="lnode-note">${n.field === 'level' ? 'One line per level chosen on the Trip tab.' : 'One line per trip type chosen on the Trip tab.'}</div>`;
  return `
    <div class="lnode lnode-condition ${state} ${ed.selected?.id === n.id ? 'selected' : ''}" data-node="${n.id}" style="${boxStyle(n)}">
      <div class="lnode-in" data-in="${n.id}" title="Optional: lines into a condition must also match"></div>
      <div class="lnode-head" data-drag="${n.id}">
        <span class="lnode-type">◆ ${esc(CONDITION_FIELDS[n.field] || 'Condition')}</span>
        <button type="button" class="lnode-del" data-del-node="${n.id}" aria-label="Remove box">×</button>
      </div>
      <div class="lnode-body">${body}${gated ? matchControl(n) : ''}</div>
      <div class="lnode-ports">
        ${conditionPorts(n).map((p) => `<div class="lport"><span>${esc(p.label)}</span>
          <span class="lnode-out port-${p.key === 'yes' ? 'yes' : p.key === 'no' ? 'no' : 'other'}" data-out="${n.id}" data-port="${esc(p.key)}" title="Drag to the next box"></span></div>`).join('')}
      </div>
      <div class="lnode-resize" data-resize="${n.id}" title="Drag to resize · double-click for the default size" aria-hidden="true"></div>
    </div>`;
}

function renderNodes() {
  const qs = questionsByCode();
  const run = runTest();
  $('#lb-nodes').innerHTML = graph().nodes.map((n) => (n.type === 'question' ? questionNodeHtml(n, qs.get(n.code), run)
    : n.type === 'condition' ? conditionNodeHtml(n, run) : outcomeNodeHtml(n, run))).join('');
  // Redraw the lines whenever a box changes size (resize grip, text areas, wrapping).
  sizeWatcher.disconnect();
  $$('#lb-nodes .lnode').forEach((el) => sizeWatcher.observe(el));
}

const lastGrip = { id: null, at: 0 };
let redrawQueued = false;
const sizeWatcher = new ResizeObserver(() => {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => { redrawQueued = false; if (ed.flow) drawEdges(); });
});

// Center of an element in world coordinates.
function worldCenter(el) {
  const r = el.getBoundingClientRect();
  return clientToWorld(r.left + r.width / 2, r.top + r.height / 2);
}

function clientToWorld(x, y) {
  const c = $('#lb-canvas').getBoundingClientRect();
  return { x: (x - c.left - ed.panX) / ed.scale, y: (y - c.top - ed.panY) / ed.scale };
}

const curve = (a, b) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};
const midpoint = (a, b) => {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
  // Cubic Bézier at t = 0.5.
  return { x: (a.x + 3 * (a.x + dx) + 3 * (b.x - dx) + b.x) / 8, y: (a.y + 3 * a.y + 3 * b.y + b.y) / 8 };
};

function drawEdges() {
  const svg = $('#lb-edges');
  const run = ed.testMode ? runTest() : null;
  const parts = [];
  let selectedMid = null;
  graph().edges.forEach((e, i) => {
    const out = $(`[data-out="${CSS.escape(e.from)}"][data-port="${CSS.escape(e.port)}"]`);
    const into = $(`[data-in="${CSS.escape(e.to)}"]`);
    if (!out || !into) return;
    const a = worldCenter(out);
    const b = worldCenter(into);
    const tone = e.port === 'yes' ? 'yes' : e.port === 'no' ? 'no' : 'other';
    const state = run ? (run.edgeOn.has(e) ? 'on' : 'off') : '';
    const sel = ed.selected?.type === 'edge' && ed.selected.index === i;
    if (sel) selectedMid = midpoint(a, b);
    parts.push(`<path class="lb-edge tone-${tone} ${state} ${sel ? 'selected' : ''}" d="${curve(a, b)}"/>
      <path class="lb-edge-hit" data-edge="${i}" d="${curve(a, b)}"><title>Click to select, then press Delete</title></path>`);
  });
  if (ed.gesture?.type === 'wire') parts.push(`<path class="lb-edge wiring" d="${curve(ed.gesture.start, ed.gesture.end)}"/>`);
  svg.innerHTML = parts.join('');
  const del = $('#lb-edge-del');
  del.hidden = !selectedMid;
  if (selectedMid) {
    del.style.left = `${selectedMid.x}px`;
    del.style.top = `${selectedMid.y}px`;
  }
}

function applyTransform() {
  $('#lb-world').style.transform = `translate(${ed.panX}px, ${ed.panY}px) scale(${ed.scale})`;
  $('#lb-canvas').style.backgroundPosition = `${ed.panX}px ${ed.panY}px`;
  $('#lb-canvas').style.backgroundSize = `${24 * ed.scale}px ${24 * ed.scale}px`;
}

function renderTestSummary() {
  const box = $('#lb-test-summary');
  box.hidden = !ed.testMode;
  if (!ed.testMode) return;
  const run = runTest();
  const fired = run.outcomes.map((n) => {
    const what = n.kind === 'status' ? STATUS_OPTIONS[n.value] : n.kind === 'level' ? LEVEL_OPTIONS[n.value] : n.text;
    return `<li><strong>${esc(OUTCOME_KINDS[n.kind])}:</strong> ${esc(what || '—')}</li>`;
  });
  const opt = (map, value) => Object.entries(map).map(([k, label]) => `<option value="${esc(k)}" ${value === k ? 'selected' : ''}>${esc(label)}</option>`).join('');
  box.innerHTML = `<strong>Test mode.</strong> Choose a call below, then pick answers in the question boxes to see which lines and outcomes switch on (green).
    <div class="lb-test-ctx">
      <label>Payer <select class="select" data-test-ctx="payer"><option value="">— none —</option>${deps.getPayers().map((p) => `<option value="${esc(p.code)}" ${ed.testCtx.payer === p.code ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Level <select class="select" data-test-ctx="level"><option value="">— none —</option>${opt(LEVELS, ed.testCtx.level)}</select></label>
      <label>Trip type <select class="select" data-test-ctx="callType"><option value="">— none —</option>${opt(TRIP_TYPES, ed.testCtx.callType)}</select></label>
    </div>
    ${fired.length ? `<ul>${fired.join('')}</ul>` : '<div class="muted">No outcome fires with these answers.</div>'}`;
}

// --------------------------------------------------------------- editing
function nextId() {
  const max = graph().nodes.reduce((m, n) => Math.max(m, Number(String(n.id).replace(/\D/g, '')) || 0), 0);
  return `n${max + 1}`;
}

function addNode(spec, at) {
  if (!ed.flow) return;
  if (spec.type === 'question') {
    const existing = graph().nodes.find((n) => n.type === 'question' && n.code === spec.code);
    if (existing) {
      select({ type: 'node', id: existing.id });
      centerOn(existing);
      toast('That question is already on the canvas — it is highlighted.');
      return;
    }
  }
  const pos = at || visibleCenter();
  const place = { x: Math.round(pos.x - NODE_WIDTH / 2), y: Math.round(pos.y - 30) };
  const node = spec.type === 'question' ? { id: nextId(), type: 'question', code: spec.code, match: 'all', ...place }
    : spec.type === 'condition' ? { id: nextId(), type: 'condition', field: spec.field, values: [], match: 'all', ...place }
    : { id: nextId(), type: 'outcome', kind: spec.kind, value: spec.kind === 'alert' ? 'warning' : '', text: '', match: 'all', ...place };
  graph().nodes.push(node);
  ed.selected = { type: 'node', id: node.id };
  renderAll();
  renderPalette();
}

function visibleCenter() {
  const c = $('#lb-canvas').getBoundingClientRect();
  const p = clientToWorld(c.left + c.width / 2, c.top + c.height / 2);
  // Offset each new box a little so they don't stack exactly.
  const n = graph().nodes.length % 6;
  return { x: p.x + n * 18, y: p.y + n * 18 };
}

function addEdge(from, port, to) {
  if (from === to) return toast('A box can’t connect to itself.');
  if (graph().edges.some((e) => e.from === from && e.port === port && e.to === to)) return toast('Those are already connected.');
  const candidate = { nodes: graph().nodes, edges: [...graph().edges, { from, port, to }] };
  if (hasCycle(candidate)) return toast('That line would make a loop: a question can’t depend on its own answer.', 'error');
  graph().edges.push({ from, port, to });
  renderAll();
}

function removeNode(id) {
  const g = graph();
  g.nodes = g.nodes.filter((n) => n.id !== id);
  g.edges = g.edges.filter((e) => e.from !== id && e.to !== id);
  ed.selected = null;
  renderAll();
  renderPalette();
}

function removeSelected() {
  if (!ed.selected) return;
  if (ed.selected.type === 'edge') {
    graph().edges.splice(ed.selected.index, 1);
    ed.selected = null;
    renderAll();
  } else {
    removeNode(ed.selected.id);
  }
}

function select(sel) {
  ed.selected = sel;
  $$('#lb-nodes .lnode').forEach((el) => el.classList.toggle('selected', sel?.type === 'node' && el.dataset.node === sel.id));
  drawEdges();
}

function centerOn(node) {
  const c = $('#lb-canvas').getBoundingClientRect();
  ed.panX = c.width / 2 - (node.x + nodeWidth(node) / 2) * ed.scale;
  ed.panY = c.height / 2 - (node.y + 60) * ed.scale;
  applyTransform();
  drawEdges();
}

function zoom(factor, around) {
  const c = $('#lb-canvas').getBoundingClientRect();
  const px = around ? around.x - c.left : c.width / 2;
  const py = around ? around.y - c.top : c.height / 2;
  const next = Math.min(2, Math.max(0.3, ed.scale * factor));
  ed.panX = px - ((px - ed.panX) / ed.scale) * next;
  ed.panY = py - ((py - ed.panY) / ed.scale) * next;
  ed.scale = next;
  applyTransform();
  drawEdges();
}

function fitView() {
  if (!ed.flow) return;
  const nodes = graph().nodes;
  const c = $('#lb-canvas').getBoundingClientRect();
  if (!nodes.length || !c.width) {
    Object.assign(ed, { scale: 1, panX: 40, panY: 30 });
    applyTransform();
    return;
  }
  const els = $$('#lb-nodes .lnode');
  const heights = new Map(els.map((el) => [el.dataset.node, el.offsetHeight]));
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const maxX = Math.max(...nodes.map((n) => n.x + nodeWidth(n)));
  const maxY = Math.max(...nodes.map((n) => n.y + (heights.get(n.id) || 160)));
  const pad = 40;
  ed.scale = Math.min(1.2, Math.max(0.3, Math.min((c.width - pad * 2) / (maxX - minX), (c.height - pad * 2) / (maxY - minY))));
  ed.panX = pad - minX * ed.scale + ((c.width - pad * 2) - (maxX - minX) * ed.scale) / 2;
  ed.panY = pad - minY * ed.scale;
  applyTransform();
  drawEdges();
}

// ------------------------------------------------------------ full screen
// The workspace covers the whole window. Where the browser allows it, the
// page also goes true full screen; the whole page, not just the canvas, so
// pop-ups (e.g. + New question) and messages still show.
export function isFullscreen() {
  return $('#lb-workspace').classList.contains('lb-fullscreen');
}

function setFullscreen(on) {
  const ws = $('#lb-workspace');
  if (on === isFullscreen()) return;
  ws.classList.toggle('lb-fullscreen', on);
  document.body.classList.toggle('lb-fullscreen-open', on);
  const fs = $('#lb-fullscreen');
  fs.textContent = on ? '✕ Exit full screen' : '⛶ Full screen';
  fs.setAttribute('aria-pressed', String(on));
  $$('#lb-workspace [data-fullscreen]').forEach((b) => b.classList.toggle('active', on));
  const root = document.documentElement;
  if (on && root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(() => {});
  if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  // Box positions on screen changed: redraw the lines once layout settles.
  requestAnimationFrame(() => requestAnimationFrame(fitView));
}

// ------------------------------------------------------------ save/load
async function saveFlow() {
  const errors = validateGraph(graph(), questionsByCode());
  if (!ed.flow.name.trim()) errors.unshift('Give the flow a name.');
  const box = $('#lb-errors');
  if (errors.length) {
    box.innerHTML = `<span class="icon">!</span><div><strong>Can’t save yet:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    box.hidden = false;
    return;
  }
  box.hidden = true;
  const body = { name: ed.flow.name.trim(), active: ed.flow.active, call_types: ed.flow.call_types, payers: ed.flow.payers, graph: graph() };
  try {
    const saved = ed.flow.id
      ? await api(`/api/admin/flows/${ed.flow.id}`, { method: 'PUT', body })
      : await api('/api/admin/flows', { method: 'POST', body });
    ed.flows = await api('/api/admin/flows');
    ed.flow.id = saved.id;
    ed.savedJson = flowJson(ed.flow);
    renderFlowPicker();
    toast(saved.active ? 'Flow saved. New calls use it right away.' : 'Flow saved. It is switched off, so calls don’t use it yet.', 'success');
  } catch (err) {
    box.innerHTML = `<span class="icon">!</span><div>${esc(err.message)}</div>`;
    box.hidden = false;
  }
}

async function deleteFlow() {
  if (!ed.flow) return;
  if (!confirm(`Delete the flow "${ed.flow.name}"? Calls stop using it immediately.`)) return;
  try {
    if (ed.flow.id) await api(`/api/admin/flows/${ed.flow.id}`, { method: 'DELETE' });
    ed.flows = await api('/api/admin/flows');
    ed.flow = null;
    ed.savedJson = '';
    if (ed.flows.length) openFlow(ed.flows[0]);
    else renderFlowPicker();
    toast('Flow deleted.', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

function newFlow(example = false) {
  if (!confirmDiscard()) return;
  openFlow(example ? exampleFlow() : { id: null, name: 'New flow', active: true, call_types: [], payers: [], graph: { nodes: [], edges: [] } });
  $('#lb-name').focus();
  $('#lb-name').select();
}

// A small starting point built from the built-in question bank.
function exampleFlow() {
  const has = questionsByCode();
  const q = (id, code, x, y) => (has.has(code) ? { id, type: 'question', code, match: 'all', x, y } : null);
  const nodes = [
    q('n1', 'BED_GET_UP', 0, 0), q('n2', 'BED_AMBULATE', 0, 230), q('n3', 'BED_SIT', 0, 460),
    q('n4', 'TX_OTHER_MEANS', 0, 690),
    { id: 'n5', type: 'outcome', kind: 'status', value: 'meets', text: 'Bed-confined: cannot get up, walk, or sit in a chair or wheelchair.', match: 'all', x: 420, y: 200 },
    { id: 'n6', type: 'outcome', kind: 'status', value: 'not_met', text: 'Caller says the patient could travel safely another way.', match: 'all', x: 420, y: 660 },
    { id: 'n7', type: 'outcome', kind: 'alert', value: 'info', text: 'Offer wheelchair van or other transport.', match: 'any', x: 420, y: 880 },
  ].filter(Boolean);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = [
    { from: 'n1', port: 'yes', to: 'n5' }, { from: 'n2', port: 'yes', to: 'n5' }, { from: 'n3', port: 'yes', to: 'n5' },
    { from: 'n4', port: 'yes', to: 'n6' }, { from: 'n4', port: 'yes', to: 'n7' },
  ].filter((e) => ids.has(e.from) && ids.has(e.to));
  return { id: null, name: 'Example: bed confinement', active: false, call_types: [], payers: [], graph: { nodes, edges } };
}

function renderScope() {
  const cfg = deps.getConfig();
  $('#lb-scope-types').innerHTML = Object.entries(cfg.callTypes).map(([k, label]) =>
    `<label><input type="checkbox" data-scope-type="${esc(k)}" ${ed.flow.call_types.includes(k) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
  $('#lb-scope-payers').innerHTML = deps.getPayers().map((p) =>
    `<label><input type="checkbox" data-scope-payer="${esc(p.code)}" ${ed.flow.payers.includes(p.code) ? 'checked' : ''}> ${esc(p.name)}${p.kind === 'broker' ? ' (broker)' : ''}</label>`).join('');
}

// ---------------------------------------------------------------- events
function bind() {
  const canvas = $('#lb-canvas');

  $('#lb-new').addEventListener('click', () => newFlow());
  $('#lb-example').addEventListener('click', () => newFlow(true));
  $('#lb-start-new').addEventListener('click', () => newFlow());
  $('#lb-start-example').addEventListener('click', () => newFlow(true));
  $('#lb-flow').addEventListener('change', (e) => {
    const target = ed.flows.find((f) => String(f.id) === e.target.value);
    if (!target || !confirmDiscard()) return renderFlowPicker();
    openFlow(target);
  });
  $('#lb-name').addEventListener('input', (e) => { ed.flow.name = e.target.value; markChanged(); });
  $('#lb-active').addEventListener('change', (e) => { ed.flow.active = e.target.checked; markChanged(); });
  $('#lb-save').addEventListener('click', saveFlow);
  $('#lb-workspace').addEventListener('click', (e) => {
    if (e.target.closest('[data-fullscreen]')) setFullscreen(!isFullscreen());
  });
  // Esc in the browser's full screen exits it; leave our full-window mode too.
  // Esc closes an open pop-up first; with none open, it leaves full screen.
  // (Capture phase: runs before the admin page closes the pop-up.)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isFullscreen() && !$('.modal-backdrop:not([hidden])')) setFullscreen(false);
  }, true);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isFullscreen()) setFullscreen(false); });
  $('#lb-delete').addEventListener('click', deleteFlow);
  $('#lb-test').addEventListener('change', (e) => {
    ed.testMode = e.target.checked;
    renderAll();
  });
  $('#lb-scope').addEventListener('click', () => {
    const panel = $('#lb-scope-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderScope();
  });
  $('#lb-scope-panel').addEventListener('change', (e) => {
    const t = e.target.dataset.scopeType;
    const p = e.target.dataset.scopePayer;
    const toggle = (list, v, on) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
    if (t) ed.flow.call_types = toggle(ed.flow.call_types, t, e.target.checked);
    if (p) ed.flow.payers = toggle(ed.flow.payers, p, e.target.checked);
    $('#lb-scope').textContent = `Applies to: ${scopeLabel()}`;
    markChanged();
  });
  $('#lb-search').addEventListener('input', renderPalette);
  $('#lb-category').addEventListener('change', renderPalette);
  // Palette tabs: Questions / Start & outcomes.
  $('#lb-palette').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-pal-tab]');
    if (tab) {
      $$('[data-pal-tab]').forEach((b) => { const on = b === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); });
      $$('[data-pal-pane]').forEach((p) => { p.hidden = p.dataset.palPane !== tab.dataset.palTab; });
      if (tab.dataset.palTab === 'questions') $('#lb-search').focus();
      return;
    }
    if (e.target.closest('[data-pal-clear]')) {
      $('#lb-search').value = '';
      $('#lb-category').value = '';
      renderPalette();
    }
  });
  // A question created from here drops onto the canvas once it is saved.
  let codesBeforeNew = null;
  $('#lb-new-question').addEventListener('click', () => {
    codesBeforeNew = new Set(deps.getQuestions().map((q) => q.code));
    deps.openQuestion();
  });
  document.addEventListener('questions-changed', () => {
    if (!ed.flow) return;
    renderPalette();
    renderAll();
    if (codesBeforeNew) {
      const added = deps.getQuestions().find((q) => !codesBeforeNew.has(q.code));
      if (added) {
        codesBeforeNew = null;
        addNode({ type: 'question', code: added.code });
        toast(`“${added.text}” is on the canvas. Draw a line into it from the answer that should lead to it.`, 'success');
      }
    }
  });

  // Palette: drag onto the canvas, or click to add in the middle.
  const palette = $('#lb-palette');
  const specFor = (item) => (item.dataset.addQuestion ? { type: 'question', code: item.dataset.addQuestion }
    : item.dataset.addCondition ? { type: 'condition', field: item.dataset.addCondition }
    : { type: 'outcome', kind: item.dataset.addOutcome });
  palette.addEventListener('dragstart', (e) => {
    const item = e.target.closest('[data-add-question], [data-add-outcome], [data-add-condition]');
    if (!item) return;
    const spec = specFor(item);
    e.dataTransfer.setData('application/x-ambuintake-box', JSON.stringify(spec));
    e.dataTransfer.effectAllowed = 'copy';
  });
  palette.addEventListener('click', (e) => {
    const item = e.target.closest('[data-add-question], [data-add-outcome], [data-add-condition]');
    if (!item) return;
    addNode(specFor(item));
  });
  canvas.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('application/x-ambuintake-box')) {
      e.preventDefault();
      canvas.classList.add('drop-target');
    }
  });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drop-target'));
  canvas.addEventListener('drop', (e) => {
    canvas.classList.remove('drop-target');
    const raw = e.dataTransfer.getData('application/x-ambuintake-box');
    if (!raw) return;
    e.preventDefault();
    addNode(JSON.parse(raw), clientToWorld(e.clientX, e.clientY));
  });

  // Canvas gestures: drag boxes, draw lines, pan the background.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !ed.flow) return;
    const out = e.target.closest('[data-out]');
    const head = e.target.closest('[data-drag]');
    const grip = e.target.closest('[data-resize]');
    if (grip) {
      e.preventDefault();
      // Double-click on the grip (two clicks, no drag): back to the default
      // size. Detected here because the drag captures the pointer, so no
      // dblclick event arrives.
      const now = Date.now();
      if (lastGrip.id === grip.dataset.resize && now - lastGrip.at < 400) {
        lastGrip.at = 0;
        const reset = nodeById(grip.dataset.resize);
        delete reset.w;
        delete reset.h;
        renderAll();
        return;
      }
      const node = nodeById(grip.dataset.resize);
      const el = grip.closest('.lnode');
      // The height the content needs, so the box can't be made smaller than that.
      const saved = el.style.minHeight;
      el.style.minHeight = '';
      const natural = el.offsetHeight;
      el.style.minHeight = saved;
      ed.gesture = { type: 'resize', node, el, natural, startX: e.clientX, startY: e.clientY, w: nodeWidth(node), h: el.offsetHeight, moved: false };
      select({ type: 'node', id: node.id });
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('resizing');
      return;
    }
    if (out) {
      e.preventDefault();
      const start = worldCenter(out);
      ed.gesture = { type: 'wire', from: out.dataset.out, port: out.dataset.port, start, end: start };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('wiring');
      return;
    }
    if (head && !e.target.closest('button, select, input, textarea')) {
      e.preventDefault();
      const node = nodeById(head.dataset.drag);
      const p = clientToWorld(e.clientX, e.clientY);
      ed.gesture = { type: 'node', node, dx: p.x - node.x, dy: p.y - node.y, el: head.closest('.lnode'), moved: false };
      select({ type: 'node', id: node.id });
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.target === canvas || e.target.id === 'lb-world' || e.target.id === 'lb-nodes' || e.target.id === 'lb-edges') {
      ed.gesture = { type: 'pan', x: e.clientX, y: e.clientY, panX: ed.panX, panY: ed.panY };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('panning');
      if (ed.selected) select(null);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const g = ed.gesture;
    if (!g) return;
    if (g.type === 'pan') {
      ed.panX = g.panX + e.clientX - g.x;
      ed.panY = g.panY + e.clientY - g.y;
      applyTransform();
    } else if (g.type === 'node') {
      const p = clientToWorld(e.clientX, e.clientY);
      g.node.x = Math.round(p.x - g.dx);
      g.node.y = Math.round(p.y - g.dy);
      g.el.style.left = `${g.node.x}px`;
      g.el.style.top = `${g.node.y}px`;
      g.moved = true;
      drawEdges();
    } else if (g.type === 'resize') {
      const w = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, g.w + (e.clientX - g.startX) / ed.scale)));
      const h = Math.round(Math.min(MAX_HEIGHT, Math.max(g.natural, g.h + (e.clientY - g.startY) / ed.scale)));
      g.node.w = w === NODE_WIDTH ? undefined : w;
      g.node.h = h > g.natural + 2 ? h : undefined; // at its natural height, keep it automatic
      if (!g.node.w) delete g.node.w;
      if (!g.node.h) delete g.node.h;
      g.el.style.width = `${w}px`;
      g.el.style.minHeight = g.node.h ? `${g.node.h}px` : '';
      g.moved = true;
      drawEdges();
    } else if (g.type === 'wire') {
      g.end = clientToWorld(e.clientX, e.clientY);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lnode');
      $$('#lb-nodes .lnode.drop-ok').forEach((el) => el.classList.remove('drop-ok'));
      if (over && over.dataset.node !== g.from) over.classList.add('drop-ok');
      drawEdges();
    }
  });
  const endGesture = (e) => {
    const g = ed.gesture;
    if (!g) return;
    ed.gesture = null;
    canvas.classList.remove('wiring', 'panning', 'resizing');
    $$('#lb-nodes .lnode.drop-ok').forEach((el) => el.classList.remove('drop-ok'));
    if (g.type === 'wire') {
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lnode');
      if (over && e.type === 'pointerup' && over.dataset.node !== g.from) addEdge(g.from, g.port, over.dataset.node);
      else drawEdges();
    }
    if ((g.type === 'node' || g.type === 'resize') && g.moved) markChanged();
    // A click on the grip without dragging counts toward a double-click.
    if (g.type === 'resize') Object.assign(lastGrip, g.moved ? { id: null, at: 0 } : { id: g.node.id, at: Date.now() });
  };
  canvas.addEventListener('pointerup', endGesture);

  canvas.addEventListener('pointercancel', endGesture);

  canvas.addEventListener('wheel', (e) => {
    if (!ed.flow) return;
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, { x: e.clientX, y: e.clientY });
  }, { passive: false });

  canvas.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-edge]');
    if (hit) return select({ type: 'edge', index: Number(hit.dataset.edge) });
    const del = e.target.closest('[data-del-node]');
    if (del) return removeNode(del.dataset.delNode);
    if (e.target.closest('#lb-edge-del')) return removeSelected();
    const zoomBtn = e.target.closest('[data-zoom]');
    if (zoomBtn) {
      const z = zoomBtn.dataset.zoom;
      if (z === 'fit') fitView();
      else zoom(z === 'in' ? 1.2 : 1 / 1.2);
      return;
    }
    const addCond = e.target.closest('[data-add-cond]');
    if (addCond) {
      const id = addCond.dataset.addCond;
      const value = $(`[data-cond-value="${CSS.escape(id)}"]`).value;
      if (value === '' || !Number.isFinite(Number(value))) return toast('Enter a number for the range.');
      const node = nodeById(id);
      const cond = { op: $(`[data-cond-op="${CSS.escape(id)}"]`).value, value: Number(value) };
      node.conditions = [...(node.conditions || []).filter((c) => !(c.op === cond.op && c.value === cond.value)), cond];
      return renderAll();
    }
    const delCond = e.target.closest('[data-del-cond]');
    if (delCond) {
      const [id, i] = delCond.dataset.delCond.split(':');
      const node = nodeById(id);
      const [removed] = node.conditions.splice(Number(i), 1);
      graph().edges = graph().edges.filter((ed2) => !(ed2.from === id && ed2.port === `${removed.op}:${removed.value}`));
      return renderAll();
    }
    const box = e.target.closest('.lnode');
    if (box && !e.target.closest('button, select, input, textarea')) select({ type: 'node', id: box.dataset.node });
  });

  canvas.addEventListener('change', (e) => {
    const field = e.target.closest('[data-node-field]');
    if (field) {
      const node = nodeById(field.dataset.nodeField);
      node[field.dataset.field] = e.target.value;
      if (field.dataset.field === 'kind') Object.assign(node, { value: e.target.value === 'alert' ? 'warning' : '', text: node.text || '' });
      renderAll();
      return;
    }
    const match = e.target.closest('[data-match]');
    if (match) {
      nodeById(match.dataset.match).match = e.target.value;
      renderAll();
      return;
    }
    const test = e.target.closest('[data-test]');
    if (test) {
      ed.testAnswers[test.dataset.test] = e.target.value;
      renderAll();
      return;
    }
    const pick = e.target.closest('[data-cond-payer]');
    if (pick) {
      const node = nodeById(pick.dataset.condPayer);
      const values = new Set(node.values || []);
      if (pick.checked) values.add(pick.value); else values.delete(pick.value);
      node.values = [...values];
      renderAll();
    }
  });
  $('#lb-test-summary').addEventListener('change', (e) => {
    const ctx = e.target.closest('[data-test-ctx]');
    if (!ctx) return;
    ed.testCtx[ctx.dataset.testCtx] = e.target.value;
    renderAll();
  });
  canvas.addEventListener('input', (e) => {
    const field = e.target.closest('textarea[data-node-field]');
    if (field) {
      nodeById(field.dataset.nodeField)[field.dataset.field] = e.target.value;
      markChanged();
    }
  });
  // Text areas change box height, which moves the answer dots.
  canvas.addEventListener('keyup', (e) => { if (e.target.matches('textarea')) drawEdges(); });

  document.addEventListener('keydown', (e) => {
    if ($('[data-panel="logic"]').hidden || !ed.selected) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSelected();
    }
  });
  window.addEventListener('resize', () => { if (ed.flow && !$('[data-panel="logic"]').hidden) drawEdges(); });
  window.addEventListener('beforeunload', (e) => { if (logicHasUnsavedChanges()) e.preventDefault(); });
}

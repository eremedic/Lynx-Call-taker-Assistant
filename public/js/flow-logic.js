// Logic flows built in Admin → Logic Builder.
//
// Shared by the server (which applies them when evaluating a call) and the
// admin editor (which uses them for its Test mode), so the two always agree.
// No browser or Node APIs here.
//
// A flow is a graph:
//   nodes: { id, type: 'question', code, match, conditions?, x, y }
//          { id, type: 'outcome', kind, value, text, match, x, y }
//   edges: { from: questionNodeId, port: answerKey, to: nodeId }
// An edge is "on" when its source question is in play and the answer matches
// the port. A node with incoming edges is on when ALL of them are on
// (match: 'all', the default) or ANY of them is (match: 'any').
//   - A question node with incoming edges is only asked when it is on.
//   - An outcome node fires when it is on.

export const OUTCOME_KINDS = {
  status: 'Medical-necessity result',
  level: 'Level of service',
  alert: 'Alert to the call taker',
  document: 'Documentation reminder',
};

export const STATUS_OPTIONS = {
  meets: 'Meets criteria',
  likely: 'Likely meets — finish documentation',
  review: 'Needs supervisor review',
  not_met: 'Does not meet criteria',
};
// When several results fire, the most cautious one wins.
export const STATUS_SEVERITY = { meets: 0, likely: 1, review: 2, not_met: 3 };

export const LEVEL_OPTIONS = {
  sct: 'Specialty Care Transport (SCT)',
  als: 'Advanced Life Support (ALS)',
  bls: 'Basic Life Support (BLS)',
  none: 'Ambulance not indicated',
};
// When several levels fire, the highest level of care wins.
export const LEVEL_RANK = { none: 0, bls: 1, als: 2, sct: 3 };

export const ALERT_LEVELS = { info: 'Information', warning: 'Warning', critical: 'Critical' };

export const NUMBER_OPS = ['>=', '>', '<=', '<', '='];
const OP_LABELS = { '>=': '≥', '>': '>', '<=': '≤', '<': '<', '=': '=' };

const isAnswered = (v) => v !== undefined && v !== null && String(v).trim() !== '';

// The answer "ports" a question node offers for drawing lines from.
export function portsFor(node, question) {
  if (!question) return [];
  if (question.answer_type === 'yes_no') return [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }];
  if (question.answer_type === 'choice') return (question.options || []).map((o) => ({ key: o, label: o }));
  const ports = [{ key: '*', label: 'Any answer' }];
  if (question.answer_type === 'number') {
    for (const c of node.conditions || []) ports.push({ key: `${c.op}:${c.value}`, label: `${OP_LABELS[c.op] || c.op} ${c.value}` });
  }
  return ports;
}

// Does this answer satisfy the port?
export function matchPort(key, answer) {
  if (!isAnswered(answer)) return false;
  if (key === '*') return true;
  const m = /^(>=|<=|>|<|=):(.+)$/.exec(key);
  if (m) {
    const a = Number(answer);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return { '>=': a >= b, '>': a > b, '<=': a <= b, '<': a < b, '=': a === b }[m[1]];
  }
  return String(answer).trim().toLowerCase() === String(key).trim().toLowerCase();
}

// A flow scoped to call types / payers applies only to those calls. Payer
// scope also covers brokers that book for a listed payer.
export function flowApplies(flow, { callType, payer }) {
  if (flow.active === false) return false;
  if (flow.call_types?.length && !flow.call_types.includes(callType)) return false;
  if (flow.payers?.length) {
    if (!payer) return false;
    if (!flow.payers.includes(payer.code) && !(payer.parent_code && flow.payers.includes(payer.parent_code))) return false;
  }
  return true;
}

function indexGraph(graph) {
  const nodes = new Map((graph?.nodes || []).map((n) => [n.id, n]));
  const incoming = new Map();
  for (const e of graph?.edges || []) {
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to).push(e);
  }
  return { nodes, incoming };
}

// True when adding (or having) these edges makes a loop.
export function hasCycle(graph) {
  const { nodes } = indexGraph(graph);
  const out = new Map();
  for (const e of graph?.edges || []) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e.to);
  }
  const state = new Map(); // 1 = visiting, 2 = done
  const visit = (id) => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of out.get(id) || []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return [...nodes.keys()].some(visit);
}

// Problems that would stop a flow from working, in plain language.
export function validateGraph(graph, questionsByCode) {
  const errors = [];
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return ['The flow is empty or damaged.'];
  if (graph.nodes.length > 300 || graph.edges.length > 1000) errors.push('The flow is too large (at most 300 boxes and 1,000 lines).');
  const { nodes } = indexGraph(graph);
  if (nodes.size !== graph.nodes.length) errors.push('Two boxes share the same ID.');
  for (const n of graph.nodes) {
    if (n.type === 'question') {
      if (!questionsByCode.has(n.code)) errors.push(`A question box refers to a question that no longer exists (${n.code}).`);
    } else if (n.type === 'outcome') {
      if (!(n.kind in OUTCOME_KINDS)) errors.push('An outcome box has no type.');
      else if (n.kind === 'status' && !(n.value in STATUS_OPTIONS)) errors.push('Choose a result in each "Medical-necessity result" box.');
      else if (n.kind === 'level' && !(n.value in LEVEL_OPTIONS)) errors.push('Choose a level in each "Level of service" box.');
      else if ((n.kind === 'alert' || n.kind === 'document') && !String(n.text || '').trim()) errors.push(`Write the message in each "${OUTCOME_KINDS[n.kind]}" box.`);
    } else {
      errors.push('Unknown box type.');
    }
  }
  for (const e of graph.edges) {
    const from = nodes.get(e.from);
    const to = nodes.get(e.to);
    if (!from || !to) { errors.push('A line is connected to a box that was removed.'); continue; }
    if (from.type !== 'question') errors.push('Lines must start from a question’s answer.');
    if (e.from === e.to) errors.push('A question can’t be connected to itself.');
    const ports = portsFor(from, questionsByCode.get(from.code)).map((p) => p.key);
    if (from.type === 'question' && !ports.includes(e.port)) errors.push(`A line starts from an answer that "${questionsByCode.get(from.code)?.text || from.code}" no longer has.`);
  }
  if (hasCycle(graph)) errors.push('The lines form a loop. A question can’t depend on its own answer.');
  return [...new Set(errors)];
}

// Works out which boxes and lines are on for these answers.
export function runFlow(flow, answers = {}) {
  const graph = flow.graph || flow;
  const { nodes, incoming } = indexGraph(graph);
  const memo = new Map();
  const edgeOn = new Set();
  const nodeOn = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    const node = nodes.get(id);
    if (!node || seen.has(id)) return false; // missing box or a loop
    seen.add(id);
    const inc = incoming.get(id) || [];
    let on;
    if (!inc.length) {
      on = node.type === 'question'; // an outcome needs at least one line
    } else {
      const states = inc.map((e) => {
        const src = nodes.get(e.from);
        const ok = Boolean(src && src.type === 'question' && nodeOn(e.from, seen) && matchPort(e.port, answers[src.code]));
        if (ok) edgeOn.add(e);
        return ok;
      });
      on = node.match === 'any' ? states.some(Boolean) : states.every(Boolean);
    }
    memo.set(id, on);
    return on;
  };
  for (const id of nodes.keys()) nodeOn(id);

  const gates = new Map(); // question code -> asked?
  const outcomes = [];
  for (const node of nodes.values()) {
    const gated = (incoming.get(node.id) || []).length > 0;
    if (node.type === 'question' && gated) gates.set(node.code, (gates.get(node.code) || false) || memo.get(node.id));
    if (node.type === 'outcome' && memo.get(node.id)) outcomes.push(node);
  }
  return { nodeOn: memo, edgeOn, gates, outcomes };
}

// Runs every flow that applies to this call. A question placed under a line
// in any flow is hidden until some flow switches it on.
export function runFlows(flows, { answers = {}, callType, payer } = {}) {
  const gates = new Map();
  const outcomes = [];
  for (const flow of flows || []) {
    if (!flowApplies(flow, { callType, payer })) continue;
    const r = runFlow(flow, answers);
    for (const [code, on] of r.gates) gates.set(code, (gates.get(code) || false) || on);
    for (const node of r.outcomes) outcomes.push({ flow: { id: flow.id, name: flow.name }, node });
  }
  const hidden = new Set([...gates].filter(([, on]) => !on).map(([code]) => code));
  return { hidden, outcomes };
}

// Logic Builder flows: the shared rules (public/js/flow-logic.js) and how the
// engine applies them to a call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, runFlows, validateGraph, hasCycle, matchPort, portsFor } from '../public/js/flow-logic.js';
import { evaluateCall } from '../server/engine/evaluate.js';
import { SEED_QUESTIONS } from '../server/seed-questions.js';

const BANK = SEED_QUESTIONS.map((q, i) => ({ active: true, required: false, priority: 3, sort_order: i, ...q }));
const byCode = new Map(BANK.map((q) => [q.code, q]));

// Three bed-confinement answers (ALL) -> meets; "other means" yes -> not met + alert.
const bedFlow = {
  id: 1, name: 'Bed confinement', active: true, call_types: [], payers: [],
  graph: {
    nodes: [
      { id: 'n1', type: 'question', code: 'BED_GET_UP' },
      { id: 'n2', type: 'question', code: 'BED_AMBULATE' },
      { id: 'n3', type: 'question', code: 'BED_SIT' },
      { id: 'n4', type: 'outcome', kind: 'status', value: 'meets', text: 'Bed-confined.' },
      { id: 'n5', type: 'outcome', kind: 'alert', value: 'info', text: 'Check oxygen.', match: 'any' },
      { id: 'n6', type: 'outcome', kind: 'level', value: 'als' },
    ],
    edges: [
      { from: 'n1', port: 'yes', to: 'n4' }, { from: 'n2', port: 'yes', to: 'n4' }, { from: 'n3', port: 'yes', to: 'n4' },
      { from: 'n1', port: 'no', to: 'n5' }, { from: 'n2', port: 'no', to: 'n5' },
    ],
  },
};

test('ALL needs every incoming line; ANY needs one', () => {
  const some = runFlow(bedFlow, { BED_GET_UP: 'yes', BED_AMBULATE: 'yes' });
  assert.deepEqual(some.outcomes.map((n) => n.id), [], 'two of three is not enough');
  const all = runFlow(bedFlow, { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes' });
  assert.deepEqual(all.outcomes.map((n) => n.id), ['n4']);
  assert.equal(all.edgeOn.size, 3);
  assert.deepEqual(runFlow(bedFlow, { BED_AMBULATE: 'no' }).outcomes.map((n) => n.id), ['n5']);
  assert.ok(!runFlow(bedFlow, {}).nodeOn.get('n6'), 'an outcome with no lines never fires');
});

test('number ranges and any-answer ports', () => {
  assert.equal(matchPort('>=:300', '320'), true);
  assert.equal(matchPort('>=:300', '120'), false);
  assert.equal(matchPort('<:300', 'abc'), false);
  assert.equal(matchPort('*', 'anything'), true);
  assert.equal(matchPort('*', ''), false);
  assert.equal(matchPort('yes', 'YES'), true);
  assert.deepEqual(portsFor({ conditions: [{ op: '>=', value: 300 }] }, { answer_type: 'number' }).map((p) => p.key), ['*', '>=:300']);
});

test('a question with lines coming in is only asked when they match', () => {
  const gate = {
    id: 2, name: 'Oxygen follow-up', active: true,
    graph: {
      nodes: [{ id: 'a', type: 'question', code: 'BED_GET_UP' }, { id: 'b', type: 'question', code: 'CLN_OXYGEN' }],
      edges: [{ from: 'a', port: 'no', to: 'b' }],
    },
  };
  const hidden = evaluateCall({ callType: 'non_emergency', questions: BANK, answers: {}, flows: [gate] });
  assert.ok(!hidden.visibleCodes.includes('CLN_OXYGEN'));
  const shown = evaluateCall({ callType: 'non_emergency', questions: BANK, answers: { BED_GET_UP: 'no' }, flows: [gate] });
  assert.ok(shown.visibleCodes.includes('CLN_OXYGEN'));
  assert.ok(evaluateCall({ callType: 'non_emergency', questions: BANK, answers: {}, flows: [] }).visibleCodes.includes('CLN_OXYGEN'), 'no flows, no change');
});

test('fired outcomes change the assessment; the most cautious result wins', () => {
  const answers = { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes' };
  const { assessment } = evaluateCall({ callType: 'non_emergency', questions: BANK, answers, flows: [bedFlow] });
  assert.equal(assessment.status, 'meets');
  assert.match(assessment.summary, /Bed-confined\. \(rule: Bed confinement\)/);
  assert.equal(assessment.rules.length, 1);

  const caution = { id: 3, name: 'Caution', active: true, graph: { nodes: [{ id: 'q', type: 'question', code: 'BED_SIT' }, { id: 'o', type: 'outcome', kind: 'status', value: 'review' }, { id: 'l', type: 'outcome', kind: 'level', value: 'sct' }, { id: 'd', type: 'outcome', kind: 'document', text: 'Get the nursing note.' }], edges: [{ from: 'q', port: 'yes', to: 'o' }, { from: 'q', port: 'yes', to: 'l' }, { from: 'q', port: 'yes', to: 'd' }] } };
  const both = evaluateCall({ callType: 'non_emergency', questions: BANK, answers, flows: [bedFlow, caution] }).assessment;
  assert.equal(both.status, 'review');
  assert.match(both.levelOfService.label, /Specialty Care/);
  assert.ok(both.documentation.includes('Get the nursing note.'));

  const alert = evaluateCall({ callType: 'non_emergency', questions: BANK, answers: { BED_GET_UP: 'no' }, flows: [bedFlow] }).assessment;
  assert.ok(alert.alerts.some((a) => a.text === 'Check oxygen.' && a.level === 'info'));
});

test('flows can be limited to call types and payers, and switched off', () => {
  const answers = { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes' };
  const scoped = { ...bedFlow, call_types: ['repetitive'], payers: ['medicaid'] };
  const medicaid = { code: 'medicaid', kind: 'payer', requires_medical_necessity: true };
  const broker = { code: 'mtm', kind: 'broker', parent_code: 'medicaid', requires_medical_necessity: true };
  assert.equal(runFlows([scoped], { answers, callType: 'non_emergency', payer: medicaid }).outcomes.length, 0);
  assert.equal(runFlows([scoped], { answers, callType: 'repetitive', payer: medicaid }).outcomes.length, 1);
  assert.equal(runFlows([scoped], { answers, callType: 'repetitive', payer: broker }).outcomes.length, 1, 'brokers booking for the payer count');
  assert.equal(runFlows([{ ...bedFlow, active: false }], { answers, callType: 'repetitive' }).outcomes.length, 0);
});

test('payers with no necessity review keep "not required"', () => {
  const privatePay = { code: 'private_pay', kind: 'payer', requires_medical_necessity: false };
  const { assessment } = evaluateCall({ callType: 'non_emergency', questions: BANK, payer: privatePay, answers: { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes' }, flows: [bedFlow] });
  assert.equal(assessment.status, 'not_required');
});

test('validation catches loops, missing questions and empty outcomes', () => {
  assert.deepEqual(validateGraph(bedFlow.graph, byCode), []);
  const loop = { nodes: [{ id: 'a', type: 'question', code: 'BED_SIT' }, { id: 'b', type: 'question', code: 'BED_GET_UP' }], edges: [{ from: 'a', port: 'yes', to: 'b' }, { from: 'b', port: 'yes', to: 'a' }] };
  assert.ok(hasCycle(loop));
  assert.ok(validateGraph(loop, byCode).some((e) => /loop/.test(e)));
  const bad = { nodes: [{ id: 'a', type: 'question', code: 'NOPE' }, { id: 'b', type: 'outcome', kind: 'status', value: '' }, { id: 'c', type: 'outcome', kind: 'alert', text: ' ' }], edges: [{ from: 'b', port: 'yes', to: 'c' }] };
  const errors = validateGraph(bad, byCode);
  assert.ok(errors.some((e) => /no longer exists/.test(e)));
  assert.ok(errors.some((e) => /Choose a result/.test(e)));
  assert.ok(errors.some((e) => /Write the message/.test(e)));
  assert.ok(errors.some((e) => /start from a question/.test(e)));
  const wrongPort = { nodes: [{ id: 'a', type: 'question', code: 'BED_SIT' }, { id: 'b', type: 'outcome', kind: 'level', value: 'bls' }], edges: [{ from: 'a', port: 'maybe', to: 'b' }] };
  assert.ok(validateGraph(wrongPort, byCode).some((e) => /no longer has/.test(e)));
});

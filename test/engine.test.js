import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_QUESTIONS } from '../server/seed-questions.js';
import { evaluateCall } from '../server/engine/evaluate.js';
import { detectAnswers } from '../server/engine/detect.js';
import { SEED_PAYERS } from '../server/seed-payers.js';

const questions = SEED_QUESTIONS.map((q, i) => ({ call_types: [], payers: [], triggers: [], detect_yes: [], detect_no: [], options: [], active: true, ...q, sort_order: i }));
const PAYERS = Object.fromEntries(SEED_PAYERS.map((p) => [p.code, p]));
const run = (opts) => evaluateCall({ questions, callType: 'non_emergency', payer: PAYERS.medicare, ...opts });

test('detects facts, negation and corrections from a transcript', () => {
  const s = detectAnswers(
    'Patient is bedbound with contractures. No chest pain. He can\'t sit in a wheelchair. Not on oxygen.',
    questions,
  );
  assert.equal(s.BED_GET_UP.answer, 'yes');
  assert.equal(s.CLN_CONTRACTURES.answer, 'yes');
  assert.equal(s.EMG_SCREEN.answer, 'no');
  assert.equal(s.BED_SIT.answer, 'yes', '"can\'t sit in a wheelchair" must not read as "sits in a wheelchair"');
  assert.equal(s.CLN_OXYGEN.answer, 'no');
});

test('respects word boundaries', () => {
  const s = detectAnswers('She is non-ambulatory and vitals are unstable', questions);
  assert.equal(s.BED_AMBULATE.answer, 'yes', '"non-ambulatory" must not match the "ambulatory" no-phrase');
  assert.equal(s.EMG_SCREEN, undefined, '"unstable" must not match "stable"');
});

test('later statements win over earlier ones', () => {
  const s = detectAnswers('He can walk. Actually, sorry, he cannot walk at all since the stroke.', questions);
  assert.equal(s.BED_AMBULATE.answer, 'yes');
});

test('all three bed-confinement criteria are required', () => {
  const partial = run({ answers: { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'no' } });
  assert.equal(partial.assessment.bedConfinement.met, false);
  const full = run({ answers: { BED_GET_UP: 'yes', BED_AMBULATE: 'yes', BED_SIT: 'yes' } });
  assert.equal(full.assessment.bedConfinement.met, true);
  assert.equal(full.assessment.status, 'likely'); // required items still open
  assert.equal(full.assessment.levelOfService.hcpcs, 'A0428');
});

test('a fully documented qualifying call meets necessity', () => {
  const r = run({
    answers: {
      EMG_SCREEN: 'no', TX_REASON: 'Hip fracture', TX_DEST_TYPE: 'Hospital — outpatient / diagnostic', TX_OTHER_MEANS: 'no',
      CLN_FRACTURE: 'yes', DOC_PCS: 'yes',
    },
  });
  assert.equal(r.assessment.status, 'meets');
  assert.deepEqual(r.assessment.missing, []);
});

test('ALS and SCT indicators raise the level of service', () => {
  assert.equal(run({ answers: { CLN_CARDIAC: 'yes' } }).assessment.levelOfService.hcpcs, 'A0426');
  assert.equal(run({ callType: 'emergency', answers: { CLN_CARDIAC: 'yes' } }).assessment.levelOfService.hcpcs, 'A0427');
  assert.equal(run({ answers: { CLN_CARDIAC: 'yes', CLN_VENT: 'yes' } }).assessment.levelOfService.hcpcs, 'A0434');
});

test('disqualifiers produce not_met, or review when conditions conflict', () => {
  assert.equal(run({ answers: { TX_OTHER_MEANS: 'yes' } }).assessment.status, 'not_met');
  assert.equal(run({ answers: { TX_OTHER_MEANS: 'yes', CLN_OXYGEN: 'yes' } }).assessment.status, 'review');
});

test('not_met when no criteria qualify', () => {
  const answers = Object.fromEntries(questions
    .filter((q) => ['bed_confined', 'condition', 'als', 'sct'].includes(q.criterion))
    .map((q) => [q.code, 'no']));
  assert.equal(run({ answers }).assessment.status, 'not_met');
});

test('emergency screen raises a critical alert', () => {
  const r = run({ answers: { EMG_SCREEN: 'yes' } });
  assert.equal(r.assessment.emergencyFlag, true);
  assert.equal(r.assessment.alerts[0].level, 'critical');
});

test('triggered questions appear only when their keywords are heard', () => {
  assert.ok(!run({}).visibleCodes.includes('CLN_DRIPS'));
  const r = run({ transcript: 'She is on a heparin drip' });
  assert.ok(r.visibleCodes.includes('CLN_DRIPS'));
  assert.ok(r.triggeredCodes.includes('CLN_DRIPS'));
});

test('follow-up questions depend on the parent answer', () => {
  assert.ok(!run({}).visibleCodes.includes('DOC_CERTIFIER'));
  assert.ok(run({ answers: { DOC_PCS: 'yes' } }).visibleCodes.includes('DOC_CERTIFIER'));
});

test('call-type filtering and PCS documentation rules', () => {
  const emergency = run({ callType: 'emergency' });
  assert.ok(!emergency.visibleCodes.includes('DOC_PCS'));
  const repetitive = run({ callType: 'repetitive' });
  assert.ok(repetitive.visibleCodes.includes('DOC_PRIOR_AUTH'), 'Medicare: prior auth for repetitive varies by MAC');
  assert.ok(!run({}).visibleCodes.includes('DOC_PRIOR_AUTH'), 'Medicare: no prior auth for one-time non-emergency');
  assert.ok(repetitive.assessment.documentation.some((d) => d.includes('60 days')));
});

test('next question prioritizes critical required items and skips detected ones', () => {
  const r = run({ transcript: 'No chest pain or trouble breathing.' });
  assert.ok(r.suggestions.EMG_SCREEN);
  assert.notEqual(r.nextQuestion, 'EMG_SCREEN');
  assert.equal(questions.find((q) => q.code === r.nextQuestion).priority, 1);
});

// ------------------------------------------------------------ payer rules
const FULL = { EMG_SCREEN: 'no', TX_REASON: 'Hip fracture', TX_DEST_TYPE: 'Hospital — outpatient / diagnostic', TX_OTHER_MEANS: 'no', CLN_FRACTURE: 'yes' };

test('no payer selected is a missing item', () => {
  const r = run({ payer: null, answers: FULL });
  assert.equal(r.assessment.missing[0].code, 'PAYER');
  assert.equal(r.assessment.status, 'likely');
  assert.equal(r.assessment.payer, null);
});

test('payer-scoped questions only appear for their payer', () => {
  const ma = run({ payer: PAYERS.medicare_advantage }).visibleCodes;
  const mcd = run({ payer: PAYERS.medicaid }).visibleCodes;
  assert.ok(ma.includes('MA_PLAN') && !ma.includes('MCD_ELIGIBILITY'));
  assert.ok(mcd.includes('MCD_ELIGIBILITY') && mcd.includes('MCD_CERT') && !mcd.includes('MA_PLAN'));
  assert.ok(!mcd.includes('DOC_PCS'), 'Medicaid uses the state certification question instead of the Medicare PCS');
});

test('Medicare Advantage: prior auth asked for non-emergency, never for emergency', () => {
  const nonEm = run({ payer: PAYERS.medicare_advantage });
  assert.ok(nonEm.visibleCodes.includes('DOC_PRIOR_AUTH'));
  assert.equal(nonEm.assessment.payer.priorAuth, 'varies');
  const em = run({ payer: PAYERS.medicare_advantage, callType: 'emergency' });
  assert.ok(!em.visibleCodes.includes('DOC_PRIOR_AUTH'));
  assert.ok(em.assessment.documentation.some((d) => d.includes('not required for emergency')));
});

test('Medicare Advantage: a pending authorization blocks "meets"', () => {
  const base = { ...FULL, MA_PLAN: 'Acme Advantage PPO', MA_NETWORK: 'yes', DOC_PCS: 'yes' };
  const pending = run({ payer: PAYERS.medicare_advantage, answers: { ...base, DOC_PRIOR_AUTH: 'Pending' } });
  assert.equal(pending.assessment.status, 'likely');
  assert.ok(pending.assessment.documentationGaps.length > 0);
  const approved = run({ payer: PAYERS.medicare_advantage, answers: { ...base, DOC_PRIOR_AUTH: 'Approved', DOC_AUTH_NUMBER: 'A-123' } });
  assert.equal(approved.assessment.status, 'meets');
  const waived = run({ payer: PAYERS.medicare_advantage, answers: { ...base, DOC_PRIOR_AUTH: 'Not required — confirmed with payer' } });
  assert.equal(waived.assessment.status, 'meets');
});

test('a "required" prior-auth policy makes the question required', () => {
  const strict = { ...PAYERS.medicaid, prior_auth: { ...PAYERS.medicaid.prior_auth, non_emergency: 'required' } };
  const r = run({ payer: strict, answers: { ...FULL, MCD_ELIGIBILITY: 'yes', MCD_CERT: 'yes' } });
  assert.ok(r.assessment.missing.some((m) => m.code === 'DOC_PRIOR_AUTH'));
  assert.ok(r.assessment.documentation.some((d) => d.startsWith('Prior authorization is required')));
  const done = run({ payer: strict, answers: { ...FULL, MCD_ELIGIBILITY: 'yes', MCD_CERT: 'yes', DOC_PRIOR_AUTH: 'Approved' } });
  assert.equal(done.assessment.status, 'meets');
});

test('denied authorization raises a critical alert', () => {
  const r = run({ payer: PAYERS.medicare_advantage, answers: { DOC_PRIOR_AUTH: 'Denied' } });
  assert.ok(r.assessment.alerts.some((a) => a.level === 'critical' && a.code === 'DOC_PRIOR_AUTH'));
});

test('Medicaid: unverified eligibility is a gap and dual eligibility is flagged', () => {
  const r = run({ payer: PAYERS.medicaid, answers: { ...FULL, MCD_ELIGIBILITY: 'no', MCD_CERT: 'yes', MCD_DUAL: 'yes' } });
  assert.equal(r.assessment.status, 'likely');
  assert.ok(r.assessment.alerts.some((a) => a.code === 'MCD_DUAL'));
  assert.ok(r.assessment.documentation.some((d) => d.includes('payer of last resort')));
});

test('when ambulance is not indicated, the payer\'s alternate transport is offered', () => {
  const mcd = run({ payer: PAYERS.medicaid, answers: { TX_OTHER_MEANS: 'yes' } });
  assert.equal(mcd.assessment.status, 'not_met');
  assert.ok(mcd.assessment.alerts.some((a) => a.code === 'PAYER_ALTERNATE' && a.text.includes('NEMT')));
  const ma = run({ payer: PAYERS.medicare_advantage, answers: { TX_OTHER_MEANS: 'yes' } });
  assert.ok(ma.assessment.alerts.some((a) => a.code === 'PAYER_ALTERNATE' && a.text.includes('supplemental')));
});

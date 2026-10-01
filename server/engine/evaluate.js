// Medical-necessity evaluation against CMS ambulance coverage rules
// (42 CFR 410.40; Medicare Benefit Policy Manual, Ch. 10, §10.2).
//
// This is decision support for the call taker, not a coverage determination.

import { detectAnswers, detectTriggers } from './detect.js';

export const CALL_TYPES = {
  emergency: 'Emergency',
  non_emergency: 'Non-emergency (scheduled / unscheduled)',
  repetitive: 'Repetitive scheduled (e.g., dialysis)',
};

const SUPPORTING = new Set(['condition', 'als', 'sct']);

const LEVELS = {
  sct: { label: 'Specialty Care Transport (SCT)', hcpcs: 'A0434' },
  als_emergency: { label: 'ALS Level 1 — Emergency', hcpcs: 'A0427' },
  als: { label: 'ALS Level 1 — Non-emergency', hcpcs: 'A0426' },
  bls_emergency: { label: 'BLS — Emergency', hcpcs: 'A0429' },
  bls: { label: 'BLS — Non-emergency', hcpcs: 'A0428' },
  none: { label: 'Ambulance not indicated — consider wheelchair van or other transport', hcpcs: null },
  pending: { label: 'Pending — more information needed', hcpcs: null },
};

const isAnswered = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const sameAnswer = (a, b) => isAnswered(a) && isAnswered(b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

export function appliesToCallType(q, callType) {
  return !q.call_types || q.call_types.length === 0 || q.call_types.includes(callType);
}

export function evaluateCall({ callType = 'non_emergency', questions = [], answers = {}, transcript = '' }) {
  const active = questions.filter((q) => q.active !== false && appliesToCallType(q, callType));
  const triggered = detectTriggers(transcript, active);
  const suggestions = detectAnswers(transcript, active);

  // A question is shown when it has no triggers (core question), its trigger
  // words were heard, or it was already answered. Follow-ups also require
  // their parent question to have the specified answer.
  const visible = active.filter((q) => {
    if (q.depends_on_code && !sameAnswer(answers[q.depends_on_code], q.depends_on_answer)) return false;
    const hasTriggers = (q.triggers || []).length > 0;
    return !hasTriggers || triggered.has(q.code) || isAnswered(answers[q.code]) || Boolean(suggestions[q.code]);
  });

  // Drop suggestions that already match the confirmed answer.
  const openSuggestions = {};
  for (const q of visible) {
    const s = suggestions[q.code];
    if (s && !sameAnswer(answers[q.code], s.answer)) openSuggestions[q.code] = s;
  }

  const unanswered = visible.filter((q) => !isAnswered(answers[q.code]));
  const rank = (q) => (q.priority || 3) * 1000 + (triggered.has(q.code) ? -500 : 0) + (q.required ? -100 : 0) + (q.sort_order || 0);
  const queue = unanswered
    .filter((q) => !openSuggestions[q.code]) // detected items only need confirmation, not asking
    .sort((a, b) => rank(a) - rank(b));

  return {
    callType,
    visibleCodes: visible.map((q) => q.code),
    triggeredCodes: [...triggered],
    suggestions: openSuggestions,
    nextQuestion: queue[0]?.code || null,
    queue: queue.slice(0, 5).map((q) => q.code),
    assessment: assess({ callType, visible, answers }),
  };
}

function assess({ callType, visible, answers }) {
  const answered = (q) => isAnswered(answers[q.code]);
  const qualifies = (q) => q.qualifying_answer && sameAnswer(answers[q.code], q.qualifying_answer);
  const byCriterion = (c) => visible.filter((q) => q.criterion === c);

  // --- Alerts configured on individual questions
  const alerts = [];
  for (const q of visible) {
    if (q.alert_answer && q.alert_text && sameAnswer(answers[q.code], q.alert_answer)) {
      alerts.push({ level: q.alert_level || 'warning', text: q.alert_text, code: q.code });
    }
  }
  const emergencyFlag = byCriterion('emergency').some(qualifies);

  // --- CMS bed-confinement test: all three components must be met
  const bedQs = byCriterion('bed_confined');
  const bedConfinement = {
    met: bedQs.length > 0 && bedQs.every(qualifies),
    failed: bedQs.some((q) => answered(q) && !qualifies(q)),
    components: bedQs.map((q) => ({ code: q.code, text: q.text, answer: answers[q.code] ?? null, met: qualifies(q) })),
  };

  // --- Clinical conditions that support ambulance transport
  const supportQs = visible.filter((q) => SUPPORTING.has(q.criterion));
  const supporting = supportQs.filter(qualifies).map((q) => ({ code: q.code, text: q.text, criterion: q.criterion }));
  const supportOpen = supportQs.filter((q) => !answered(q));

  const disqualifiers = byCriterion('disqualifier').filter(qualifies).map((q) => ({ code: q.code, text: q.text }));

  const hasSupport = bedConfinement.met || supporting.length > 0 || (callType === 'emergency' && emergencyFlag);
  const supportExhausted = (bedQs.length === 0 || bedConfinement.failed) && supportOpen.length === 0;

  // --- Required questions still open
  const missing = visible.filter((q) => q.required && !answered(q)).map((q) => ({ code: q.code, text: q.text }));

  // --- Documentation requirements
  const documentation = [];
  if (callType === 'emergency') {
    documentation.push('Document the dispatch information and the patient\'s presenting symptoms at the time of the call.');
  } else {
    documentation.push('A Physician Certification Statement (PCS) or equivalent certification is required for non-emergency transport.');
    if (callType === 'repetitive') {
      documentation.push('Repetitive scheduled transport: the PCS must be dated no earlier than 60 days before the transport.');
      documentation.push('Confirm whether the payer requires prior authorization for repetitive scheduled non-emergent transport.');
    } else {
      documentation.push('Non-repetitive transport: the certification may be obtained up to 48 hours after the transport.');
    }
    documentation.push('Bed-confinement alone is not sufficient — document the specific condition that makes other transport unsafe.');
  }
  const docGaps = byCriterion('documentation').filter((q) => answered(q) && !qualifies(q)).map((q) => q.text);

  // --- Determine status
  let status;
  let summary;
  if (hasSupport && disqualifiers.length > 0) {
    status = 'review';
    summary = 'Conflicting information: the patient has qualifying conditions, but the caller indicated other transport may be possible. Clarify before dispatching.';
  } else if (hasSupport) {
    status = missing.length > 0 || docGaps.length > 0 ? 'likely' : 'meets';
    summary = status === 'meets'
      ? 'Documented information supports medical necessity for ambulance transport.'
      : 'Medical necessity is supported; complete the remaining required items and documentation.';
  } else if (disqualifiers.length > 0) {
    status = 'not_met';
    summary = 'The patient appears able to travel safely by other means. Ambulance transport is unlikely to meet CMS medical-necessity criteria.';
  } else if (supportExhausted) {
    status = 'not_met';
    summary = 'No qualifying condition has been identified and the patient does not meet the bed-confinement test.';
  } else {
    status = 'incomplete';
    summary = 'Not enough information yet. Continue with the prompted questions.';
  }

  // --- Level of service
  const has = (c) => supporting.some((s) => s.criterion === c);
  let level;
  if (status === 'not_met') level = LEVELS.none;
  else if (!hasSupport) level = LEVELS.pending;
  else if (has('sct')) level = LEVELS.sct;
  else if (has('als')) level = callType === 'emergency' ? LEVELS.als_emergency : LEVELS.als;
  else level = callType === 'emergency' ? LEVELS.bls_emergency : LEVELS.bls;

  const total = visible.length;
  const done = visible.filter(answered).length;

  return {
    status,
    summary,
    emergencyFlag,
    bedConfinement,
    supporting,
    disqualifiers,
    missing,
    alerts,
    documentation,
    documentationGaps: docGaps,
    levelOfService: level,
    progress: { answered: done, total, percent: total ? Math.round((done / total) * 100) : 0 },
  };
}

// Physician Certification Statement (PCS) for non-emergency ambulance
// transport, prefilled from a saved call. Medicare does not prescribe a form;
// the content follows 42 CFR 410.40 and the Medicare Benefit Policy Manual,
// Ch. 10. The certifying practitioner must review, complete, and sign it.

import { matchesAny, CALL_TYPES } from './engine/evaluate.js';

// Short checklist wording for built-in questions; custom questions use their text.
const CONDITION_LABELS = {
  CLN_OXYGEN: 'Requires oxygen that the patient cannot self-administer or manage',
  CLN_IV: 'IV fluids or medications that must be maintained during transport',
  CLN_DRIPS: 'Medication drips requiring titration / critical-care monitoring',
  CLN_CARDIAC: 'Requires cardiac monitoring',
  CLN_VENT: 'Intubated or ventilator-dependent',
  CLN_AIRWAY: 'Requires airway management or suctioning',
  CLN_LOC: 'Unconscious or altered level of consciousness requiring monitoring',
  CLN_BEHAVIOR: 'Danger to self or others; requires physical or chemical restraint',
  CLN_FRACTURE: 'Fracture or orthopedic device requiring stretcher positioning',
  CLN_CONTRACTURES: 'Contractures preventing safe seated positioning',
  CLN_WOUNDS: 'Pressure ulcers / wounds that prevent sitting',
  CLN_PAIN: 'Severe pain aggravated by sitting or movement',
  CLN_ISOLATION: 'Requires isolation precautions',
  CLN_BARIATRIC: 'Weight/size requires additional personnel or bariatric equipment',
  CLN_MONITORING: 'Requires monitoring by trained personnel (e.g., unstable vital signs)',
};

const BED_LABELS = {
  BED_GET_UP: 'Unable to get up from bed without assistance',
  BED_AMBULATE: 'Unable to ambulate',
  BED_SIT: 'Unable to sit in a chair or wheelchair',
};

const LEVEL_CHOICES = [
  { key: 'bls', label: 'Basic Life Support (BLS)', match: /^BLS/ },
  { key: 'als', label: 'Advanced Life Support (ALS)', match: /^ALS/ },
  { key: 'sct', label: 'Specialty Care Transport (SCT)', match: /^Specialty/ },
];

export const CERTIFIER_TYPES = [
  'Physician (MD/DO)',
  'Physician assistant (PA)',
  'Nurse practitioner (NP)',
  'Clinical nurse specialist (CNS)',
  'Registered nurse (RN)',
  'Discharge planner',
];

const shortLabel = (q) => CONDITION_LABELS[q.code] || q.text.replace(/\?\s*$/, '');

export function buildPcs({ call, questions, payer, orgName }) {
  const a = call.answers || {};
  const d = call.details || {};
  const assessment = call.assessment || {};
  const answer = (code) => (a[code] === undefined ? null : a[code]);
  const qualifies = (q) => matchesAny(a[q.code], q.qualifying_answer);

  const bedQuestions = questions.filter((q) => q.criterion === 'bed_confined');
  const conditionQuestions = questions.filter((q) => ['condition', 'als', 'sct'].includes(q.criterion));

  const repetitive = call.call_type === 'repetitive' || String(answer('TX_REPETITIVE')).toLowerCase() === 'yes';
  const level = assessment.levelOfService?.label || '';

  const notices = [];
  if (call.call_type === 'emergency') notices.push('This call was recorded as an emergency transport. A PCS is generally not required for emergency transports.');
  if (payer && payer.requires_medical_necessity === false) notices.push(`${payer.name} does not require a medical-necessity certification.`);
  if (payer?.code === 'medicaid' || payer?.parent_code === 'medicaid') {
    notices.push('Your state Medicaid program may require its own certification form instead of, or in addition to, this PCS.');
  }
  if (assessment.status === 'not_met') {
    notices.push('The intake assessment did not identify a qualifying condition. The certifying practitioner must document why other means of transport are contraindicated.');
  }

  return {
    orgName: orgName || '',
    callId: call.id,
    callDate: call.created_at,
    callTaker: call.call_taker || '',
    status: assessment.status || 'incomplete',
    notices,
    patient: {
      name: d.patient_name || '',
      dob: d.patient_dob || '',
      memberId: d.member_id || '',
      weight: d.patient_weight || '',
    },
    payer: payer ? payer.name : '',
    transport: {
      type: CALL_TYPES[call.call_type] || call.call_type,
      repetitive,
      date: d.appointment || '',
      origin: d.pickup_location || '',
      destination: d.destination || '',
      destinationType: answer('TX_DEST_TYPE') || '',
      requestedBy: [d.caller_name, d.caller_facility].filter(Boolean).join(', '),
      callbackPhone: d.caller_phone || '',
    },
    diagnosis: answer('TX_REASON') || '',
    narrative: d.ai_summary || '',
    otherMeansContraindicated: answer('TX_OTHER_MEANS') === 'no' ? true : answer('TX_OTHER_MEANS') === 'yes' ? false : null,
    bedConfinement: bedQuestions.map((q) => ({ label: BED_LABELS[q.code] || shortLabel(q), checked: qualifies(q) })),
    conditions: conditionQuestions.map((q) => ({ label: shortLabel(q), checked: qualifies(q) })),
    levelOfService: LEVEL_CHOICES.map((l) => ({ label: l.label, checked: l.match.test(level) })),
    certifier: { name: answer('DOC_CERTIFIER') || '', types: CERTIFIER_TYPES },
    validity: repetitive
      ? 'Repetitive scheduled transport: this certification must be signed and dated no earlier than 60 days before the date of service.'
      : 'Non-repetitive transport: obtain this certification before transport when possible, and no later than 48 hours after transport.',
  };
}

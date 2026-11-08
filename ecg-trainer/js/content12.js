/*
 * CSHealthED ECG Trainer — Basic 12-Lead ECG course content.
 * General educational guidance; always follow local protocols, STEMI
 * destination policies and medical direction.
 */
(function (global) {
  'use strict';

  var COURSE = {
    id: 'twelve',
    title: 'Basic 12-Lead ECG',
    color: '#c2185b',
    tagline: 'Lead placement, the twelve views, axis, the ST segment, STEMI recognition and common mimics.'
  };

  var CASES = {
    normal: {
      name: 'Normal 12-Lead ECG', short: 'Normal', group: 'Normal',
      findings: ['Sinus rhythm, rate 60–100', 'Normal axis: QRS upright in I and aVF', 'aVR is negative (P, QRS and T all point away from it)', 'R wave grows from V1 to V5 (normal R-wave progression; transition around V3–V4)', 'ST segments on the baseline; T waves upright except aVR (and sometimes III, V1)'],
      tips: ['Learn the normal first — every abnormal tracing is a deviation from this pattern.', 'Check aVR: if P, QRS and T are not all negative in aVR, suspect lead reversal.'],
      care: ['A normal 12-lead does not rule out ACS — repeat the 12-lead every 10–15 minutes or with any change in symptoms.']
    },
    inferior: {
      name: 'Inferior STEMI', short: 'Inferior', group: 'STEMI', territory: 'inferior',
      findings: ['ST elevation in II, III and aVF (often III > II)', 'Reciprocal ST depression in aVL (and often I)', 'Hyperacute T waves in the inferior leads'],
      tips: ['ST elevation greater in III than II, with depression in I, suggests the right coronary artery.', 'Look for reciprocal depression in aVL — it is often the earliest and most reliable clue.'],
      care: ['Obtain right-sided leads (V4R): ST elevation ≥ 1 mm suggests right ventricular involvement.', 'With RV involvement or hypotension, use nitrates with great caution or not at all; patients are preload dependent — consider fluid boluses per protocol.', 'Watch for bradycardia and AV blocks (the RCA supplies the SA and AV nodes in most people).', 'Activate the STEMI system, transmit the ECG and transport to a PCI-capable centre per protocol.']
    },
    anterior: {
      name: 'Anterior (Anteroseptal) STEMI', short: 'Anterior', group: 'STEMI', territory: 'anterior',
      findings: ['ST elevation in V1–V4 (septal + anterior leads)', 'Hyperacute, broad T waves in the precordial leads', 'May have reciprocal ST depression in the inferior leads', 'Loss of the small septal r wave in V1–V2'],
      tips: ['Anterior STEMI usually means the left anterior descending (LAD) artery — a large amount of myocardium is at risk.', 'Elevation extending to V5–V6, I and aVL = extensive anterior (anterolateral) MI.'],
      care: ['High risk for cardiogenic shock, VF and heart failure — pads on, monitor closely.', 'Early STEMI activation and ECG transmission; aspirin and other therapy per protocol.']
    },
    lateral: {
      name: 'Lateral STEMI', short: 'Lateral', group: 'STEMI', territory: 'lateral',
      findings: ['ST elevation in I, aVL, V5 and V6', 'Reciprocal ST depression in III and aVF', 'Changes can be subtle — aVL elevation may be only 1 mm'],
      tips: ['High lateral (I, aVL) elevation is easy to miss; the reciprocal depression in III/aVF often draws attention first.', 'Usually the circumflex artery or a diagonal branch of the LAD.'],
      care: ['Treat as STEMI: activate early, transmit, transport per protocol.']
    },
    posterior: {
      name: 'Posterior MI', short: 'Posterior', group: 'STEMI', territory: 'posterior',
      findings: ['Horizontal ST depression in V1–V3 (the posterior wall is seen “in a mirror”)', 'Tall, broad R waves in V1–V2 with upright T waves', 'Often accompanies inferior or lateral STEMI'],
      tips: ['ST depression in V1–V3 is posterior STEMI until proven otherwise — not simply “ischaemia”.', 'Flip the tracing over and look at V1–V3 from behind: depression becomes elevation, tall R becomes a Q wave.'],
      care: ['Obtain posterior leads V7–V9 (left back at the 5th intercostal space): ST elevation ≥ 0.5 mm confirms posterior STEMI.', 'Activate the STEMI system per protocol.']
    },
    rbbb: {
      name: 'Right Bundle Branch Block', short: 'RBBB', group: 'Conduction',
      findings: ['QRS ≥ 0.12 s', 'rSR′ (“M” or rabbit ears) in V1–V2', 'Wide, slurred S wave in I and V6', 'T wave inversion in V1–V3 is expected (secondary change)'],
      tips: ['Use the “turn signal” trick: the terminal deflection in V1 points up for a right bundle block.', 'A new RBBB with chest pain can indicate a large anterior MI — compare with old ECGs.'],
      care: ['RBBB does not hide STEMI: ST elevation can still be interpreted.', 'RBBB plus left anterior fascicular block (left axis deviation) = bifascicular block — watch for high-grade AV block.']
    },
    lbbb: {
      name: 'Left Bundle Branch Block', short: 'LBBB', group: 'Conduction',
      findings: ['QRS ≥ 0.12 s', 'Broad, notched or slurred R waves in I, aVL, V5–V6 with no septal q waves', 'Deep, broad QS or rS complexes in V1–V3', 'Discordant ST-T changes: ST elevation in V1–V3, depression and T inversion in I, aVL, V5–V6'],
      tips: ['The turn-signal trick: the terminal deflection in V1 points down for a left bundle block.', 'LBBB makes standard STEMI criteria unreliable — discordant ST elevation is expected.'],
      care: ['Do not delay care because of LBBB. With symptoms of ACS, follow your protocol (Sgarbossa criteria, comparison with prior ECGs, medical direction consultation).', 'Concordant ST elevation (same direction as the QRS) ≥ 1 mm is highly specific for acute MI.']
    },
    lvh: {
      name: 'Left Ventricular Hypertrophy', short: 'LVH', group: 'Other',
      findings: ['Very large QRS voltages: S in V1 + R in V5 or V6 > 35 mm (Sokolow–Lyon)', 'Possible strain pattern: asymmetric ST depression and T inversion in I, aVL, V5–V6', 'ST elevation in V1–V3 may be present (STEMI mimic)'],
      tips: ['Large voltage alone is common in young, thin patients — voltage criteria are less reliable under age 35.', 'LVH strain mimics lateral ischaemia; LVH ST elevation in V1–V3 mimics anterior STEMI.'],
      care: ['Common with long-standing hypertension and aortic stenosis.', 'When in doubt with chest pain, transmit and consult medical direction.']
    },
    pericarditis: {
      name: 'Acute Pericarditis', short: 'Pericarditis', group: 'Other',
      findings: ['Widespread concave (“saddle-shaped”) ST elevation not confined to one territory', 'PR depression in multiple leads; PR elevation and ST depression in aVR', 'No reciprocal ST depression (except aVR and sometimes V1)', 'Sinus tachycardia is common'],
      tips: ['STEMI follows coronary territories and has reciprocal changes; pericarditis is diffuse and has none.', 'Pleuritic, positional chest pain (better sitting forward) and a recent viral illness support pericarditis.'],
      care: ['When it is uncertain whether it is STEMI or pericarditis, treat the patient as a possible STEMI and consult medical direction.', 'Watch for pericardial effusion and tamponade (hypotension, JVD, muffled heart sounds).']
    },
    hyperk: {
      name: 'Hyperkalaemia', short: 'Hyper-K', group: 'Other',
      findings: ['Tall, narrow, peaked (“tented”) T waves', 'Flattened or absent P waves, prolonged PR', 'QRS widening as potassium rises — progressing to a sine-wave pattern, VF or asystole'],
      tips: ['Think hyperkalaemia in renal failure / dialysis patients, crush injury, DKA and certain medications.', 'Peaked T waves have a narrow base — hyperacute STEMI T waves are broad-based.'],
      care: ['Treatment per protocol may include calcium, sodium bicarbonate and nebulised salbutamol/albuterol.', 'Monitor closely for bradycardia and wide-complex rhythms.']
    }
  };

  var CASE_ORDER = ['normal', 'inferior', 'anterior', 'lateral', 'posterior', 'rbbb', 'lbbb', 'lvh', 'pericarditis', 'hyperk'];

  var AXES = [
    { id: 'normal', name: 'Normal axis', range: '−30° to +90°', angles: [5, 30, 55, 75] },
    { id: 'lad', name: 'Left axis deviation', range: '−30° to −90°', angles: [-45, -55, -65] },
    { id: 'rad', name: 'Right axis deviation', range: '+90° to +180°', angles: [110, 130, 150] },
    { id: 'extreme', name: 'Extreme axis deviation', range: '−90° to ±180°', angles: [-120, -140, -160] }
  ];

  global.ECG12Content = { COURSE: COURSE, CASES: CASES, CASE_ORDER: CASE_ORDER, AXES: AXES };
})(window);

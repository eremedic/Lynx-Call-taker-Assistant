/*
 * CSHealthED Pharmacology Trainer — practice scenarios.
 * Step types: mc (multiple choice), num (calculation), draw (syringe draw-up).
 * Content reflects common EMS practice; learners follow local protocols.
 */
(function (global) {
  'use strict';

  var SCENARIOS = [
    {
      id: 'chest-pain', title: 'Crushing chest pain', cat: 'acs', level: 'Core',
      setting: 'You respond to a 62-year-old man with 30 minutes of substernal chest pressure radiating to his left arm. He is pale and diaphoretic. No allergies. Your 12-lead shows ST elevation in V1–V4.',
      vitals: { BP: '148/90', HR: '88', RR: '20', SpO2: '95%', Weight: '198 lb', BGL: '134' },
      steps: [
        { type: 'mc', q: 'He has no bleeding history and no aspirin allergy. Which medication should be given first?', options: ['Aspirin 324 mg chewed', 'Morphine 4 mg IV', 'Fentanyl 50 mcg IV', 'Ondansetron 4 mg IV'], answer: 0, explain: 'Aspirin reduces mortality in ACS and should be given as early as possible (chewed, non–enteric coated).' },
        { type: 'num', q: 'You carry 81 mg chewable tablets. How many tablets make a 324 mg dose?', answer: 4, unit: 'tablets', tol: 0, explain: '324 mg ÷ 81 mg per tablet = <b>4 tablets</b>.' },
        { type: 'mc', q: 'Before nitroglycerin, he tells you he took tadalafil (Cialis) about 30 hours ago. What do you do?', options: ['Give nitroglycerin 0.4 mg SL', 'Withhold nitroglycerin — tadalafil was taken within 48 hours', 'Give half a dose (0.2 mg)', 'Give nitroglycerin only if pain is above 7/10'], answer: 1, explain: 'PDE-5 inhibitors with nitrates can cause profound hypotension. Avoid nitrates within 24 h of sildenafil/vardenafil and 48 h of tadalafil.' },
        { type: 'num', q: 'For persistent pain your protocol allows fentanyl 1 mcg/kg (maximum 100 mcg). He weighs 198 lb. What dose do you give?', answer: 90, unit: 'mcg', tol: 1, explain: '198 lb ÷ 2.2 = 90 kg. 1 mcg/kg × 90 kg = <b>90 mcg</b> (under the 100 mcg maximum).' },
        { type: 'draw', drug: 'fentanyl', dose: 90, unit: 'mcg', q: 'Draw up fentanyl 90 mcg from the vial shown.' }
      ]
    },
    {
      id: 'anaphylaxis', title: 'Anaphylaxis at a picnic', cat: 'allergy', level: 'Core',
      setting: 'A 24-year-old woman with a peanut allergy ate a cookie 10 minutes ago. She has hives, lip swelling, audible wheezing and feels faint.',
      vitals: { BP: '84/50', HR: '128', RR: '28', SpO2: '91%', Weight: '62 kg' },
      steps: [
        { type: 'mc', q: 'What is the first-line medication?', options: ['Diphenhydramine 50 mg IV', 'Epinephrine 0.5 mg IM', 'Methylprednisolone 125 mg IV', 'Albuterol 2.5 mg nebulized'], answer: 1, explain: 'Epinephrine IM is the only first-line drug for anaphylaxis. Antihistamines, steroids and albuterol are adjuncts.' },
        { type: 'mc', q: 'Which concentration and route are correct for this dose?', options: ['0.1 mg/mL, 5 mL IV push', '1 mg/mL, 0.5 mL IM in the anterolateral thigh', '1 mg/mL, 0.5 mL IV push', '0.1 mg/mL, 0.5 mL IM in the deltoid'], answer: 1, explain: 'Use 1 mg/mL IM into the anterolateral thigh. Giving 1 mg/mL IV push can cause lethal dysrhythmias.' },
        { type: 'draw', drug: 'epi-im', dose: 0.5, unit: 'mg', q: 'Draw up epinephrine 0.5 mg from the ampule shown.' },
        { type: 'num', q: 'As an adjunct you give diphenhydramine 50 mg IV. The vial is 50 mg/mL. How many mL?', answer: 1, unit: 'mL', tol: 0.01, explain: '50 mg ÷ 50 mg/mL = <b>1 mL</b>.' },
        { type: 'mc', q: 'Five minutes later she is still wheezing with a BP of 86/52. What next?', options: ['Wait for the steroid to work', 'Repeat epinephrine IM and give an IV fluid bolus', 'Give a second dose of diphenhydramine', 'Begin norepinephrine without fluids'], answer: 1, explain: 'Epinephrine may be repeated every 5–15 minutes. Hypotension in anaphylaxis is largely distributive — give crystalloid boluses.' }
      ]
    },
    {
      id: 'overdose', title: 'Unresponsive in a restroom', cat: 'tox', level: 'Core',
      setting: 'A 30-year-old man is found unresponsive with a syringe nearby. Pupils are pinpoint, respirations are slow and shallow.',
      vitals: { BP: '108/70', HR: '62', RR: '4', SpO2: '78%' },
      steps: [
        { type: 'mc', q: 'What is your first priority?', options: ['Give naloxone 2 mg IV immediately', 'Open the airway and ventilate with a BVM and oxygen', 'Obtain a blood glucose', 'Start an IV'], answer: 1, explain: 'Hypoxia kills. Ventilate first; naloxone follows once oxygenation is supported.' },
        { type: 'draw', drug: 'naloxone', dose: 0.2, unit: 'mg', q: 'You choose to titrate small IV doses. Draw up naloxone 0.2 mg from the vial shown.' },
        { type: 'mc', q: 'What is the goal of naloxone in this patient?', options: ['Full alertness and orientation', 'Adequate spontaneous breathing', 'Pupils returning to normal size', 'Heart rate above 100'], answer: 1, explain: 'Titrate to adequate respirations. Large doses that fully reverse the patient can cause violent withdrawal and vomiting.' },
        { type: 'mc', q: 'He wakes and wants to refuse transport. What risk should you explain?', options: ['Naloxone causes long-term liver damage', 'Re-sedation: naloxone can wear off (30–90 min) before the opioid does', 'He will be allergic to opioids in the future', 'There is no further risk once he is awake'], answer: 1, explain: 'Many opioids (especially long-acting or high-potency) outlast naloxone, so breathing can stop again after you leave.' }
      ]
    },
    {
      id: 'hypoglycemia', title: 'Confused diabetic', cat: 'endo', level: 'Core',
      setting: 'A 58-year-old woman with insulin-dependent diabetes is confused and diaphoretic. She cannot follow commands. You have an 18 g IV.',
      vitals: { BP: '132/80', HR: '104', RR: '18', SpO2: '97%', BGL: '38 mg/dL' },
      steps: [
        { type: 'mc', q: 'Is oral glucose appropriate?', options: ['Yes — 15 g between the cheek and gum', 'No — she cannot protect her airway; give IV dextrose', 'Yes — but only half a tube', 'No — give insulin instead'], answer: 1, explain: 'Oral glucose requires a patient who is awake enough to swallow and protect the airway.' },
        { type: 'num', q: 'Your protocol calls for 25 g of dextrose using D10 (0.1 g/mL). How many mL is that?', answer: 250, unit: 'mL', tol: 1, explain: '25 g ÷ 0.1 g/mL = <b>250 mL</b> of D10.' },
        { type: 'num', q: 'You run the 250 mL over 15 minutes with a 10 gtt/mL set. What is the drip rate (round to a whole drop)?', answer: 167, unit: 'gtt/min', tol: 1, explain: '(250 mL × 10 gtt/mL) ÷ 15 min = 166.7 → <b>167 gtt/min</b>.' },
        { type: 'mc', q: 'If you had not been able to get IV access, what would be the best alternative?', options: ['Glucagon 1 mg IM', 'Oral glucose 15 g', 'D50 rectally', 'Wait for the hospital'], answer: 0, explain: 'Glucagon IM (or intranasal) raises glucose by releasing liver glycogen when IV access is not available.' }
      ]
    },
    {
      id: 'peds-seizure', title: 'Pediatric status seizure', cat: 'neuro', level: 'Intermediate',
      setting: 'A 4-year-old girl has been seizing for 8 minutes. Her mother says she weighs 37 lb. You do not have IV access.',
      vitals: { HR: '150', RR: 'irregular', SpO2: '90% on NRB', BGL: '102', Weight: '37 lb' },
      steps: [
        { type: 'num', q: 'What is her weight in kilograms? (Round to the nearest tenth.)', answer: 16.8, unit: 'kg', tol: 0.15, explain: '37 lb ÷ 2.2 = <b>16.8 kg</b>.' },
        { type: 'mc', q: 'Which option is most appropriate without IV access?', options: ['Midazolam intranasal or IM', 'Diphenhydramine IM', 'Ondansetron ODT', 'Wait for IV access, then give midazolam'], answer: 0, explain: 'Benzodiazepines by IN or IM routes work quickly; do not delay treatment to start an IV.' },
        { type: 'num', q: 'Your protocol: midazolam 0.2 mg/kg IN (maximum 10 mg). What dose do you give? (Round to the nearest tenth.)', answer: 3.4, unit: 'mg', tol: 0.06, explain: '0.2 mg/kg × 16.8 kg = 3.36 mg → <b>3.4 mg</b> (below the 10 mg maximum).' },
        { type: 'draw', drug: 'midazolam', dose: 3.4, unit: 'mg', q: 'Draw up midazolam 3.4 mg from the vial shown (5 mg/mL).' },
        { type: 'mc', q: 'What is the most important adverse effect to monitor for?', options: ['Hypertension', 'Respiratory depression', 'Hyperglycemia', 'Tachycardia'], answer: 1, explain: 'Benzodiazepines (especially with a post-ictal state) can cause hypoventilation — have a BVM ready.' }
      ]
    },
    {
      id: 'svt', title: 'Racing heart', cat: 'arrest', level: 'Intermediate',
      setting: 'A 34-year-old woman has palpitations that started suddenly an hour ago. The monitor shows a regular narrow-complex tachycardia at 210/min. She is alert. A modified Valsalva maneuver did not work.',
      vitals: { BP: '118/76', HR: '210', RR: '20', SpO2: '98%' },
      steps: [
        { type: 'mc', q: 'What is the next treatment?', options: ['Synchronized cardioversion', 'Adenosine 6 mg rapid IV push', 'Amiodarone 300 mg IV', 'Atropine 1 mg IV'], answer: 1, explain: 'Stable, regular, narrow-complex tachycardia: vagal maneuvers, then adenosine. Cardioversion is for unstable patients.' },
        { type: 'draw', drug: 'adenosine', dose: 6, unit: 'mg', q: 'Draw up adenosine 6 mg from the vial shown.' },
        { type: 'mc', q: 'How should adenosine be given?', options: ['Slowly over 2 minutes', 'Rapid IV push in a proximal (antecubital) vein, immediately followed by a 20 mL saline flush', 'IM in the deltoid', 'Diluted in 100 mL over 10 minutes'], answer: 1, explain: 'Adenosine’s half-life is under 10 seconds — it must reach the heart as a bolus.' },
        { type: 'num', q: 'She does not convert. The second dose is 12 mg. How many mL of the 3 mg/mL vial is that?', answer: 4, unit: 'mL', tol: 0.02, explain: '12 mg ÷ 3 mg/mL = <b>4 mL</b>.' }
      ]
    },
    {
      id: 'vf-arrest', title: 'Witnessed VF arrest', cat: 'arrest', level: 'Intermediate',
      setting: 'A 70-year-old man collapses in a restaurant. CPR is in progress and the monitor shows ventricular fibrillation. You have IO access.',
      vitals: { Rhythm: 'VF', Pulse: 'None', Access: 'Tibial IO' },
      steps: [
        { type: 'mc', q: 'VF persists after the second shock. Which medication do you give now?', options: ['Amiodarone 300 mg', 'Epinephrine 1 mg IV/IO', 'Atropine 1 mg', 'Sodium bicarbonate 50 mEq'], answer: 1, explain: 'For shockable rhythms, give epinephrine after the second shock, then every 3–5 minutes.' },
        { type: 'num', q: 'Epinephrine comes as 1 mg/10 mL (0.1 mg/mL). How many mL is 1 mg?', answer: 10, unit: 'mL', tol: 0.05, explain: '1 mg ÷ 0.1 mg/mL = <b>10 mL</b> — the entire prefilled syringe.' },
        { type: 'mc', q: 'VF persists after the third shock. What antiarrhythmic and dose?', options: ['Amiodarone 150 mg', 'Amiodarone 300 mg', 'Lidocaine 3 mg/kg', 'Adenosine 6 mg'], answer: 1, explain: 'First dose of amiodarone in cardiac arrest is 300 mg IV/IO push; second dose 150 mg. (Lidocaine 1–1.5 mg/kg is the alternative.)' },
        { type: 'draw', drug: 'amiodarone', dose: 300, unit: 'mg', q: 'Draw up amiodarone 300 mg. Each vial is 150 mg/3 mL (50 mg/mL), so you will combine two vials into one syringe.' },
        { type: 'mc', q: 'How often should epinephrine be repeated?', options: ['Every minute', 'Every 3–5 minutes', 'Every 10 minutes', 'Only once'], answer: 1, explain: 'Epinephrine 1 mg every 3–5 minutes (roughly every other 2-minute cycle).' }
      ]
    },
    {
      id: 'shock', title: 'Post-arrest hypotension', cat: 'pressor', level: 'Advanced',
      setting: 'After ROSC, your 80 kg patient remains hypotensive despite a 1 L fluid bolus. Medical direction orders norepinephrine.',
      vitals: { BP: '76/40', MAP: '52', HR: '112', SpO2: '96% (ventilated)', Weight: '80 kg' },
      steps: [
        { type: 'num', q: 'You add norepinephrine 4 mg to 250 mL of NS. What is the concentration in mcg/mL?', answer: 16, unit: 'mcg/mL', tol: 0.05, explain: '4 mg = 4,000 mcg. 4,000 mcg ÷ 250 mL = <b>16 mcg/mL</b>.' },
        { type: 'num', q: 'Start at 0.1 mcg/kg/min. What pump rate (mL/hr)?', answer: 30, unit: 'mL/hr', tol: 0.5, explain: '0.1 × 80 kg = 8 mcg/min. 8 × 60 = 480 mcg/hr. 480 ÷ 16 mcg/mL = <b>30 mL/hr</b>.' },
        { type: 'mc', q: 'What blood-pressure target do you titrate to post-ROSC?', options: ['SBP above 200', 'MAP of at least 65 mmHg (SBP of at least 90)', 'Diastolic above 100', 'Heart rate below 60'], answer: 1, explain: 'AHA post-arrest care targets a MAP of at least 65 mmHg and SBP of at least 90 mmHg.' },
        { type: 'mc', q: 'Where should the infusion run?', options: ['Through a small hand vein by gravity', 'On an infusion pump through a secure, large-bore (ideally proximal) IV', 'IM', 'Through the same line as sodium bicarbonate'], answer: 1, explain: 'Vasopressors need precise pump control and a secure line — extravasation causes tissue necrosis.' }
      ]
    },
    {
      id: 'asthma', title: 'Silent chest', cat: 'resp', level: 'Advanced',
      setting: 'A 19-year-old man with asthma is speaking in single words with minimal air movement. He has used his inhaler repeatedly.',
      vitals: { BP: '136/84', HR: '132', RR: '34', SpO2: '88%', Weight: '70 kg' },
      steps: [
        { type: 'mc', q: 'What is the first medication?', options: ['Albuterol with ipratropium, nebulized', 'Diphenhydramine 50 mg IV', 'Midazolam 2 mg IV', 'Nitroglycerin 0.4 mg SL'], answer: 0, explain: 'Inhaled beta-2 agonist plus anticholinergic is first-line for severe bronchospasm.' },
        { type: 'draw', drug: 'magnesium', dose: 2, unit: 'g', q: 'He is not improving. Draw up magnesium sulfate 2 g from 50% vials (1 g/2 mL each), combining two vials.' },
        { type: 'num', q: 'You add the magnesium to 100 mL of NS to run over 20 minutes with a 10 gtt/mL set. What is the drip rate?', answer: 50, unit: 'gtt/min', tol: 1, explain: '(100 mL × 10 gtt/mL) ÷ 20 min = <b>50 gtt/min</b>.' },
        { type: 'mc', q: 'Which finding suggests magnesium toxicity?', options: ['Loss of deep-tendon reflexes and respiratory depression', 'Hypertension', 'Tremor', 'Hyperglycemia'], answer: 0, explain: 'Hypermagnesemia causes loss of reflexes, hypotension and respiratory depression. Calcium is the antidote.' }
      ]
    },
    {
      id: 'trauma', title: 'Gunshot wound to the thigh', cat: 'trauma', level: 'Advanced',
      setting: 'A 28-year-old man has a gunshot wound to the thigh. A tourniquet controls the bleeding. Injury occurred 40 minutes ago.',
      vitals: { BP: '88/56', HR: '128', RR: '24', SpO2: '96%', Weight: '85 kg' },
      steps: [
        { type: 'mc', q: 'Is tranexamic acid (TXA) indicated?', options: ['No — the bleeding is controlled', 'Yes — significant hemorrhage within 3 hours of injury', 'Only after hospital arrival', 'No — TXA is only for head injury'], answer: 1, explain: 'TXA reduces mortality in hemorrhagic trauma when started within 3 hours (earlier is better).' },
        { type: 'num', q: 'TXA is supplied 1 g/10 mL (100 mg/mL). How many mL is 1 g?', answer: 10, unit: 'mL', tol: 0.05, explain: '1 g = 1,000 mg ÷ 100 mg/mL = <b>10 mL</b>.' },
        { type: 'num', q: 'You mix 1 g in 100 mL of NS to infuse over 10 minutes on a pump. What rate (mL/hr)?', answer: 600, unit: 'mL/hr', tol: 2, explain: '(100 mL × 60) ÷ 10 min = <b>600 mL/hr</b>.' },
        { type: 'mc', q: 'Why is TXA not given as a rapid IV push?', options: ['It precipitates in saline', 'Rapid injection can cause hypotension', 'It is only effective IM', 'It causes immediate bleeding'], answer: 1, explain: 'Rapid administration can cause hypotension, so infuse over 10 minutes.' }
      ]
    }
  ];

  global.PharmScenarios = SCENARIOS;
})(window);

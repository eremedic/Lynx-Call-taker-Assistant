/*
 * CSHealthED ECG Trainer — curriculum content
 * Modules, rhythm criteria, recognition tips and prehospital considerations.
 * Clinical notes are general educational guidance aligned with common
 * AHA/ACLS-based EMS practice. Learners must always follow local protocols
 * and medical direction.
 */
(function (global) {
  'use strict';

  var MODULES = [
    {
      id: 'foundations', num: 1, title: 'Foundations', color: '#1b2a5b', icon: 'book',
      tagline: 'Conduction, the ECG paper, 3-lead placement and a systematic approach.',
      lesson: true
    },
    {
      id: 'sinus', num: 2, title: 'Sinus Rhythms', color: '#3a9b3f', icon: 'heart',
      tagline: 'Rhythms that start in the SA node — the heart’s normal pacemaker.',
      intro: 'Every sinus rhythm shares the same three features in Lead II: an <b>upright, uniform P wave before every QRS</b>, a <b>normal and constant PR interval (0.12–0.20 s)</b>, and a <b>narrow QRS</b> (unless a conduction delay exists). What changes between them is the <b>rate</b> and the <b>regularity</b>.',
      rhythms: ['nsr', 'sbrady', 'stach', 'sarrhythmia', 'sarrest']
    },
    {
      id: 'atrial', num: 3, title: 'Atrial Rhythms', color: '#1e88e5', icon: 'atrial',
      tagline: 'Ectopic atrial foci, flutter, fibrillation and SVT.',
      intro: 'Atrial rhythms arise from sites in the atria other than the SA node. Look for <b>P waves that look different</b> from sinus P waves, <b>no identifiable P waves</b> (replaced by flutter or fibrillatory waves), or P waves hidden in a <b>very fast, regular, narrow</b> rhythm. Because conduction below the AV node is normal, the QRS is usually <b>narrow</b>.',
      rhythms: ['pac', 'wap', 'mat', 'flutter', 'afib', 'svt']
    },
    {
      id: 'junctional', num: 4, title: 'Junctional Rhythms', color: '#f08a1c', icon: 'junction',
      tagline: 'The AV junction takes over: inverted, absent or retrograde P waves.',
      intro: 'When the AV junction paces the heart, the atria are depolarized <b>backwards (retrograde)</b>. In Lead II that produces an <b>inverted P wave</b> with a <b>short PR (&lt; 0.12 s)</b>, a P wave <b>hidden in the QRS</b>, or an inverted P <b>after</b> the QRS. The QRS stays <b>narrow</b>. The junction’s intrinsic rate is <b>40–60/min</b>; the name of the rhythm depends on the rate.',
      rhythms: ['pjc', 'junctEscape', 'accelJunct', 'junctTach']
    },
    {
      id: 'ventricular', num: 5, title: 'Ventricular Rhythms', color: '#e53935', icon: 'bolt',
      tagline: 'Wide-complex beats and the lethal arrest rhythms.',
      intro: 'Impulses that start in the ventricles spread slowly cell-to-cell, so the QRS is <b>wide (≥ 0.12 s)</b> and bizarre, with a <b>T wave pointing opposite</b> to the QRS. There is <b>no related P wave</b>. This module includes the cardiac-arrest rhythms — recognize them fast, then <b>check the patient, not just the monitor</b>.',
      rhythms: ['pvc', 'bigeminy', 'multifocal', 'idio', 'aivr', 'vt', 'torsades', 'vf', 'asystole']
    },
    {
      id: 'blocks', num: 6, title: 'AV Blocks', color: '#7b4bc4', icon: 'block',
      tagline: 'Delayed or interrupted conduction through the AV node.',
      intro: 'AV blocks are all about the <b>relationship between P waves and QRS complexes</b>. March out the P waves first — they are usually regular. Then ask: Is the PR constant or changing? Does every P wave produce a QRS? Are the P waves and QRS complexes related at all?',
      rhythms: ['firstDeg', 'wenck', 'mobitz2', 'twoToOne', 'chb']
    },
    {
      id: 'paced', num: 7, title: 'Pacemaker Rhythms', color: '#16838f', icon: 'pacer',
      tagline: 'Recognizing paced rhythms and pacemaker malfunction.',
      intro: 'A pacemaker produces a sharp, narrow vertical <b>pacer spike</b>. A spike followed by a P wave means atrial capture; a spike followed by a <b>wide QRS</b> means ventricular capture. A paced QRS is wide because the impulse starts in the ventricle. Learn to confirm <b>capture</b> (every spike is followed by a complex) and to spot <b>failure to capture</b>.',
      rhythms: ['vpaced', 'avpaced', 'failCapture']
    },
    {
      id: 'exam', num: 8, title: 'Final Exam', color: '#0e1a3d', icon: 'trophy',
      tagline: 'Mixed rhythm identification across every module.',
      exam: true
    }
  ];

  // Shorthand for criteria rows: rate, rhythm, P, PR, QRS
  function C(rate, reg, p, pr, qrs) { return { rate: rate, regularity: reg, p: p, pr: pr, qrs: qrs }; }

  var RHYTHMS = {
    /* ---------------- SINUS ---------------- */
    nsr: {
      name: 'Normal Sinus Rhythm', short: 'NSR', module: 'sinus',
      criteria: C('60–100/min', 'Regular', 'Upright, uniform, one before every QRS', '0.12–0.20 s, constant', '< 0.12 s (narrow)'),
      desc: 'The SA node fires at a normal rate and every impulse is conducted normally through the atria, AV node and ventricles.',
      tips: ['Every rule of a “normal” ECG is met — use it as your reference strip.', 'In Lead II the P, QRS and T are all upright.'],
      care: ['Treat the patient, not the monitor — a normal rhythm does not exclude ACS, PEA or other pathology.', 'A 12-lead ECG is still indicated for chest pain or anginal equivalents.']
    },
    sbrady: {
      name: 'Sinus Bradycardia', short: 'SB', module: 'sinus',
      criteria: C('< 60/min', 'Regular', 'Upright, uniform, one before every QRS', '0.12–0.20 s, constant', '< 0.12 s'),
      desc: 'A sinus rhythm with a rate below 60/min. Normal in athletes and during sleep; also caused by vagal stimulation, hypoxia, hypothermia, inferior MI, increased ICP and drugs (beta blockers, calcium channel blockers, digoxin, opioids).',
      tips: ['Looks exactly like NSR, just with longer gaps between complexes.', 'Count the complexes in 6 seconds × 10 — fewer than 6 complexes means bradycardia.'],
      care: ['Asymptomatic: monitor and look for a cause.', 'Symptomatic (hypotension, altered mental status, chest pain, signs of shock, acute heart failure): oxygen if hypoxic, IV/IO access, atropine, and transcutaneous pacing or a chronotropic infusion per protocol.', 'Hypoxia is a common cause in children — oxygenate and ventilate first.']
    },
    stach: {
      name: 'Sinus Tachycardia', short: 'ST', module: 'sinus',
      criteria: C('101–150/min (rarely higher in adults)', 'Regular', 'Upright, uniform; may merge with preceding T wave at fast rates', '0.12–0.20 s (may shorten)', '< 0.12 s'),
      desc: 'A sinus rhythm faster than 100/min. Almost always a response to something: pain, fever, anxiety, exercise, hypovolemia, hypoxia, sepsis, PE, stimulants.',
      tips: ['Rate usually ≤ 150 in adults (max ≈ 220 − age). Faster than 150 with no visible P waves? Think SVT.', 'Onset and offset are gradual, not abrupt.'],
      care: ['Treat the underlying cause — never cardiovert or give adenosine for sinus tachycardia.', 'Consider fluid loss, bleeding, sepsis, hypoxia, pain and toxicology.']
    },
    sarrhythmia: {
      name: 'Sinus Arrhythmia', short: 'SA', module: 'sinus',
      criteria: C('Usually 60–100/min', 'Irregular — rate speeds and slows in a repeating pattern', 'Upright, uniform, one before every QRS', '0.12–0.20 s, constant', '< 0.12 s'),
      desc: 'The SA node rate varies with breathing — speeding up on inspiration and slowing on expiration. A normal finding, especially in children and young adults.',
      tips: ['All P waves look the same — that separates it from wandering atrial pacemaker.', 'The irregularity is cyclical (“regularly irregular” with respirations).'],
      care: ['Usually no treatment required.', 'Correlate with breathing; document and monitor.']
    },
    sarrest: {
      name: 'Sinus Arrest / Pause', short: 'Arrest', module: 'sinus',
      criteria: C('Underlying sinus rate, often slow overall', 'Irregular — a sudden pause', 'Normal before every QRS; absent during the pause', '0.12–0.20 s, constant', '< 0.12 s'),
      desc: 'The SA node fails to fire, producing a pause in which there is no P wave and no QRS. The pause is not an exact multiple of the normal P–P interval (if it is, the term is sinus exit block). Causes include sick sinus syndrome, vagal stimulation, ischemia, hyperkalemia and medications.',
      tips: ['Measure the pause with calipers and compare it to the P–P interval.', 'After the pause the rhythm may resume from the SA node or from an escape pacemaker.'],
      care: ['Assess perfusion and symptoms (syncope, dizziness).', 'Symptomatic pauses are treated like symptomatic bradycardia per protocol; prepare for pacing if frequent or prolonged.']
    },

    /* ---------------- ATRIAL ---------------- */
    pac: {
      name: 'Sinus Rhythm with PACs', short: 'PAC', module: 'atrial',
      criteria: C('Underlying rate', 'Irregular — early beats', 'Premature P wave that looks different from sinus P waves (may be hidden in the T wave)', 'Normal or slightly different on the early beat', '< 0.12 s (usually)'),
      desc: 'A premature atrial contraction is an early impulse from an ectopic atrial focus. It resets the SA node, so the pause that follows is usually non-compensatory.',
      tips: ['Look for the early beat, then look for its P wave — it is often buried in or deforming the preceding T wave.', 'The QRS of the early beat looks like the others (narrow).'],
      care: ['Usually benign — caused by caffeine, stress, nicotine, hypoxia, electrolyte imbalance or heart disease.', 'Frequent PACs can precede atrial fibrillation or flutter — monitor.']
    },
    wap: {
      name: 'Wandering Atrial Pacemaker', short: 'WAP', module: 'atrial',
      criteria: C('60–100/min', 'Irregular', 'At least 3 different P-wave shapes', 'Varies with the pacemaker site', '< 0.12 s'),
      desc: 'The pacemaker site shifts between the SA node, atrial foci and the AV junction, producing changing P-wave shapes and PR intervals at a normal rate.',
      tips: ['Compare P waves beat to beat — upright, flat, inverted, notched.', 'Same findings at a rate > 100/min = multifocal atrial tachycardia.'],
      care: ['Usually benign (often seen with increased vagal tone).', 'Monitor and treat any underlying cause.']
    },
    mat: {
      name: 'Multifocal Atrial Tachycardia', short: 'MAT', module: 'atrial',
      criteria: C('> 100/min', 'Irregular', 'At least 3 different P-wave shapes', 'Varies', '< 0.12 s'),
      desc: 'Multiple atrial foci fire at a rate over 100/min. Strongly associated with severe COPD, hypoxia, pulmonary disease and electrolyte disturbances.',
      tips: ['Often mistaken for atrial fibrillation — but MAT has clear, varying P waves before each QRS.', 'Irregular + narrow + fast: look hard for P waves before deciding.'],
      care: ['Treat the underlying cause — oxygenation and bronchodilation for respiratory patients.', 'Electrical cardioversion is ineffective for MAT.']
    },
    flutter: {
      name: 'Atrial Flutter', short: 'A-Flutter', module: 'atrial',
      criteria: C('Atrial 250–350/min; ventricular depends on conduction (2:1 ≈ 150)', 'Usually regular (irregular with variable block)', 'No P waves — “sawtooth” flutter (F) waves, best seen in II and III', 'Not measurable', '< 0.12 s'),
      desc: 'A rapid re-entry circuit in the right atrium generates flutter waves at about 300/min. The AV node blocks some impulses, so the ventricular rate is a fraction of the atrial rate (2:1, 3:1, 4:1 or variable).',
      tips: ['A regular narrow-complex rhythm at exactly ~150/min should make you think 2:1 flutter — look for a hidden F wave.', 'Lead I often shows the flutter waves poorly; Leads II and III show them best.'],
      care: ['Stable: monitor, 12-lead, rate control per protocol and medical direction.', 'Unstable (hypotension, altered mental status, shock, ischemic chest pain, acute heart failure): synchronized cardioversion.']
    },
    afib: {
      name: 'Atrial Fibrillation', short: 'A-Fib', module: 'atrial',
      criteria: C('Atrial > 350/min; ventricular varies (controlled < 100, RVR > 100)', 'Irregularly irregular', 'None — chaotic fibrillatory (f) waves or a wavy baseline', 'None', '< 0.12 s'),
      desc: 'Chaotic electrical activity throughout the atria with no organized contraction. The AV node conducts impulses randomly, producing an irregularly irregular ventricular response. Increases the risk of clot formation and stroke.',
      tips: ['Irregularly irregular + no P waves = atrial fibrillation until proven otherwise.', 'Use the 6-second method for rate — the 300 and 1500 methods are inaccurate when the rhythm is irregular.'],
      care: ['Ask about onset, anticoagulants and stroke symptoms.', 'Stable with RVR: rate control per protocol/medical direction.', 'Unstable: synchronized cardioversion.']
    },
    svt: {
      name: 'Supraventricular Tachycardia', short: 'SVT', module: 'atrial',
      criteria: C('150–250/min', 'Regular', 'Usually not visible (buried in QRS or T)', 'Not measurable', '< 0.12 s'),
      desc: 'A rapid, regular, narrow-complex tachycardia arising above the ventricles — most often an AV-nodal re-entry circuit (AVNRT). Typically starts and stops abruptly (paroxysmal).',
      tips: ['Very regular, very fast, narrow — and no visible P waves.', 'Sinus tachycardia rarely exceeds 150/min at rest and changes rate gradually; SVT is fixed.'],
      care: ['Stable: vagal maneuvers (e.g., modified Valsalva), then adenosine rapid IV push with flush per protocol.', 'Unstable: synchronized cardioversion.', 'Record a strip during any intervention — conversion is diagnostic.']
    },

    /* ---------------- JUNCTIONAL ---------------- */
    pjc: {
      name: 'Sinus Rhythm with PJCs', short: 'PJC', module: 'junctional',
      criteria: C('Underlying rate', 'Irregular — early beats', 'Early beat has an inverted P before, no P, or inverted P after the QRS', '< 0.12 s if P precedes QRS', '< 0.12 s'),
      desc: 'A premature junctional contraction is an early impulse from the AV junction that travels forward to the ventricles and backward into the atria.',
      tips: ['Early narrow beat + inverted, absent or retrograde P wave.', 'A PAC has an upright (but different) P wave; a PJC has an inverted or absent one.'],
      care: ['Usually benign; consider digoxin toxicity, ischemia, hypoxia and stimulants.', 'Monitor frequency.']
    },
    junctEscape: {
      name: 'Junctional Escape Rhythm', short: 'JR', module: 'junctional',
      criteria: C('40–60/min', 'Regular', 'Inverted before, absent, or inverted after the QRS', '< 0.12 s if P precedes QRS', '< 0.12 s'),
      desc: 'A protective back-up rhythm: when the SA node fails or slows, the AV junction takes over at its intrinsic rate of 40–60/min.',
      tips: ['Narrow, regular, 40–60, and no normal upright P waves.', 'It is an escape rhythm — the question is “why did the SA node fail?”'],
      care: ['Assess for symptomatic bradycardia — treat per bradycardia protocol (atropine, pacing).', 'Never try to suppress an escape rhythm.']
    },
    accelJunct: {
      name: 'Accelerated Junctional Rhythm', short: 'AJR', module: 'junctional',
      criteria: C('61–100/min', 'Regular', 'Inverted before, absent, or inverted after the QRS', '< 0.12 s if P precedes QRS', '< 0.12 s'),
      desc: 'The AV junction fires faster than its intrinsic rate (61–100/min). Seen with digoxin toxicity, ischemia, myocarditis and after cardiac surgery.',
      tips: ['Same morphology as a junctional rhythm — the rate is what changes the name.'],
      care: ['Usually well tolerated; assess perfusion and search for a cause (e.g., digoxin).']
    },
    junctTach: {
      name: 'Junctional Tachycardia', short: 'JT', module: 'junctional',
      criteria: C('101–180/min', 'Regular', 'Inverted before, absent, or inverted after the QRS', '< 0.12 s if P precedes QRS', '< 0.12 s'),
      desc: 'An irritable junctional focus fires faster than 100/min. Without visible P waves, it can be indistinguishable from SVT.',
      tips: ['Rate > 100, narrow, regular with inverted P waves near the QRS.'],
      care: ['Treat as a narrow-complex tachycardia per protocol; unstable patients may need synchronized cardioversion.']
    },

    /* ---------------- VENTRICULAR ---------------- */
    pvc: {
      name: 'Sinus Rhythm with Unifocal PVCs', short: 'PVC', module: 'ventricular',
      criteria: C('Underlying rate', 'Irregular — early beats', 'None before the PVC', 'None for the PVC', 'PVC ≥ 0.12 s, wide and bizarre, T wave opposite'),
      desc: 'A premature ventricular contraction is an early impulse from an irritable ventricular focus. All PVCs from one focus look the same (unifocal). A full compensatory pause usually follows because the SA node is not reset.',
      tips: ['Early + wide + no P wave = PVC.', 'Measure: the R–R across the PVC equals two normal R–R intervals (compensatory pause).', 'Two in a row = couplet; three or more = a run of VT.'],
      care: ['Look for causes: hypoxia, ischemia/ACS, electrolytes (K⁺, Mg²⁺), stimulants, drugs.', 'Frequent, multifocal, couplets or R-on-T PVCs are warning signs — oxygenate if hypoxic, 12-lead, monitor closely.']
    },
    bigeminy: {
      name: 'Ventricular Bigeminy / Trigeminy', short: 'Bigeminy', module: 'ventricular',
      criteria: C('Underlying rate', 'Regularly irregular — a repeating pattern', 'Present on the normal beats only', 'Normal on the normal beats', 'PVCs wide and bizarre'),
      desc: 'PVCs occurring in a fixed pattern: every other beat (bigeminy) or every third beat (trigeminy).',
      tips: ['Name the pattern: normal–PVC = bigeminy; normal–normal–PVC = trigeminy.', 'PVCs may not generate a pulse — palpate a pulse; the monitor rate can overestimate perfusion.'],
      care: ['Same approach as frequent PVCs: find and treat the cause, monitor closely.']
    },
    multifocal: {
      name: 'Multifocal PVCs', short: 'MF-PVC', module: 'ventricular',
      criteria: C('Underlying rate', 'Irregular', 'None before the PVCs', 'None for the PVCs', 'Wide; PVCs have different shapes'),
      desc: 'PVCs arising from two or more ventricular foci, so they look different from each other. Indicates greater ventricular irritability.',
      tips: ['Compare the PVCs to each other — different shapes = multifocal.', 'Watch for couplets and runs.'],
      care: ['Higher risk of deteriorating to VT/VF — oxygenate if hypoxic, 12-lead, search for causes, prepare the defibrillator.']
    },
    idio: {
      name: 'Idioventricular Rhythm', short: 'IVR', module: 'ventricular',
      criteria: C('20–40/min', 'Regular', 'None', 'None', '≥ 0.12 s, wide and bizarre'),
      desc: 'A ventricular escape rhythm: higher pacemakers have failed and the ventricles pace themselves at 20–40/min. Commonly seen in the dying heart (agonal rhythm when < 20/min).',
      tips: ['Slow + wide + no P waves.', 'Often a pulseless rhythm — always check for a pulse.'],
      care: ['Pulseless: PEA — CPR, epinephrine, find reversible causes (H’s and T’s).', 'With a pulse: treat symptomatic bradycardia — pacing per protocol. Do not suppress with antiarrhythmics.']
    },
    aivr: {
      name: 'Accelerated Idioventricular Rhythm', short: 'AIVR', module: 'ventricular',
      criteria: C('41–100/min', 'Regular', 'None', 'None', '≥ 0.12 s, wide'),
      desc: 'A ventricular rhythm faster than the intrinsic ventricular rate but slower than VT. Classically seen after reperfusion in STEMI.',
      tips: ['Wide and regular like VT, but the rate is ≤ 100.'],
      care: ['Usually transient and well tolerated — monitor.', 'Do not suppress with antiarrhythmics (it may be the only pacemaker).']
    },
    vt: {
      name: 'Monomorphic Ventricular Tachycardia', short: 'VT', module: 'ventricular',
      criteria: C('101–250/min (usually 150–250)', 'Regular', 'None visible (or dissociated)', 'None', '≥ 0.12 s, wide, all the same shape'),
      desc: 'Three or more consecutive ventricular beats at a rate over 100/min. May present with a pulse (stable or unstable) or without a pulse.',
      tips: ['A wide, regular tachycardia is VT until proven otherwise.', 'All complexes look the same (monomorphic).'],
      care: ['Pulseless: treat as VF — defibrillate, CPR, epinephrine, antiarrhythmic.', 'With a pulse and unstable: synchronized cardioversion.', 'With a pulse and stable: 12-lead, antiarrhythmic per protocol, expert consultation.']
    },
    torsades: {
      name: 'Polymorphic VT (Torsades de Pointes)', short: 'TdP', module: 'ventricular',
      criteria: C('150–300/min', 'Irregular', 'None', 'None', 'Wide; amplitude grows and shrinks, appearing to twist around the baseline'),
      desc: '“Twisting of the points” — a polymorphic VT associated with a prolonged QT interval (drugs, hypomagnesemia, hypokalemia, congenital long QT).',
      tips: ['Look for the spindle pattern: complexes gradually grow, shrink, and change polarity.'],
      care: ['Pulseless: defibrillate (unsynchronized) and CPR.', 'Magnesium sulfate per protocol.', 'With a pulse but unstable: defibrillation doses are used — synchronization is unreliable with polymorphic complexes.']
    },
    vf: {
      name: 'Ventricular Fibrillation', short: 'VF', module: 'ventricular',
      criteria: C('Not measurable', 'Chaotic', 'None', 'None', 'None — irregular chaotic waves (coarse or fine)'),
      desc: 'Chaotic electrical activity of the ventricles with no organized depolarization and no cardiac output. The patient is in cardiac arrest.',
      tips: ['No identifiable P, QRS or T waves.', 'Fine VF can mimic asystole — check another lead and increase gain.', 'Rule out artifact: a conscious, talking patient is not in VF.'],
      care: ['Confirm pulselessness, start high-quality CPR, defibrillate as soon as possible.', 'Epinephrine and antiarrhythmics (amiodarone or lidocaine) per protocol; minimize interruptions.']
    },
    asystole: {
      name: 'Asystole', short: 'Asystole', module: 'ventricular',
      criteria: C('None', 'None', 'None (occasionally P waves only)', 'None', 'None — flat or nearly flat line'),
      desc: 'The absence of ventricular electrical activity. The patient is in cardiac arrest.',
      tips: ['Confirm in a second lead — this is where your 3-lead monitor matters (switch from II to I or III).', 'Check that leads are attached and gain is turned up (rule out fine VF and disconnected leads).'],
      care: ['High-quality CPR and epinephrine; asystole is NOT a shockable rhythm.', 'Search for reversible causes (H’s and T’s) and follow termination-of-resuscitation guidance per protocol.']
    },

    /* ---------------- BLOCKS ---------------- */
    firstDeg: {
      name: 'First-Degree AV Block', short: '1° AVB', module: 'blocks',
      criteria: C('Underlying rate', 'Regular', 'Upright, one before every QRS', '> 0.20 s and constant', '< 0.12 s (usually)'),
      desc: 'Every impulse is conducted, but each one is delayed at the AV node. Technically a delay, not a true block.',
      tips: ['A long, consistent PR interval (more than one big box) — everything else is normal.', 'Name the underlying rhythm too: “Sinus rhythm with first-degree AV block.”'],
      care: ['Usually no treatment; may be caused by medications, ischemia, increased vagal tone.', 'Monitor for progression.']
    },
    wenck: {
      name: 'Second-Degree AV Block Type I (Wenckebach)', short: '2° Type I', module: 'blocks',
      criteria: C('Atrial normal; ventricular slower', 'Irregular — grouped beating', 'Regular P waves; some not followed by a QRS', 'Progressively lengthens until a QRS is dropped', '< 0.12 s (usually)'),
      desc: 'Conduction through the AV node becomes progressively slower until one impulse is blocked entirely. The cycle then repeats. The block is usually at the AV node.',
      tips: ['“Longer, longer, longer, drop — then you have a Wenckebach.”', 'Look for grouped beating and compare the PR right after the pause (shortest) with the PR before it (longest).'],
      care: ['Usually transient and well tolerated (inferior MI, vagal tone, drugs).', 'Symptomatic: treat per bradycardia protocol — atropine is often effective.']
    },
    mobitz2: {
      name: 'Second-Degree AV Block Type II (Mobitz II)', short: '2° Type II', module: 'blocks',
      criteria: C('Atrial normal; ventricular slower', 'Irregular where beats are dropped', 'Regular P waves; some not followed by a QRS', 'Constant on conducted beats', 'Often wide (block below the AV node)'),
      desc: 'Some P waves are suddenly not conducted, without any warning lengthening of the PR interval. The block is below the AV node and can abruptly progress to third-degree block.',
      tips: ['PR stays the same — then a P wave suddenly has no QRS.', 'A wide QRS raises suspicion for Mobitz II.'],
      care: ['Potentially dangerous — place pacing pads early.', 'Symptomatic: transcutaneous pacing; atropine is often ineffective for infranodal blocks.']
    },
    twoToOne: {
      name: '2:1 AV Block', short: '2:1 AVB', module: 'blocks',
      criteria: C('Ventricular = half the atrial rate', 'Regular', 'Two P waves for every QRS', 'Constant on conducted beats', 'Narrow or wide'),
      desc: 'Every other P wave is blocked. Because there are never two consecutive conducted beats, you cannot tell whether the PR would lengthen — so it cannot be classified as type I or type II from the strip alone.',
      tips: ['Look for a P wave hiding in or near the T wave — count the P waves between QRS complexes.', 'A wide QRS suggests a type II mechanism.'],
      care: ['Treat per bradycardia protocol based on symptoms; prepare for pacing.']
    },
    chb: {
      name: 'Third-Degree (Complete) AV Block', short: '3° AVB', module: 'blocks',
      criteria: C('Atrial normal; ventricular 20–60/min', 'Atrial regular; ventricular regular — independent of each other', 'Regular, more P waves than QRS complexes, march through the QRS', 'Completely variable — no relationship', 'Narrow (junctional escape) or wide (ventricular escape)'),
      desc: 'No impulses are conducted from the atria to the ventricles. The atria and ventricles beat independently (AV dissociation), with the ventricles paced by an escape rhythm.',
      tips: ['March out the P waves with calipers — they continue at their own rate, even hidden in QRS complexes and T waves.', 'PR intervals are random, but the R–R is regular.'],
      care: ['Often unstable — transcutaneous pacing is the priority if symptomatic.', 'Atropine is unlikely to work, especially with a wide escape rhythm.']
    },

    /* ---------------- PACED ---------------- */
    vpaced: {
      name: 'Ventricular Paced Rhythm', short: 'V-Paced', module: 'paced',
      criteria: C('Pacemaker set rate (often 60–70/min)', 'Regular', 'None or unrelated', 'None', 'Wide, each preceded by a pacer spike'),
      desc: 'The pacemaker stimulates the ventricle directly (usually the right ventricular apex), producing a spike followed by a wide QRS — often with a left bundle-branch-like appearance.',
      tips: ['Spike → wide QRS = ventricular capture.', 'Pacer spikes can be tiny in some leads; switch leads if you are unsure.'],
      care: ['Confirm mechanical capture with a palpable pulse.', 'A paced rhythm makes ST-segment interpretation for ACS unreliable — transport to an appropriate facility based on the clinical picture.']
    },
    avpaced: {
      name: 'AV Sequential (Dual-Chamber) Paced Rhythm', short: 'AV-Paced', module: 'paced',
      criteria: C('Pacemaker set rate', 'Regular', 'Atrial spike followed by a P wave', 'Programmed AV delay (≈ 0.16 s)', 'Wide, preceded by a ventricular spike'),
      desc: 'A dual-chamber pacemaker paces the atria and then, after a programmed delay, the ventricles — mimicking the normal sequence of contraction.',
      tips: ['Two spikes per beat: atrial spike → P wave, ventricular spike → wide QRS.'],
      care: ['Confirm pulses; ask about the device and bring the device ID card to the hospital if available.']
    },
    failCapture: {
      name: 'Pacemaker Failure to Capture', short: 'FTC', module: 'paced',
      criteria: C('Variable — depends on how many spikes capture', 'Irregular', 'Variable', 'Variable', 'Wide on captured beats; some spikes are not followed by a QRS'),
      desc: 'The pacemaker fires (a spike is seen) but the myocardium does not depolarize. Causes include lead displacement or fracture, battery depletion, myocardial ischemia, hyperkalemia and drug effects.',
      tips: ['Find a spike that is not followed by a complex — that is a non-captured beat.', 'Compare with failure to pace (no spike at all when one is expected).'],
      care: ['Assess for symptomatic bradycardia — transcutaneous pacing per protocol.', 'Place pads away from the generator (at least several centimeters).']
    }
  };

  // Default quiz options shown when choosing distractors.
  global.ECGContent = { MODULES: MODULES, RHYTHMS: RHYTHMS };
})(window);

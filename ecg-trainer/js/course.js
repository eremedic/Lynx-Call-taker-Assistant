/*
 * CSHealthED ECG Trainer — self-paced Basic ECG Interpretation course content.
 *
 * Units contain lessons; each lesson is a list of blocks rendered by app.js:
 *   ['p', html]                    narrated paragraph
 *   ['h', text]                    narrated sub-heading
 *   ['list', [html, ...]]          narrated bullet list
 *   ['callout', html] / ['note', html]   narrated warning / info box
 *   ['html', html, speech]         static figure, optionally narrated with `speech`
 *   ['anatomy'] / ['leadsvg']      figures drawn by the app
 *   ['strip', rhythm, {lead, artifact, caption}]   interactive strip
 *   ['compare', [[rhythm, caption], ...]]           one strip, tabbed examples
 *   ['rhythms', [rhythm, ...]]     rhythm explorer: strip + criteria, tips and care
 *   ['rate']                       rate-calculation practice
 *   ['practice', [rhythm, ...]]    unlimited, unscored strip identification
 *   ['kc', {q, o: [...], a, why}]  knowledge check (o[a] is correct)
 *
 * Question banks use the same {q, o, a, why} shape. Options are shuffled when shown.
 * Clinical notes are general guidance — learners follow local protocols.
 */
(function (global) {
  'use strict';

  var PATHWAY = '<div class="pathway">' +
    '<div class="node"><b>SA node</b><span>Primary pacemaker in the right atrium</span></div>' +
    '<div class="node"><b>Atria</b><span>Internodal pathways → atrial depolarization (P wave)</span></div>' +
    '<div class="node"><b>AV node</b><span>Brief delay so the ventricles can fill (PR segment)</span></div>' +
    '<div class="node"><b>Bundle of His</b><span>Into the septum</span></div>' +
    '<div class="node"><b>Bundle branches</b><span>Right and left</span></div>' +
    '<div class="node"><b>Purkinje fibers</b><span>Rapid ventricular depolarization (QRS)</span></div></div>';
  var PACERS = '<div class="pacers"><div class="pacer" style="background:#3a9b3f"><b>60–100</b><span>SA node · sinus rhythms</span></div><div class="pacer" style="background:#f08a1c"><b>40–60</b><span>AV junction · junctional rhythms</span></div><div class="pacer" style="background:#e53935"><b>20–40</b><span>Ventricles · idioventricular rhythms</span></div></div>';
  var PAPER = '<div class="paper-key"><div class="nv"><b>Small box (1 mm)</b><span>0.04 s · 0.1 mV</span></div><div class="nv"><b>Large box (5 mm)</b><span>0.20 s · 0.5 mV</span></div><div class="nv"><b>5 large boxes</b><span>= 1 second</span></div><div class="nv"><b>30 large boxes</b><span>= 6 seconds (a standard rhythm strip)</span></div></div>';
  var VALUES = '<div class="normal-values">' +
    '<div class="nv"><b>P wave</b><span>Atrial depolarization · upright in II · ≤ 0.11 s</span></div>' +
    '<div class="nv"><b>PR interval 0.12–0.20 s</b><span>Start of P to start of QRS (3–5 small boxes)</span></div>' +
    '<div class="nv"><b>QRS &lt; 0.12 s</b><span>Ventricular depolarization (narrow = under 3 small boxes)</span></div>' +
    '<div class="nv"><b>T wave</b><span>Ventricular repolarization</span></div>' +
    '<div class="nv"><b>ST segment</b><span>End of QRS to start of T — should sit on the baseline</span></div>' +
    '<div class="nv"><b>QT interval</b><span>Start of QRS to end of T · roughly &lt; ½ the R–R</span></div></div>';
  var STEPS = '<ol class="five-steps">' +
    '<li><div><b>What is the rate?</b> Atrial and ventricular. Slow (&lt; 60), normal (60–100) or fast (&gt; 100)?</div></li>' +
    '<li><div><b>Is the rhythm regular?</b> Regular, regularly irregular (a pattern) or irregularly irregular?</div></li>' +
    '<li><div><b>Are there P waves?</b> One before every QRS? Upright and alike in Lead II? More P waves than QRS complexes?</div></li>' +
    '<li><div><b>What is the PR interval?</b> Normal (0.12–0.20 s), short, long, lengthening or variable?</div></li>' +
    '<li><div><b>What is the QRS width?</b> Narrow (&lt; 0.12 s) or wide (≥ 0.12 s)?</div></li></ol>';
  var RATE_METHODS = '<div class="rate-methods">' +
    '<div class="m"><b>6-second method</b>Count the QRS complexes in 6 seconds and multiply by 10. Works for regular and irregular rhythms.</div>' +
    '<div class="m"><b>Large-box (300) method</b>300 ÷ large boxes between two R waves. Sequence: 300, 150, 100, 75, 60, 50. Regular rhythms only.</div>' +
    '<div class="m"><b>Small-box (1500) method</b>1500 ÷ small boxes between two R waves. The most precise method for regular rhythms.</div></div>';
  var LEADS = '<div class="lead-legend">' +
    '<div class="el"><span class="sw" style="background:#fff"></span><span><b>RA — white</b> · right arm or below the right clavicle</span></div>' +
    '<div class="el"><span class="sw" style="background:#222"></span><span><b>LA — black</b> · left arm or below the left clavicle</span></div>' +
    '<div class="el"><span class="sw" style="background:#e0262b;border-color:#e0262b"></span><span><b>LL — red</b> · left lower torso or left leg</span></div></div>' +
    '<table class="criteria" style="margin-top:12px"><tr><th>Lead I</th><td>RA (−) → LA (+)</td></tr><tr><th>Lead II</th><td>RA (−) → LL (+) · the standard monitoring lead</td></tr><tr><th>Lead III</th><td>LA (−) → LL (+)</td></tr></table>';

  var UNITS = [
    /* ================================================================ 1 */
    {
      id: 'electro', title: 'The Heart’s Electrical System', color: '#1b2a5b', icon: 'heart',
      summary: 'Cardiac cells, depolarization, the conduction pathway and the intrinsic rate of each pacemaker site.',
      lessons: [
        { id: 'cells', title: 'Electrical cells and depolarization', min: 6, blocks: [
          ['p', 'Every heartbeat begins as an electrical event. An ECG does not show the heart squeezing — it shows the <b>electrical activity</b> that tells the muscle when to squeeze. Before you can read a rhythm, you need to know where that electricity comes from.'],
          ['p', 'The heart has two main kinds of cells. <b>Myocardial (working) cells</b> contract and pump blood. <b>Pacemaker and conducting cells</b> create electrical impulses and carry them through the heart.'],
          ['h', 'Four properties of cardiac cells'],
          ['list', [
            '<b>Automaticity</b> — the ability to start an impulse without outside stimulation. This is what makes a pacemaker a pacemaker.',
            '<b>Excitability</b> — the ability to respond to an impulse.',
            '<b>Conductivity</b> — the ability to pass an impulse on to neighboring cells.',
            '<b>Contractility</b> — the ability to shorten and pump in response to an impulse.'
          ]],
          ['h', 'Depolarization and repolarization'],
          ['p', 'At rest, the inside of a cardiac cell is negatively charged. When the cell is stimulated, sodium rushes in and the inside becomes positive — this is <b>depolarization</b>, and it triggers contraction. Potassium then moves out and the cell returns to its resting state — <b>repolarization</b>. The ECG records the combined waves of depolarization and repolarization from the surface of the skin.'],
          ['callout', '<b>Electrical is not mechanical.</b> A normal-looking rhythm on the monitor does not prove the heart is pumping. An organized rhythm without a pulse is pulseless electrical activity (PEA). Always check the patient.'],
          ['kc', { q: 'Which property lets pacemaker cells start an impulse on their own?', o: ['Automaticity', 'Excitability', 'Conductivity', 'Contractility'], a: 0, why: 'Automaticity is the ability to generate an impulse without outside stimulation. Pacemaker cells in the SA node, the AV junction and the ventricles all have it.' }]
        ] },
        { id: 'pathway', title: 'The conduction pathway', min: 6, blocks: [
          ['p', 'A normal impulse follows the same path every time. It starts in the <b>SA node</b>, high in the right atrium, and spreads across both atria. It then reaches the <b>AV node</b>, the only normal electrical connection between the atria and the ventricles.'],
          ['html', PATHWAY, 'The pathway runs from the SA node, across the atria, through the AV node, into the bundle of His, down the right and left bundle branches, and out through the Purkinje fibers.'],
          ['p', 'The AV node deliberately <b>slows the impulse</b>. That short delay lets the atria finish emptying into the ventricles before the ventricles contract, and it protects the ventricles from very fast atrial rates.'],
          ['p', 'From the AV node the impulse races down the <b>bundle of His</b>, splits into the <b>right and left bundle branches</b>, and spreads through the <b>Purkinje fibers</b> into the ventricular muscle. Because this specialized system is so fast, normal ventricular depolarization is quick — and that is why a normal QRS is narrow.'],
          ['strip', 'nsr', { caption: 'Normal sinus rhythm in Lead II: every impulse takes the normal path — a P wave, a short pause, then a narrow QRS.' }],
          ['kc', { q: 'Why does the AV node delay the impulse?', o: ['To let the ventricles fill before they contract', 'To speed up the heart rate', 'To create the T wave', 'To start the impulse in the atria'], a: 0, why: 'The AV delay gives the atria time to empty into the ventricles. It also limits how many atrial impulses reach the ventricles when the atrial rate is very fast.' }]
        ] },
        { id: 'pacers', title: 'Pacemaker sites and intrinsic rates', min: 7, blocks: [
          ['p', 'Several areas of the heart can act as a pacemaker. The fastest one normally controls the heart. If it fails or slows, the next site down takes over at its own slower <b>intrinsic rate</b>.'],
          ['html', PACERS, 'The SA node fires at 60 to 100 per minute. The AV junction fires at 40 to 60. The ventricles fire at 20 to 40.'],
          ['p', 'This gives you a powerful clue. A regular narrow rhythm at 45 suggests the AV junction is in charge. A wide, slow rhythm at 30 suggests the ventricles are pacing the heart.'],
          ['h', 'Escape beats versus premature beats'],
          ['list', [
            'An <b>escape</b> beat comes <b>late</b>. A lower pacemaker fires because the higher one failed. Escape beats are protective.',
            'A <b>premature (ectopic)</b> beat comes <b>early</b>. An irritable site fires before the next normal beat is due.'
          ]],
          ['h', 'The autonomic nervous system'],
          ['p', '<b>Sympathetic</b> stimulation speeds the SA node and AV conduction. <b>Parasympathetic</b> stimulation through the vagus nerve slows them. Vomiting, bearing down and pain can all cause a vagal slowing of the heart.'],
          ['kc', { q: 'A regular, narrow-complex rhythm runs at 48/min with inverted P waves in Lead II. Where is it most likely coming from?', o: ['The AV junction', 'The SA node', 'The ventricles', 'The Purkinje fibers'], a: 0, why: 'A rate of 40–60 with a narrow QRS and inverted (retrograde) P waves points to a junctional pacemaker.' }]
        ] }
      ],
      bank: [
        { q: 'What is the heart’s primary pacemaker?', o: ['SA node', 'AV node', 'Bundle of His', 'Purkinje fibers'], a: 0, why: 'The SA node normally has the fastest intrinsic rate, so it controls the heart.' },
        { q: 'What is the intrinsic rate of the AV junction?', o: ['40–60/min', '60–100/min', '20–40/min', '100–150/min'], a: 0, why: 'The AV junction fires at 40–60/min when higher pacemakers fail.' },
        { q: 'What is the intrinsic rate of the ventricles?', o: ['20–40/min', '40–60/min', '60–100/min', '150–250/min'], a: 0, why: 'A ventricular escape (idioventricular) rhythm runs at 20–40/min.' },
        { q: 'What mainly causes depolarization of a cardiac cell?', o: ['Rapid movement of sodium into the cell', 'Potassium moving into the cell', 'Calcium leaving the cell', 'Oxygen entering the cell'], a: 0, why: 'Sodium rushing in makes the inside of the cell positive. Potassium leaving the cell restores the resting state during repolarization.' },
        { q: 'What effect does vagal (parasympathetic) stimulation have?', o: ['Slows the SA node and AV conduction', 'Speeds up the SA node', 'Widens the QRS', 'Causes ventricular fibrillation'], a: 0, why: 'The vagus nerve slows the SA node and conduction through the AV node.' },
        { q: 'The monitor shows an organized rhythm, but the patient has no pulse. What is this?', o: ['Pulseless electrical activity (PEA)', 'Normal sinus rhythm', 'Asystole', 'Artifact'], a: 0, why: 'Electrical activity without mechanical function is PEA. Start CPR and look for reversible causes.' },
        { q: 'What is an escape beat?', o: ['A late beat from a lower pacemaker after a higher one fails', 'An early beat from an irritable focus', 'A beat caused by artifact', 'A beat from an implanted pacemaker'], a: 0, why: 'Escape beats come late and are protective. Premature beats come early.' },
        { q: 'What do the Purkinje fibers do?', o: ['Spread the impulse rapidly through the ventricular muscle', 'Delay the impulse between atria and ventricles', 'Start each heartbeat', 'Repolarize the atria'], a: 0, why: 'The Purkinje network distributes the impulse quickly, producing a narrow QRS.' },
        { q: 'Conductivity is the ability of a cardiac cell to:', o: ['Pass an impulse on to neighboring cells', 'Start an impulse on its own', 'Contract', 'Respond to an impulse'], a: 0, why: 'Conductivity is about transmitting the impulse. Automaticity starts it, excitability responds to it and contractility is the mechanical response.' },
        { q: 'Where is the SA node located?', o: ['High in the right atrium', 'In the interventricular septum', 'At the apex of the left ventricle', 'Between the left atrium and left ventricle'], a: 0, why: 'The SA node sits in the upper right atrium near the superior vena cava.' }
      ]
    },

    /* ================================================================ 2 */
    {
      id: 'paper', title: 'ECG Paper, Waves and Leads', color: '#1b7a8c', icon: 'caliper',
      summary: 'Measuring time on the paper, the meaning of each wave, 3-lead placement and how to spot artifact.',
      lessons: [
        { id: 'grid', title: 'Reading the ECG paper', min: 6, blocks: [
          ['p', 'ECG paper is a grid. <b>Time</b> runs horizontally and <b>voltage</b> runs vertically. At the standard speed of <b>25 millimeters per second</b>, every box stands for a fixed amount of time.'],
          ['html', PAPER, 'One small box is 0.04 seconds. One large box, made of five small boxes, is 0.20 seconds. Five large boxes make one second, and thirty large boxes make a six-second strip.'],
          ['p', 'Vertically, the standard calibration is <b>10 millimeters per millivolt</b> — two large boxes tall. Most monitors print a small hash mark every 3 seconds at the top of the strip, so two marks span a 6-second strip.'],
          ['strip', 'nsr', { caption: 'Turn on Calipers and drag across the strip: the tool shows the time in seconds and in small boxes.' }],
          ['kc', { q: 'At 25 mm/s, how long is one large box?', o: ['0.20 s', '0.04 s', '0.10 s', '1 s'], a: 0, why: 'A large box is 5 small boxes × 0.04 s = 0.20 s.' }]
        ] },
        { id: 'waves', title: 'Waves, segments and intervals', min: 8, blocks: [
          ['p', 'Each part of the ECG complex matches a specific electrical event. Learn these, and every rhythm becomes a matter of asking which part is missing, early, late or abnormal.'],
          ['anatomy'],
          ['list', [
            'The <b>P wave</b> is atrial depolarization. In Lead II it is small, rounded and upright.',
            'The <b>PR interval</b> runs from the start of the P wave to the start of the QRS. It reflects the time from atrial depolarization through the AV node — normally <b>0.12 to 0.20 seconds</b>, three to five small boxes.',
            'The <b>QRS complex</b> is ventricular depolarization. Normally it is <b>less than 0.12 seconds</b> — under three small boxes.',
            'The <b>ST segment</b> runs from the end of the QRS to the start of the T wave. It should sit on the baseline.',
            'The <b>T wave</b> is ventricular repolarization. Atrial repolarization is hidden inside the QRS.',
            'The <b>QT interval</b> runs from the start of the QRS to the end of the T wave. It is usually less than half the R-to-R interval.'
          ]],
          ['html', VALUES],
          ['kc', { q: 'What does the QRS complex represent?', o: ['Ventricular depolarization', 'Atrial depolarization', 'Ventricular repolarization', 'The delay at the AV node'], a: 0, why: 'The QRS is ventricular depolarization. The P wave is atrial depolarization and the T wave is ventricular repolarization.' }]
        ] },
        { id: 'leads', title: '3-lead placement', min: 6, blocks: [
          ['p', 'A 3-lead monitor uses three electrodes to create three views of the heart: Leads I, II and III. Each lead has a positive and a negative electrode. A wave moving toward the positive electrode is drawn upright.'],
          ['leadsvg'],
          ['html', LEADS, 'The white electrode goes on the right, below the clavicle. The black electrode goes on the left, below the clavicle. The red electrode goes on the left lower torso. Lead two runs from the right arm, negative, to the left leg, positive.'],
          ['callout', '<b>Memory aid:</b> “White on the right, smoke (black) over fire (red).”'],
          ['p', '<b>Lead II</b> runs in the same direction as normal conduction, so it usually shows the clearest P waves and tallest R waves. That makes it the standard monitoring lead. Switch leads whenever you are unsure — a finding that is hard to see in one lead may be obvious in another.'],
          ['strip', 'nsr', { lead: 'All', caption: 'The same heartbeat seen through Leads I, II and III.' }],
          ['note', 'A 3-lead ECG is for <b>rhythm</b> monitoring only. It cannot rule out a heart attack — acquire a 12-lead ECG for chest pain or suspected acute coronary syndrome.'],
          ['kc', { q: 'Why is Lead II the standard monitoring lead?', o: ['It parallels normal conduction, giving clear upright P waves and tall R waves', 'It is the only lead that shows the QRS', 'It detects STEMI in all areas of the heart', 'It needs only one electrode'], a: 0, why: 'Lead II looks along the normal path of conduction (right arm toward left leg), so P waves and QRS complexes are upright and easy to see.' }]
        ] },
        { id: 'artifact', title: 'Artifact and troubleshooting', min: 5, blocks: [
          ['p', '<b>Artifact</b> is anything on the ECG that does not come from the heart. It can hide a real rhythm or imitate a dangerous one, so you must recognize it.'],
          ['list', [
            '<b>Patient movement, shivering or tremor</b> — fuzzy, irregular baseline.',
            '<b>Loose, dried-out or poorly placed electrodes</b> — wandering or flat-line segments.',
            '<b>Electrical interference</b> (60-cycle) — a thick, regular, fine-tooth baseline.',
            '<b>Breathing and vehicle motion</b> — a baseline that drifts up and down.'
          ]],
          ['strip', 'nsr', { artifact: true, caption: 'Sinus rhythm with artifact. Press New strip to see different kinds of interference.' }],
          ['h', 'Troubleshooting'],
          ['list', [
            'Prepare the skin: dry it, clip hair, and use fresh electrodes.',
            'Place electrodes over bone rather than large muscles.',
            'Check cable connections and ask the patient to stay still.',
            'Confirm a worrying rhythm in a second lead.'
          ]],
          ['callout', '<b>Treat the patient, not the monitor.</b> A patient who is awake and talking is not in ventricular fibrillation, whatever the screen shows.'],
          ['kc', { q: 'The monitor suddenly shows a chaotic waveform, but your patient is awake and talking. What should you do first?', o: ['Assess the patient and check the electrodes and leads', 'Defibrillate immediately', 'Give amiodarone', 'Start chest compressions'], a: 0, why: 'A conscious, talking patient is perfusing. This is artifact until proven otherwise — check the patient and the equipment.' }]
        ] }
      ],
      bank: [
        { q: 'What does the P wave represent?', o: ['Atrial depolarization', 'Ventricular depolarization', 'Ventricular repolarization', 'AV node delay'], a: 0, why: 'The P wave is the impulse spreading through the atria.' },
        { q: 'What does the T wave represent?', o: ['Ventricular repolarization', 'Atrial repolarization', 'Ventricular depolarization', 'Atrial depolarization'], a: 0, why: 'The T wave is ventricular repolarization. Atrial repolarization is hidden in the QRS.' },
        { q: 'What is the normal duration of the QRS complex?', o: ['Less than 0.12 s', '0.12–0.20 s', 'More than 0.20 s', 'Exactly 0.40 s'], a: 0, why: 'A normal QRS is under 0.12 s (fewer than 3 small boxes).' },
        { q: 'What is the normal PR interval?', o: ['0.12–0.20 s', 'Less than 0.12 s', '0.20–0.40 s', '0.04–0.10 s'], a: 0, why: 'The normal PR interval is 0.12–0.20 s, or 3–5 small boxes.' },
        { q: 'At 25 mm/s, one small box equals:', o: ['0.04 s', '0.20 s', '0.10 s', '1 s'], a: 0, why: 'Each 1-mm small box is 0.04 s.' },
        { q: 'How many large boxes make a 6-second strip?', o: ['30', '6', '15', '60'], a: 0, why: 'Five large boxes make 1 second, so 30 large boxes make 6 seconds.' },
        { q: 'For Lead II, which electrodes are negative and positive?', o: ['RA negative, LL positive', 'LA negative, LL positive', 'RA negative, LA positive', 'LL negative, RA positive'], a: 0, why: 'Lead II runs from the right arm (negative) to the left leg (positive).' },
        { q: 'Where is the white (RA) electrode placed?', o: ['Right arm or below the right clavicle', 'Left lower torso', 'Below the left clavicle', 'Center of the chest'], a: 0, why: '“White on the right.”' },
        { q: 'A thick, regular, fine-tooth baseline is most likely caused by:', o: ['Electrical (60-cycle) interference', 'Atrial fibrillation', 'Ventricular fibrillation', 'A dead battery in a pacemaker'], a: 0, why: 'Nearby electrical equipment can produce regular 60-cycle interference.' },
        { q: 'A 3-lead ECG can be used to:', o: ['Monitor the heart rhythm', 'Rule out a STEMI', 'Locate the area of a heart attack', 'Measure cardiac output'], a: 0, why: 'A 3-lead is for rhythm monitoring. A 12-lead is needed to evaluate for STEMI.' }
      ]
    },

    /* ================================================================ 3 */
    {
      id: 'approach', title: 'The Systematic Approach', color: '#0f766e', icon: 'search',
      summary: 'The five questions for every strip, calculating heart rate, and naming what you see.',
      lessons: [
        { id: 'steps', title: 'Five questions for every strip', min: 5, blocks: [
          ['p', 'Experienced clinicians do not guess a rhythm at a glance. They ask the same five questions every time, in the same order. This habit stops you from missing a hidden P wave or a dropped beat.'],
          ['html', STEPS, 'One: what is the rate? Two: is the rhythm regular? Three: are there P waves, and is there one before every Q R S? Four: what is the P R interval? Five: is the Q R S narrow or wide?'],
          ['p', 'A <b>narrow QRS</b> means the impulse started above the ventricles and used the normal conduction pathway. A <b>wide QRS</b> means the impulse started in the ventricles, or traveled through them abnormally.'],
          ['callout', 'After the five steps, <b>look at the patient</b>: pulse, perfusion, mental status and blood pressure. Your treatment decisions depend on how the patient is tolerating the rhythm.'],
          ['kc', { q: 'A rhythm has a QRS of 0.16 s. What does this suggest?', o: ['A ventricular origin or abnormal conduction through the ventricles', 'A normal sinus impulse', 'A junctional rhythm with normal conduction', 'Atrial flutter'], a: 0, why: 'A QRS of 0.12 s or more is wide — the impulse is spreading slowly through the ventricles.' }]
        ] },
        { id: 'rate', title: 'Calculating heart rate', min: 10, blocks: [
          ['p', 'Rate is the first question. You can calculate it three ways, and you should know when each one works.'],
          ['html', RATE_METHODS, 'The six-second method counts the Q R S complexes in six seconds and multiplies by ten. It works for regular and irregular rhythms. The three hundred method divides three hundred by the number of large boxes between R waves. The fifteen hundred method divides fifteen hundred by the number of small boxes. Those two work only for regular rhythms.'],
          ['p', 'In the field, the <b>6-second method</b> is the go-to: it is fast and works for irregular rhythms. Memorize the 300 sequence — <b>300, 150, 100, 75, 60, 50</b> — for a quick estimate of a regular rhythm.'],
          ['p', 'Try it now. Estimate the rate of each strip, then check your answer. Use the calipers if they help.'],
          ['rate'],
          ['kc', { q: 'A 6-second strip contains 8 QRS complexes. What is the heart rate?', o: ['80/min', '48/min', '60/min', '100/min'], a: 0, why: '8 complexes × 10 = 80/min.' }]
        ] },
        { id: 'regularity', title: 'Regularity, P waves and the PR interval', min: 8, blocks: [
          ['p', 'Next, look at the spacing of the R waves. A rhythm can be <b>regular</b>, <b>regularly irregular</b> (there is a repeating pattern), or <b>irregularly irregular</b> (no pattern at all). Compare the examples below.'],
          ['compare', [
            ['nsr', 'Regular — every R-to-R interval is the same.'],
            ['bigeminy', 'Regularly irregular — the irregularity repeats in a predictable pattern.'],
            ['afib', 'Irregularly irregular — no pattern at all. Think atrial fibrillation.']
          ]],
          ['p', 'Then find the P waves and measure the PR interval. Are the P waves upright and identical? Is the PR normal, long, shortened or changing? The examples below show the patterns you will meet.'],
          ['compare', [
            ['nsr', 'Upright P before every QRS, normal PR, narrow QRS.'],
            ['firstDeg', 'P before every QRS, but the PR is longer than 0.20 seconds.'],
            ['junctEscape', 'P waves inverted or hidden — the impulse starts in the AV junction.'],
            ['idio', 'No P waves and a wide QRS — the ventricles are pacing the heart.']
          ]],
          ['h', 'Naming the rhythm'],
          ['p', 'Name the underlying rhythm first, then add anything extra. For example: “Sinus rhythm with first-degree AV block and occasional PVCs.” Include the rate when you report it.'],
          ['kc', { q: 'There are more P waves than QRS complexes. What should you suspect?', o: ['An AV block', 'Sinus tachycardia', 'Ventricular fibrillation', 'Artifact only'], a: 0, why: 'Extra P waves that are not followed by a QRS mean some impulses are not getting through the AV node — an AV block.' }]
        ] }
      ],
      bank: [
        { q: 'A 6-second strip has 7 QRS complexes. What is the rate?', o: ['70/min', '42/min', '60/min', '77/min'], a: 0, why: '7 × 10 = 70/min.' },
        { q: 'Which rate method works best for an irregular rhythm?', o: ['6-second method', '300 (large-box) method', '1500 (small-box) method', 'Counting one R–R interval'], a: 0, why: 'Only the 6-second method averages the beats over time, so it works for irregular rhythms.' },
        { q: 'There are 3 large boxes between R waves in a regular rhythm. What is the rate?', o: ['100/min', '150/min', '75/min', '60/min'], a: 0, why: '300 ÷ 3 = 100/min.' },
        { q: 'There are 4 large boxes between R waves in a regular rhythm. What is the rate?', o: ['75/min', '60/min', '100/min', '50/min'], a: 0, why: '300 ÷ 4 = 75/min.' },
        { q: 'There are 15 small boxes between R waves in a regular rhythm. What is the rate?', o: ['100/min', '150/min', '75/min', '60/min'], a: 0, why: '1500 ÷ 15 = 100/min.' },
        { q: '“Irregularly irregular” means:', o: ['The R–R intervals vary with no pattern', 'The rhythm speeds up and slows down with breathing', 'Every other beat is early', 'The rhythm is regular but fast'], a: 0, why: 'No pattern at all — the classic finding in atrial fibrillation.' },
        { q: 'A wide QRS is one that measures:', o: ['0.12 s or more', 'More than 0.20 s', 'Less than 0.12 s', 'More than 0.04 s'], a: 0, why: 'A QRS of 0.12 s (3 small boxes) or more is wide.' },
        { q: 'A heart rate under 60/min is called:', o: ['Bradycardia', 'Tachycardia', 'Normal', 'Fibrillation'], a: 0, why: 'Bradycardia is under 60/min; tachycardia is over 100/min.' },
        { q: 'What should you do before treating any rhythm on the monitor?', o: ['Assess the patient’s pulse and perfusion', 'Print a 30-second strip', 'Change to Lead III', 'Give oxygen to every patient'], a: 0, why: 'Treat the patient, not the monitor. Correlate every rhythm with the clinical picture.' },
        { q: 'Which steps best help you identify an AV block?', o: ['The P waves and the PR interval', 'The QRS width only', 'The rate only', 'The T wave shape'], a: 0, why: 'AV blocks are about the relationship between P waves and QRS complexes — look at the P waves and the PR.' }
      ]
    },

    /* ================================================================ 4 */
    {
      id: 'sinus', title: 'Sinus Rhythms', color: '#3a9b3f', icon: 'heart', module: 'sinus',
      summary: 'Normal sinus rhythm, sinus bradycardia and tachycardia, sinus arrhythmia and sinus arrest.',
      lessons: [
        { id: 'basics', title: 'Normal sinus, bradycardia and tachycardia', min: 8, blocks: [
          ['p', 'Every sinus rhythm shares the same features in Lead II: an <b>upright, uniform P wave before every QRS</b>, a <b>normal, constant PR interval</b>, and a <b>narrow QRS</b>. What changes between them is the <b>rate</b> and the <b>regularity</b>.'],
          ['p', 'Explore each rhythm below. The narration walks through each one in turn; press New strip to see more examples.'],
          ['rhythms', ['nsr', 'sbrady', 'stach']],
          ['kc', { q: 'A hypovolemic trauma patient has sinus tachycardia at 140/min. What is the right approach?', o: ['Treat the cause — control bleeding and support perfusion', 'Give adenosine', 'Perform synchronized cardioversion', 'Give a beta blocker'], a: 0, why: 'Sinus tachycardia is a response to something. Find and treat the cause; never cardiovert or give adenosine for it.' }]
        ] },
        { id: 'irregular', title: 'Sinus arrhythmia and sinus arrest', min: 6, blocks: [
          ['p', 'Two sinus rhythms are irregular. In <b>sinus arrhythmia</b> the rate rises and falls with breathing. In <b>sinus arrest</b> the SA node simply stops firing for a moment, leaving a pause.'],
          ['rhythms', ['sarrhythmia', 'sarrest']],
          ['kc', { q: 'Sinus arrhythmia usually varies with:', o: ['Breathing', 'Blood pressure', 'Body temperature', 'Blood glucose'], a: 0, why: 'The rate speeds up on inspiration and slows on expiration. It is common and normal in children and young adults.' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 5, practice: true, blocks: [
          ['p', 'Put it together. Identify each strip using the five steps, then check your answer. These strips are unlimited and not scored — complete at least three to finish the lesson.'],
          ['practice', ['nsr', 'sbrady', 'stach', 'sarrhythmia', 'sarrest']]
        ] }
      ],
      bank: [
        { q: 'What is the rate of normal sinus rhythm?', o: ['60–100/min', '40–60/min', '100–150/min', '20–40/min'], a: 0, why: 'A sinus rhythm at 60–100/min is normal sinus rhythm.' },
        { q: 'Which drug is first-line for symptomatic sinus bradycardia in adults?', o: ['Atropine', 'Adenosine', 'Amiodarone', 'Diltiazem'], a: 0, why: 'Atropine is first-line, with pacing or a chronotropic infusion if it fails (per protocol).' },
        { q: 'What separates sinus arrhythmia from wandering atrial pacemaker?', o: ['In sinus arrhythmia all P waves look the same', 'Sinus arrhythmia has no P waves', 'Sinus arrhythmia has a wide QRS', 'Sinus arrhythmia is always faster than 100'], a: 0, why: 'Sinus arrhythmia comes from one pacemaker, so the P waves are identical. Wandering atrial pacemaker has changing P waves.' },
        { q: 'A narrow, regular rhythm at 170/min with no visible P waves is most likely:', o: ['SVT', 'Sinus tachycardia', 'Sinus arrhythmia', 'Normal sinus rhythm'], a: 0, why: 'Adult sinus tachycardia rarely exceeds 150. Faster than 150 with no visible P waves — think SVT.' },
        { q: 'In sinus arrest, the pause contains:', o: ['No P wave and no QRS', 'A P wave without a QRS', 'A wide QRS', 'Flutter waves'], a: 0, why: 'The SA node fails to fire, so there is neither a P wave nor a QRS during the pause.' },
        { q: 'Which is a common cause of sinus bradycardia?', o: ['Vagal stimulation or beta-blocker use', 'Fever', 'Hypovolemia', 'Anxiety'], a: 0, why: 'Vagal tone, beta blockers, hypoxia, hypothermia and inferior MI can slow the SA node. Fever, hypovolemia and anxiety speed it up.' }
      ]
    },

    /* ================================================================ 5 */
    {
      id: 'atrial', title: 'Atrial Rhythms', color: '#1e88e5', icon: 'atrial', module: 'atrial',
      summary: 'PACs, wandering atrial pacemaker, MAT, atrial flutter, atrial fibrillation and SVT.',
      lessons: [
        { id: 'ectopic', title: 'PACs, wandering pacemaker and MAT', min: 8, blocks: [
          ['p', 'Atrial rhythms start somewhere in the atria other than the SA node. Look for <b>P waves that look different</b> from sinus P waves. Because conduction below the AV node is normal, the QRS is usually <b>narrow</b>.'],
          ['rhythms', ['pac', 'wap', 'mat']],
          ['kc', { q: 'What is typical of a premature atrial contraction (PAC)?', o: ['An early beat with a P wave that looks different', 'A wide, bizarre early beat with no P wave', 'A pause with no P wave or QRS', 'A sawtooth baseline'], a: 0, why: 'A PAC is early and comes from an ectopic atrial focus, so its P wave differs in shape. Look for it in or near the preceding T wave.' }]
        ] },
        { id: 'flutfib', title: 'Atrial flutter and atrial fibrillation', min: 8, blocks: [
          ['p', 'In flutter and fibrillation, normal P waves are replaced by rapid atrial activity. <b>Flutter</b> produces organized sawtooth waves; <b>fibrillation</b> produces a chaotic, wavy baseline with an irregularly irregular ventricular response.'],
          ['rhythms', ['flutter', 'afib']],
          ['kc', { q: 'What is the hallmark of atrial fibrillation?', o: ['Irregularly irregular rhythm with no identifiable P waves', 'Sawtooth flutter waves', 'A regular rhythm at 150/min', 'Inverted P waves before every QRS'], a: 0, why: 'Chaotic atrial activity with an irregularly irregular ventricular response is atrial fibrillation.' }]
        ] },
        { id: 'svt', title: 'Supraventricular tachycardia', min: 6, blocks: [
          ['p', 'SVT is a fast, regular, narrow-complex tachycardia — usually 150 to 250 per minute — with P waves that are hidden or hard to see. It often starts and stops suddenly, and patients typically describe a racing heart.'],
          ['rhythms', ['svt']],
          ['p', 'For a <b>stable</b> patient, try <b>vagal maneuvers</b> first, then <b>adenosine</b> by rapid IV push followed immediately by a saline flush. For an <b>unstable</b> patient, perform <b>synchronized cardioversion</b>. Always follow your local protocol.'],
          ['kc', { q: 'A stable patient is in SVT at 190/min. What is usually tried first?', o: ['Vagal maneuvers', 'Defibrillation', 'Atropine', 'Transcutaneous pacing'], a: 0, why: 'Vagal maneuvers come first for stable SVT, then adenosine if they fail (per protocol).' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 6, practice: true, blocks: [
          ['p', 'Identify each strip. Atrial rhythms can be close together — compare P wave shapes and check the regularity carefully. Complete at least three to finish.'],
          ['practice', ['pac', 'wap', 'mat', 'flutter', 'afib', 'svt']]
        ] }
      ],
      bank: [
        { q: 'Flutter waves are best described as:', o: ['A sawtooth pattern', 'A chaotic wavy baseline', 'Inverted P waves', 'Tall, peaked T waves'], a: 0, why: 'Atrial flutter produces regular sawtooth waves, often at about 300/min, best seen in Leads II and III.' },
        { q: 'Why does atrial fibrillation increase the risk of stroke?', o: ['Clots can form in the poorly contracting atria', 'It causes very high blood pressure', 'It lowers the blood glucose', 'It damages the AV node'], a: 0, why: 'Blood pools in the quivering atria and can clot, then travel to the brain.' },
        { q: 'Multifocal atrial tachycardia has:', o: ['At least 3 different P wave shapes and a rate over 100', 'Sawtooth waves', 'No P waves and a wide QRS', 'A constant PR and identical P waves'], a: 0, why: 'MAT is like wandering atrial pacemaker, but faster than 100/min. It is common in COPD.' },
        { q: 'An unstable patient is in SVT. What is the treatment?', o: ['Synchronized cardioversion', 'Vagal maneuvers only', 'Atropine', 'Observation'], a: 0, why: 'Unstable tachycardia with a pulse needs synchronized cardioversion.' },
        { q: 'How is adenosine given?', o: ['Rapid IV push followed by a fast saline flush', 'Slowly over 10 minutes', 'Intramuscularly', 'By mouth'], a: 0, why: 'Adenosine has a half-life of seconds, so it must be pushed rapidly and flushed immediately.' },
        { q: 'Wandering atrial pacemaker differs from MAT because it:', o: ['Has a rate under 100/min', 'Has a wide QRS', 'Has no P waves', 'Is always regular'], a: 0, why: 'Both have at least 3 P wave shapes. Under 100/min it is wandering atrial pacemaker; over 100/min it is MAT.' }
      ]
    },

    /* ================================================================ 6 */
    {
      id: 'junctional', title: 'Junctional Rhythms', color: '#f08a1c', icon: 'junction', module: 'junctional',
      summary: 'Retrograde P waves, PJCs, and junctional escape, accelerated and tachycardic rhythms.',
      lessons: [
        { id: 'retro', title: 'Retrograde P waves and PJCs', min: 6, blocks: [
          ['p', 'When the AV junction starts the impulse, the atria are depolarized <b>backwards</b> — retrograde. In Lead II that means the P wave is <b>inverted</b> and the PR is <b>short</b> (under 0.12 seconds), the P wave is <b>hidden</b> in the QRS, or an inverted P wave appears <b>after</b> the QRS.'],
          ['p', 'The impulse still travels down the normal pathway into the ventricles, so the QRS stays <b>narrow</b>.'],
          ['rhythms', ['pjc']],
          ['kc', { q: 'In Lead II, a junctional P wave that comes before the QRS is:', o: ['Inverted, with a PR under 0.12 s', 'Upright, with a PR over 0.20 s', 'Sawtooth-shaped', 'Followed by a wide QRS'], a: 0, why: 'Retrograde atrial depolarization produces an inverted P wave with a short PR.' }]
        ] },
        { id: 'rates', title: 'Junctional escape, accelerated and tachycardia', min: 8, blocks: [
          ['p', 'The junction’s intrinsic rate is 40 to 60 per minute. The name of a junctional rhythm depends on its rate: <b>junctional escape</b> at 40 to 60, <b>accelerated junctional</b> at 60 to 100, and <b>junctional tachycardia</b> above 100.'],
          ['rhythms', ['junctEscape', 'accelJunct', 'junctTach']],
          ['kc', { q: 'A narrow rhythm with inverted P waves runs at 82/min. What is it?', o: ['Accelerated junctional rhythm', 'Junctional escape rhythm', 'Junctional tachycardia', 'Normal sinus rhythm'], a: 0, why: 'Junctional features at 60–100/min make it an accelerated junctional rhythm.' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 5, practice: true, blocks: [
          ['p', 'Identify each strip. Look closely at the P waves — inverted, hidden or after the QRS — and use the rate to name the rhythm. Complete at least three to finish.'],
          ['practice', ['pjc', 'junctEscape', 'accelJunct', 'junctTach', 'nsr', 'sbrady']]
        ] }
      ],
      bank: [
        { q: 'What is the rate of a junctional escape rhythm?', o: ['40–60/min', '60–100/min', 'Over 100/min', '20–40/min'], a: 0, why: 'Junctional escape runs at the junction’s intrinsic rate of 40–60/min.' },
        { q: 'Junctional tachycardia has a rate of:', o: ['Over 100/min', '40–60/min', '60–100/min', 'Under 40/min'], a: 0, why: 'A junctional rhythm faster than 100/min is junctional tachycardia.' },
        { q: 'What is the QRS width in a junctional rhythm (without a conduction delay)?', o: ['Narrow', 'Always wide', 'Absent', 'Variable from beat to beat'], a: 0, why: 'The impulse uses the normal pathway below the junction, so the QRS is narrow.' },
        { q: 'Where can the P wave appear in a junctional rhythm?', o: ['Before, during or after the QRS', 'Only before the QRS, upright', 'Only as sawtooth waves', 'Nowhere — junctional rhythms never affect the atria'], a: 0, why: 'Depending on timing, the retrograde P wave can be before (short PR), hidden in, or after the QRS.' },
        { q: 'Which drug toxicity is a classic cause of accelerated junctional rhythm?', o: ['Digoxin', 'Acetaminophen', 'Aspirin', 'Naloxone'], a: 0, why: 'Digoxin toxicity is a classic cause, along with ischemia and inferior MI.' },
        { q: 'A premature junctional contraction (PJC) is:', o: ['An early narrow beat with an inverted, absent or retrograde P wave', 'An early wide beat with no P wave', 'A late beat after a pause', 'A dropped QRS'], a: 0, why: 'A PJC is early, narrow and has the retrograde P wave pattern of the junction.' }
      ]
    },

    /* ================================================================ 7 */
    {
      id: 'ventricular', title: 'Ventricular Rhythms', color: '#e53935', icon: 'bolt', module: 'ventricular',
      summary: 'PVCs, idioventricular rhythms, ventricular tachycardia, torsades, VF and asystole.',
      lessons: [
        { id: 'pvcs', title: 'PVCs and their patterns', min: 8, blocks: [
          ['p', 'Impulses that start in the ventricles spread slowly from cell to cell instead of using the fast conduction system. The result is a <b>wide, bizarre QRS</b> (0.12 seconds or more), <b>no related P wave</b>, and a <b>T wave pointing the opposite way</b> to the QRS.'],
          ['rhythms', ['pvc', 'bigeminy', 'multifocal']],
          ['kc', { q: 'What usually follows a PVC?', o: ['A full compensatory pause', 'A P wave with a long PR', 'Atrial fibrillation', 'Nothing — the next beat comes early'], a: 0, why: 'The SA node keeps its timing, so the beat after a PVC arrives on schedule — the pause is fully compensatory.' }]
        ] },
        { id: 'escape', title: 'Idioventricular rhythm and AIVR', min: 6, blocks: [
          ['p', 'When the SA node and the junction both fail, the ventricles take over at 20 to 40 per minute — an <b>idioventricular rhythm</b>. An <b>accelerated idioventricular rhythm (AIVR)</b> runs at 40 to 100, often after the blood flow to the heart is restored.'],
          ['rhythms', ['idio', 'aivr']],
          ['callout', 'Never try to suppress an escape rhythm with an antiarrhythmic. It may be the only thing keeping the heart beating.'],
          ['kc', { q: 'Why should you not give amiodarone or lidocaine for an idioventricular escape rhythm?', o: ['It may abolish the only pacemaker and cause asystole', 'It will convert the rhythm to sinus tachycardia', 'It narrows the QRS', 'It only works in children'], a: 0, why: 'An escape rhythm is protective. Suppressing it can leave no pacemaker at all.' }]
        ] },
        { id: 'vt', title: 'Ventricular tachycardia and torsades', min: 8, blocks: [
          ['p', 'Three or more PVCs in a row is a run of <b>ventricular tachycardia</b>. VT is a wide-complex, usually regular tachycardia above 100 per minute. The patient may be stable, unstable or pulseless.'],
          ['rhythms', ['vt', 'torsades']],
          ['p', 'Pulseless VT is treated exactly like ventricular fibrillation: CPR and immediate <b>defibrillation</b>. VT with a pulse but signs of instability needs <b>synchronized cardioversion</b>. Torsades de pointes is treated with <b>magnesium sulfate</b>.'],
          ['kc', { q: 'Your patient is in VT and has no pulse. What is the treatment?', o: ['CPR and defibrillation', 'Synchronized cardioversion', 'Adenosine', 'Vagal maneuvers'], a: 0, why: 'Pulseless VT is a shockable cardiac arrest rhythm — start CPR and defibrillate.' }]
        ] },
        { id: 'arrest', title: 'Ventricular fibrillation and asystole', min: 6, blocks: [
          ['p', 'These are cardiac arrest rhythms. Recognize them in seconds — then confirm the patient is pulseless and act.'],
          ['rhythms', ['vf', 'asystole']],
          ['p', '<b>Ventricular fibrillation</b> is shockable: start CPR and defibrillate as soon as possible. <b>Asystole</b> is not shockable: confirm it in a second lead and check that the gain and electrodes are correct, then continue CPR and give epinephrine per protocol.'],
          ['kc', { q: 'The monitor shows a flat line. What should you do before calling it asystole?', o: ['Confirm in a second lead and check the leads and gain', 'Defibrillate immediately', 'Give atropine', 'Start synchronized cardioversion'], a: 0, why: 'A loose lead or low gain can mimic asystole, and fine VF can look flat. Confirm before you treat.' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 8, practice: true, blocks: [
          ['p', 'Identify each strip. For wide-complex rhythms, look at the rate and regularity, and ask whether this patient would have a pulse. Complete at least three to finish.'],
          ['practice', ['pvc', 'bigeminy', 'multifocal', 'idio', 'aivr', 'vt', 'torsades', 'vf', 'asystole']]
        ] }
      ],
      bank: [
        { q: 'What is the rate of an idioventricular rhythm?', o: ['20–40/min', '40–60/min', '60–100/min', 'Over 150/min'], a: 0, why: 'The ventricles’ intrinsic rate is 20–40/min.' },
        { q: 'Bigeminy means:', o: ['Every other beat is a PVC', 'Two PVCs in a row', 'PVCs with two shapes', 'A PVC every third beat'], a: 0, why: 'In bigeminy, a PVC follows every normal beat.' },
        { q: 'Which drug is used for torsades de pointes?', o: ['Magnesium sulfate', 'Adenosine', 'Atropine', 'Diltiazem'], a: 0, why: 'Magnesium is the treatment for torsades (polymorphic VT with a long QT).' },
        { q: 'Which arrest rhythm is shockable?', o: ['Ventricular fibrillation', 'Asystole', 'PEA', 'Idioventricular rhythm with no pulse'], a: 0, why: 'VF and pulseless VT are shockable. Asystole and PEA are not.' },
        { q: 'AIVR is commonly seen:', o: ['After blood flow to the heart is restored (reperfusion)', 'In healthy athletes at rest', 'Only in children', 'During vagal maneuvers'], a: 0, why: 'AIVR is a classic reperfusion rhythm and is usually short-lived and well tolerated.' },
        { q: 'Multifocal PVCs are:', o: ['PVCs with different shapes from more than one focus', 'PVCs that all look the same', 'PVCs that occur every other beat', 'PVCs that land on the T wave'], a: 0, why: 'Different shapes mean more than one irritable focus — a sign of a more irritable heart.' }
      ]
    },

    /* ================================================================ 8 */
    {
      id: 'blocks', title: 'AV Blocks', color: '#7b4bc4', icon: 'block', module: 'blocks',
      summary: 'First-degree, Wenckebach, Mobitz II, 2:1 and complete heart block.',
      lessons: [
        { id: 'first', title: 'First-degree and Wenckebach', min: 8, blocks: [
          ['p', 'AV blocks are all about the <b>relationship between P waves and QRS complexes</b>. March out the P waves first — they are usually regular. Then ask: is the PR constant or changing, and does every P wave produce a QRS?'],
          ['rhythms', ['firstDeg', 'wenck']],
          ['kc', { q: 'Which PR pattern defines second-degree type I (Wenckebach)?', o: ['The PR lengthens progressively until a QRS is dropped', 'The PR is constant, then a QRS is suddenly dropped', 'The PR is long but constant with no dropped beats', 'There is no relationship between P waves and QRS complexes'], a: 0, why: '“Longer, longer, longer, drop — then you have a Wenckebach.”' }]
        ] },
        { id: 'second', title: 'Mobitz II and 2:1 block', min: 8, blocks: [
          ['p', 'In <b>Mobitz II</b> the PR stays the same, then a P wave suddenly fails to conduct. The block is below the AV node and can progress to complete heart block without warning. In a <b>2:1 block</b>, every other P wave is blocked.'],
          ['rhythms', ['mobitz2', 'twoToOne']],
          ['kc', { q: 'What is the priority for a patient in Mobitz II?', o: ['Apply pacing pads and be ready to pace', 'Give adenosine', 'Defibrillate', 'No treatment is needed'], a: 0, why: 'Mobitz II can progress suddenly to third-degree block. Pacing is the definitive prehospital treatment if the patient is symptomatic.' }]
        ] },
        { id: 'third', title: 'Third-degree (complete) block', min: 6, blocks: [
          ['p', 'In <b>complete heart block</b>, no impulses get through. The atria and ventricles beat independently. The P waves march through at their own rate, and the ventricles are paced by a slow escape rhythm.'],
          ['rhythms', ['chb']],
          ['callout', 'Symptomatic complete heart block needs <b>transcutaneous pacing</b>. Atropine is unlikely to work, especially when the escape rhythm is wide.'],
          ['kc', { q: 'What is the hallmark of third-degree AV block?', o: ['Regular P waves and a regular QRS rhythm that are unrelated to each other', 'A long but constant PR interval', 'Progressive PR lengthening', 'An irregularly irregular rhythm with no P waves'], a: 0, why: 'AV dissociation: P waves and QRS complexes each keep their own regular rate, with no relationship between them.' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 6, practice: true, blocks: [
          ['p', 'Identify each block. Use the calipers to march out the P waves and measure each PR interval. Complete at least three to finish.'],
          ['practice', ['firstDeg', 'wenck', 'mobitz2', 'twoToOne', 'chb']]
        ] }
      ],
      bank: [
        { q: 'First-degree AV block is defined by:', o: ['A PR over 0.20 s that stays constant', 'Dropped QRS complexes', 'A PR under 0.12 s', 'No P waves'], a: 0, why: 'Every impulse is conducted, but each one is delayed.' },
        { q: 'Which AV block is most likely to progress suddenly to complete heart block?', o: ['Second-degree type II (Mobitz II)', 'First-degree', 'Second-degree type I (Wenckebach)', 'Sinus arrhythmia'], a: 0, why: 'Mobitz II is a block below the AV node and is unstable.' },
        { q: 'In a 2:1 AV block, how many P waves are there for each QRS?', o: ['2', '1', '3', 'None'], a: 0, why: 'Every other P wave is blocked, so there are two P waves for each QRS.' },
        { q: 'In complete heart block, the PR interval is:', o: ['Completely variable — there is no relationship', 'Constant and long', 'Progressively lengthening', 'Short and constant'], a: 0, why: 'The atria and ventricles beat independently, so the PR changes randomly.' },
        { q: 'Wenckebach often shows which pattern?', o: ['Grouped beating', 'A sawtooth baseline', 'Wide bizarre complexes', 'A flat line'], a: 0, why: 'The repeating cycle of lengthening PR and a dropped beat produces grouped beating.' },
        { q: 'What is the definitive prehospital treatment for symptomatic third-degree block?', o: ['Transcutaneous pacing', 'Adenosine', 'Vagal maneuvers', 'Defibrillation'], a: 0, why: 'Pacing is the priority. Atropine is often ineffective, especially with a wide escape rhythm.' }
      ]
    },

    /* ================================================================ 9 */
    {
      id: 'paced', title: 'Pacemaker Rhythms', color: '#16838f', icon: 'pacer', module: 'paced',
      summary: 'Ventricular and dual-chamber pacing, capture, and pacemaker malfunction.',
      lessons: [
        { id: 'paced', title: 'Paced rhythms and capture', min: 6, blocks: [
          ['p', 'A pacemaker produces a sharp, narrow vertical <b>pacer spike</b>. A spike followed by a P wave means <b>atrial capture</b>; a spike followed by a <b>wide QRS</b> means <b>ventricular capture</b>. A paced QRS is wide because the impulse starts in the ventricle.'],
          ['rhythms', ['vpaced', 'avpaced']],
          ['kc', { q: 'A pacer spike followed by a wide QRS means:', o: ['Ventricular capture', 'Failure to capture', 'Atrial capture only', 'Failure to sense'], a: 0, why: 'The ventricles depolarized in response to the spike — that is ventricular capture.' }]
        ] },
        { id: 'failure', title: 'Pacemaker malfunction', min: 6, blocks: [
          ['p', 'There are three main kinds of pacemaker malfunction. <b>Failure to capture</b>: the spike appears but no complex follows. <b>Failure to pace</b>: no spike appears when one is expected. <b>Failure to sense</b>: the pacemaker fires even though the heart has just beaten on its own.'],
          ['rhythms', ['failCapture']],
          ['note', 'For a symptomatic patient with a failing pacemaker, treat the bradycardia per protocol — usually transcutaneous pacing. Place the pads at least several centimeters away from the device.'],
          ['kc', { q: 'A pacer spike appears but is not followed by a QRS. What is this?', o: ['Failure to capture', 'Failure to pace', 'Normal ventricular pacing', 'Failure to sense'], a: 0, why: 'The pacemaker fired, but the heart did not respond — failure to capture.' }]
        ] },
        { id: 'practice', title: 'Practice strips', min: 5, practice: true, blocks: [
          ['p', 'Identify each paced rhythm. Look for spikes, then check that each one is followed by a complex. Complete at least three to finish.'],
          ['practice', ['vpaced', 'avpaced', 'failCapture', 'idio', 'chb']]
        ] }
      ],
      bank: [
        { q: 'Why is a ventricular paced QRS wide?', o: ['The impulse starts in the ventricle and spreads slowly', 'The pacemaker battery is low', 'The atria are blocked', 'It is always artifact'], a: 0, why: 'Like a PVC, a paced beat starts in the ventricular muscle rather than using the fast conduction system.' },
        { q: 'A dual-chamber (AV sequential) paced rhythm shows:', o: ['Two spikes per beat — one before the P wave and one before the QRS', 'One spike before every P wave only', 'No spikes', 'Spikes with no complexes'], a: 0, why: 'The device paces the atria, waits a programmed delay, then paces the ventricles.' },
        { q: 'Failure to pace means:', o: ['No pacer spike when one is expected', 'A spike without a following complex', 'A spike that lands on a T wave', 'A narrow paced QRS'], a: 0, why: 'The pacemaker did not fire at all when it should have.' },
        { q: 'How should you confirm mechanical capture in a paced patient?', o: ['Feel for a pulse that matches the paced rate', 'Look at the QRS width only', 'Increase the monitor gain', 'Switch to Lead I'], a: 0, why: 'Electrical capture on the monitor must be confirmed with a matching palpable pulse.' },
        { q: 'Where should defibrillation or pacing pads go in a patient with an implanted pacemaker?', o: ['At least several centimeters away from the device', 'Directly over the device', 'On the abdomen', 'It does not matter'], a: 0, why: 'Placing pads directly over the generator can damage the device and reduce current delivery.' },
        { q: 'Failure to sense means the pacemaker:', o: ['Fires even though the heart has just beaten on its own', 'Does not fire at all', 'Fires but does not capture', 'Paces both chambers'], a: 0, why: 'The device does not “see” the patient’s own beats, so it fires inappropriately.' }
      ]
    }
  ];

  global.ECGCourse = {
    UNITS: UNITS,
    PASS: 80,
    EXAM: { concept: 10, strips: 15 },
    unitById: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0]; }
  };
})(window);

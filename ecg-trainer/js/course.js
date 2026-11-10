/*
 * CSHealthED ECG Trainer — self-paced Basic ECG Interpretation course content.
 *
 * Units contain lessons; each lesson is a list of blocks rendered by app.js.
 * Teaching blocks (narrated):
 *   ['p', html]  ['h', text]  ['list', [html, ...]]  ['callout', html]  ['note', html]
 *   ['html', html, speech]          static figure or table, narrated with `speech` if given
 *   ['anatomy']                     labeled cardiac cycle drawn by the app
 *   ['leadsvg', speech]             3-lead placement illustration, narrated with `speech`
 *   ['strip', rhythm, {lead, artifact, caption}]
 *   ['compare', [[rhythm, caption], ...]]   one strip, tabbed examples
 *   ['rhythms', [rhythm, ...]]      rhythm explorer: strip + criteria, tips and care
 * Activities (each must be finished before the lesson can be completed):
 *   ['kc', {q, o, a, why}]          knowledge check (o[a] is correct)
 *   ['match', {title, prompt, pairs: [[term, answer], ...]}]
 *   ['order', {title, prompt, items: [first, ..., last]}]
 *   ['sort', {title, prompt, buckets: [...], items: [[text, bucket], ...]}]
 *   ['classify', {title, prompt, options: [...], items: {rhythm: option}, n}]   live strips
 *   ['drill', {title, kind: 'boxes' | 'rate'}]          generated calculation problems
 *   ['measure', {title, what: 'pr' | 'rr', pool: [...]}] caliper measurement on live strips
 *   ['walk', [rhythm, ...]]         guided five-step worksheet on live strips
 *   ['rate']                        rate estimation on live strips
 *   ['practice', [rhythm, ...]]     unlimited strip identification
 *   ['case', {title, text, vitals, rhythm, qs: [{q, o, a, why}]}]   patient scenario
 *
 * Question banks use {q, o, a, why, see}; `see` names the lesson that teaches the
 * answer and is linked from quiz feedback. Options are shuffled when shown.
 * Clinical notes are general guidance — learners follow local protocols.
 */
(function (global) {
  'use strict';

  // Bank question: the first option is the correct one; `see` = lesson id in this unit.
  function Q(see, q, o, why) { return { see: see, q: q, o: o, a: 0, why: why }; }

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


  var UNSTABLE = '<div class="normal-values">' +
    '<div class="nv"><b>Hypotension</b><span>Low blood pressure or signs of shock</span></div>' +
    '<div class="nv"><b>Altered mental status</b><span>New confusion, drowsiness or syncope</span></div>' +
    '<div class="nv"><b>Ischemic chest pain</b><span>Chest discomfort from poor coronary perfusion</span></div>' +
    '<div class="nv"><b>Acute heart failure</b><span>Shortness of breath, crackles, pulmonary edema</span></div></div>';
  var TABLE_STYLE = ' class="criteria compare-table"';
  var EARLY_BEATS = '<div class="table-scroll"><table' + TABLE_STYLE + '><tr><th></th><th>PAC</th><th>PJC</th><th>PVC</th></tr>' +
    '<tr><th>Origin</th><td>Atria</td><td>AV junction</td><td>Ventricles</td></tr>' +
    '<tr><th>P wave</th><td>Upright but different shape</td><td>Inverted, hidden or after the QRS</td><td>None related to the beat</td></tr>' +
    '<tr><th>QRS</th><td>Narrow</td><td>Narrow</td><td>Wide and bizarre</td></tr>' +
    '<tr><th>Pause after</th><td>Usually non-compensatory</td><td>Usually non-compensatory</td><td>Usually fully compensatory</td></tr></table></div>';
  var IRREG_NARROW = '<div class="table-scroll"><table' + TABLE_STYLE + '><tr><th></th><th>Atrial fibrillation</th><th>MAT</th><th>Flutter (variable block)</th><th>Sinus arrhythmia</th></tr>' +
    '<tr><th>P waves</th><td>None — wavy baseline</td><td>3 or more shapes, one before each QRS</td><td>Sawtooth flutter waves</td><td>Identical, one before each QRS</td></tr>' +
    '<tr><th>Rhythm</th><td>Irregularly irregular</td><td>Irregular</td><td>Irregular</td><td>Speeds and slows with breathing</td></tr>' +
    '<tr><th>Rate</th><td>Any; RVR when over 100</td><td>Over 100</td><td>Depends on conduction</td><td>Usually 60–100</td></tr></table></div>';
  var BLOCK_TABLE = '<div class="table-scroll"><table' + TABLE_STYLE + '><tr><th>Block</th><th>PR interval</th><th>Dropped beats?</th><th>Where</th></tr>' +
    '<tr><th>First-degree</th><td>Long (over 0.20 s) and constant</td><td>No</td><td>AV node</td></tr>' +
    '<tr><th>Second-degree type I</th><td>Lengthens with each beat</td><td>Yes — after the longest PR</td><td>AV node</td></tr>' +
    '<tr><th>Second-degree type II</th><td>Constant on conducted beats</td><td>Yes — suddenly</td><td>Below the AV node</td></tr>' +
    '<tr><th>2:1 block</th><td>Constant on conducted beats</td><td>Every other P wave</td><td>Either</td></tr>' +
    '<tr><th>Third-degree</th><td>Completely variable</td><td>No P waves conduct</td><td>Either</td></tr></table></div>';

  var UNITS = [
    /* ================================================================ 1 */
    {
      id: 'electro', title: 'The Heart’s Electrical System', color: '#1b2a5b', icon: 'heart',
      summary: 'Cardiac cells, depolarization, the conduction pathway, pacemaker sites and refractory periods.',
      lessons: [
        { id: 'cells', title: 'Electrical cells and depolarization', min: 8, blocks: [
          ['p', 'Every heartbeat begins as an electrical event. An ECG does not show the heart squeezing — it shows the <b>electrical activity</b> that tells the muscle when to squeeze. Before you can read a rhythm, you need to know where that electricity comes from.'],
          ['p', 'The heart has two main kinds of cells. <b>Myocardial (working) cells</b> contract and pump blood. <b>Pacemaker and conducting cells</b> create electrical impulses and carry them through the heart.'],
          ['h', 'Four properties of cardiac cells'],
          ['list', [
            '<b>Automaticity</b> — the ability to start an impulse without outside stimulation. This is what makes a pacemaker a pacemaker.',
            '<b>Excitability</b> — the ability to respond to an impulse.',
            '<b>Conductivity</b> — the ability to pass an impulse on to neighboring cells.',
            '<b>Contractility</b> — the ability to shorten and pump in response to an impulse.'
          ]],
          ['match', { title: 'Match the property', prompt: 'Match each property of cardiac cells to what it means.', pairs: [
            ['Automaticity', 'Starts an impulse on its own'], ['Excitability', 'Responds to an impulse'],
            ['Conductivity', 'Passes the impulse to neighboring cells'], ['Contractility', 'Shortens and pumps blood']] }],
          ['h', 'Depolarization and repolarization'],
          ['p', 'At rest, the inside of a cardiac cell is negatively charged. When the cell is stimulated, <b>sodium rushes into the cell</b> and the inside becomes positive — this is <b>depolarization</b>, and it triggers contraction. <b>Potassium then moves out</b> and the cell returns to its resting state — <b>repolarization</b>.'],
          ['p', 'The ECG records the combined waves of depolarization and repolarization from the surface of the skin. Depolarization of the atria makes the P wave, depolarization of the ventricles makes the QRS, and repolarization of the ventricles makes the T wave. You will meet each of these in Unit 2.'],
          ['callout', '<b>Electrical is not mechanical.</b> A normal-looking rhythm on the monitor does not prove the heart is pumping. An organized rhythm without a pulse is <b>pulseless electrical activity (PEA)</b>. Always check the patient.'],
          ['kc', { q: 'Which property lets pacemaker cells start an impulse on their own?', o: ['Automaticity', 'Excitability', 'Conductivity', 'Contractility'], a: 0, why: 'Automaticity is the ability to generate an impulse without outside stimulation. Pacemaker cells in the SA node, the AV junction and the ventricles all have it.' }],
          ['kc', { q: 'During depolarization, which ion rushes into the cell?', o: ['Sodium', 'Potassium', 'Chloride', 'Oxygen'], a: 0, why: 'Sodium entering the cell makes the inside positive. Potassium leaving the cell restores the resting state during repolarization.' }]
        ] },
        { id: 'pathway', title: 'The conduction pathway', min: 7, blocks: [
          ['p', 'A normal impulse follows the same path every time. It starts in the <b>SA node</b>, high in the right atrium near the superior vena cava, and spreads across both atria. It then reaches the <b>AV node</b>, the only normal electrical connection between the atria and the ventricles.'],
          ['html', PATHWAY, 'The pathway runs from the SA node, across the atria, through the AV node, into the bundle of His, down the right and left bundle branches, and out through the Purkinje fibers.'],
          ['p', 'The AV node deliberately <b>slows the impulse</b>. That short delay lets the atria finish emptying into the ventricles before the ventricles contract, and it protects the ventricles from very fast atrial rates.'],
          ['p', 'From the AV node the impulse races down the <b>bundle of His</b>, splits into the <b>right and left bundle branches</b>, and spreads through the <b>Purkinje fibers</b>, which carry it rapidly through the ventricular muscle. Because this specialized system is so fast, normal ventricular depolarization is quick — and that is why a normal QRS is narrow.'],
          ['order', { title: 'Put the pathway in order', prompt: 'Arrange the conduction pathway from where the impulse starts to where it ends.', items: ['SA node', 'Atria', 'AV node', 'Bundle of His', 'Right and left bundle branches', 'Purkinje fibers'] }],
          ['strip', 'nsr', { caption: 'Normal sinus rhythm in Lead II: every impulse takes the normal path — a P wave, a short pause, then a narrow QRS.' }],
          ['kc', { q: 'Why does the AV node delay the impulse?', o: ['To let the ventricles fill before they contract', 'To speed up the heart rate', 'To create the T wave', 'To start the impulse in the atria'], a: 0, why: 'The AV delay gives the atria time to empty into the ventricles. It also limits how many atrial impulses reach the ventricles when the atrial rate is very fast.' }]
        ] },
        { id: 'pacers', title: 'Pacemaker sites and intrinsic rates', min: 8, blocks: [
          ['p', 'Several areas of the heart can act as a pacemaker. The fastest one normally controls the heart. If it fails or slows, the next site down takes over at its own slower <b>intrinsic rate</b>.'],
          ['html', PACERS, 'The SA node fires at 60 to 100 per minute. The AV junction fires at 40 to 60. The ventricles fire at 20 to 40.'],
          ['p', 'This gives you a powerful clue. A regular narrow rhythm at 45 suggests the AV junction is in charge. A wide, slow rhythm at 30 suggests the ventricles are pacing the heart.'],
          ['match', { title: 'Match the pacemaker to its rate', prompt: 'Match each pacemaker site to its intrinsic rate.', pairs: [['SA node', '60–100/min'], ['AV junction', '40–60/min'], ['Ventricles', '20–40/min']] }],
          ['h', 'Escape beats versus premature beats'],
          ['list', [
            'An <b>escape</b> beat comes <b>late</b>. A lower pacemaker fires because the higher one failed or paused. Escape beats are protective — never try to suppress them.',
            'A <b>premature (ectopic)</b> beat comes <b>early</b>. An irritable site fires before the next normal beat is due.'
          ]],
          ['sort', { title: 'Escape or premature?', prompt: 'Sort each description into the right group.', buckets: ['Escape', 'Premature'], items: [
            ['Arrives later than the next expected beat', 0], ['Arrives earlier than the next expected beat', 1], ['A protective backup pacemaker', 0],
            ['Caused by an irritable focus', 1], ['A junctional rhythm at 45 after the SA node stops', 0], ['A PVC', 1]] }],
          ['h', 'The autonomic nervous system'],
          ['p', '<b>Sympathetic</b> stimulation speeds the SA node and AV conduction. <b>Parasympathetic</b> stimulation through the <b>vagus nerve</b> slows them. Vomiting, bearing down and pain can all cause a vagal slowing of the heart.'],
          ['kc', { q: 'A regular, narrow-complex rhythm runs at 48/min with inverted P waves in Lead II. Where is it most likely coming from?', o: ['The AV junction', 'The SA node', 'The ventricles', 'The Purkinje fibers'], a: 0, why: 'A rate of 40–60 with a narrow QRS and inverted (retrograde) P waves points to a junctional pacemaker.' }]
        ] },
        { id: 'refractory', title: 'Refractory periods and the vulnerable period', min: 6, blocks: [
          ['p', 'After a cell depolarizes, it needs time to recover before it can fire again. That recovery time is the <b>refractory period</b>, and it explains why some early beats are so dangerous.'],
          ['list', [
            'In the <b>absolute refractory period</b> the cells cannot respond to any stimulus, however strong. It runs from the start of the QRS to about the peak of the T wave.',
            'In the <b>relative refractory period</b> some cells have recovered. A strong enough stimulus can depolarize them. It falls on the downslope of the T wave — the <b>vulnerable period</b>.'
          ]],
          ['p', 'A PVC that lands on the T wave — an <b>R-on-T</b> PVC — fires during the vulnerable period and can trigger ventricular tachycardia or fibrillation. This is also why <b>synchronized cardioversion</b> times its shock to the R wave: it avoids delivering energy on the T wave.'],
          ['strip', 'pvc', { caption: 'Sinus rhythm with PVCs. Notice how close each early beat falls to the preceding T wave.' }],
          ['sort', { title: 'Absolute or relative?', prompt: 'Sort each statement by refractory period.', buckets: ['Absolute refractory', 'Relative refractory'], items: [
            ['No stimulus can cause depolarization', 0], ['A strong stimulus can cause depolarization', 1], ['Start of the QRS to the peak of the T wave', 0], ['Downslope of the T wave', 1], ['The vulnerable period', 1]] }],
          ['kc', { q: 'Why is an R-on-T PVC dangerous?', o: ['It falls in the vulnerable period and can trigger VT or VF', 'It always causes asystole', 'It blocks the AV node', 'It means the pacemaker has failed'], a: 0, why: 'A stimulus during the relative refractory (vulnerable) period can set off ventricular tachycardia or fibrillation.' }]
        ] }
      ],
      bank: [
        Q('pathway', 'What is the heart’s primary pacemaker?', ['SA node', 'AV node', 'Bundle of His', 'Purkinje fibers'], 'The SA node normally has the fastest intrinsic rate, so it controls the heart.'),
        Q('pacers', 'What is the intrinsic rate of the AV junction?', ['40–60/min', '60–100/min', '20–40/min', '100–150/min'], 'The AV junction fires at 40–60/min when higher pacemakers fail.'),
        Q('pacers', 'What is the intrinsic rate of the ventricles?', ['20–40/min', '40–60/min', '60–100/min', '150–250/min'], 'A ventricular escape (idioventricular) rhythm runs at 20–40/min.'),
        Q('cells', 'What mainly causes depolarization of a cardiac cell?', ['Sodium moving into the cell', 'Potassium moving into the cell', 'Calcium leaving the cell', 'Oxygen entering the cell'], 'Sodium rushing in makes the inside of the cell positive. Potassium leaving the cell restores the resting state during repolarization.'),
        Q('pacers', 'What effect does vagal (parasympathetic) stimulation have?', ['Slows the SA node and AV conduction', 'Speeds up the SA node', 'Widens the QRS', 'Causes ventricular fibrillation'], 'The vagus nerve slows the SA node and conduction through the AV node.'),
        Q('cells', 'The monitor shows an organized rhythm, but the patient has no pulse. What is this?', ['Pulseless electrical activity (PEA)', 'Normal sinus rhythm', 'Asystole', 'Artifact'], 'Electrical activity without mechanical function is PEA. Start CPR and look for reversible causes.'),
        Q('pacers', 'What is an escape beat?', ['A late beat from a lower pacemaker after a higher one fails', 'An early beat from an irritable focus', 'A beat caused by artifact', 'A beat from an implanted pacemaker'], 'Escape beats come late and are protective. Premature beats come early.'),
        Q('pathway', 'What do the Purkinje fibers do?', ['Carry the impulse rapidly through the ventricular muscle', 'Delay the impulse between atria and ventricles', 'Start each heartbeat', 'Repolarize the atria'], 'The Purkinje network distributes the impulse quickly, producing a narrow QRS.'),
        Q('cells', 'Conductivity is the ability of a cardiac cell to:', ['Pass an impulse on to neighboring cells', 'Start an impulse on its own', 'Contract', 'Respond to an impulse'], 'Conductivity is about transmitting the impulse. Automaticity starts it, excitability responds to it and contractility is the mechanical response.'),
        Q('pathway', 'Where is the SA node located?', ['High in the right atrium', 'In the interventricular septum', 'At the apex of the left ventricle', 'Between the left atrium and left ventricle'], 'The SA node sits high in the right atrium near the superior vena cava.'),
        Q('refractory', 'During the absolute refractory period, the heart:', ['Cannot respond to any stimulus', 'Responds only to a strong stimulus', 'Is fully recovered', 'Is in the vulnerable period'], 'In the absolute refractory period no stimulus can depolarize the cells.'),
        Q('refractory', 'Why does synchronized cardioversion time the shock to the R wave?', ['To avoid shocking during the vulnerable period on the T wave', 'To make the shock stronger', 'Because the P wave is too small', 'To slow the AV node'], 'Delivering energy on the T wave (the vulnerable period) could cause VF.')
      ]
    },

    /* ================================================================ 2 */
    {
      id: 'paper', title: 'ECG Paper, Waves and Leads', color: '#1b7a8c', icon: 'caliper',
      summary: 'Measuring time on the paper, the meaning of each wave, 3-lead placement and how to spot artifact.',
      lessons: [
        { id: 'grid', title: 'Reading the ECG paper', min: 8, blocks: [
          ['p', 'ECG paper is a grid. <b>Time</b> runs horizontally and <b>voltage</b> runs vertically. At the standard speed of <b>25 millimeters per second</b>, every box stands for a fixed amount of time.'],
          ['html', PAPER, 'One small box is 0.04 seconds. One large box, made of five small boxes, is 0.20 seconds. Five large boxes make one second, and thirty large boxes make a six-second strip.'],
          ['p', 'Vertically, the standard calibration is <b>10 millimeters per millivolt</b>: a 1-millivolt signal is two large boxes tall. Most monitors print a small hash mark every 3 seconds at the top of the strip, so two marks span a 6-second strip.'],
          ['p', 'To convert boxes to time, multiply: <b>small boxes × 0.04</b> seconds, or <b>large boxes × 0.20</b> seconds. A PR interval that spans 4 small boxes is 4 × 0.04 = 0.16 seconds.'],
          ['drill', { title: 'Box conversion drill', kind: 'boxes' }],
          ['strip', 'nsr', { caption: 'Turn on Calipers and drag across the strip: the tool shows the time in seconds and in small boxes.' }],
          ['kc', { q: 'At 25 mm/s, how long is one large box?', o: ['0.20 s', '0.04 s', '0.10 s', '1 s'], a: 0, why: 'A large box is 5 small boxes × 0.04 s = 0.20 s.' }]
        ] },
        { id: 'waves', title: 'Waves, segments and intervals', min: 10, blocks: [
          ['p', 'Each part of the ECG complex matches a specific electrical event. Learn these, and every rhythm becomes a matter of asking which part is missing, early, late or abnormal.'],
          ['anatomy'],
          ['list', [
            'The <b>P wave</b> is atrial depolarization. In Lead II it is small, rounded and upright.',
            'The <b>PR interval</b> runs from the start of the P wave to the start of the QRS. It reflects the time from atrial depolarization through the AV node — normally <b>0.12 to 0.20 seconds</b>, three to five small boxes.',
            'The <b>QRS complex</b> is ventricular depolarization. Normally it is <b>less than 0.12 seconds</b> — under three small boxes.',
            'The <b>ST segment</b> runs from the end of the QRS to the start of the T wave. It should sit on the baseline.',
            'The <b>T wave</b> is ventricular repolarization. Atrial repolarization is hidden inside the QRS.',
            'The <b>QT interval</b> runs from the start of the QRS to the end of the T wave. It is usually less than half the R-to-R interval. A long QT raises the risk of torsades de pointes.'
          ]],
          ['html', VALUES],
          ['match', { title: 'Match the wave to the event', prompt: 'Match each part of the ECG to the electrical event it shows.', pairs: [
            ['P wave', 'Atrial depolarization'], ['PR interval', 'Atria through the AV node'], ['QRS complex', 'Ventricular depolarization'], ['T wave', 'Ventricular repolarization']] }],
          ['measure', { title: 'Measure the PR interval', what: 'pr', pool: ['nsr', 'sbrady', 'firstDeg', 'stach'] }],
          ['kc', { q: 'What does the QRS complex represent?', o: ['Ventricular depolarization', 'Atrial depolarization', 'Ventricular repolarization', 'The delay at the AV node'], a: 0, why: 'The QRS is ventricular depolarization. The P wave is atrial depolarization and the T wave is ventricular repolarization.' }]
        ] },
        { id: 'leads', title: '3-lead placement', min: 7, blocks: [
          ['p', 'A 3-lead monitor uses three electrodes to create three views of the heart: Leads I, II and III. Each lead has a positive and a negative electrode. A wave moving toward the positive electrode is drawn upright; a wave moving away is drawn downward.'],
          ['leadsvg', 'The white electrode goes on the right, below the clavicle. The black electrode goes on the left, below the clavicle. The red electrode goes on the left lower abdomen. Lead one runs from the right arm, negative, to the left arm, positive. Lead two runs from the right arm, negative, to the left leg, positive. Lead three runs from the left arm, negative, to the left leg, positive.'],
          ['callout', '<b>Memory aid:</b> “White on the right, smoke (black) over fire (red).”'],
          ['p', '<b>Lead II</b> runs in the same direction as normal conduction, so it usually shows the clearest P waves and tallest R waves. That makes it the standard monitoring lead. Switch leads whenever you are unsure — a finding that is hard to see in one lead may be obvious in another.'],
          ['strip', 'nsr', { lead: 'All', caption: 'The same heartbeat seen through Leads I, II and III.' }],
          ['match', { title: 'Place the electrodes', prompt: 'Match each electrode or lead to its placement.', pairs: [
            ['White (RA)', 'Right side, below the clavicle'], ['Black (LA)', 'Left side, below the clavicle'], ['Red (LL)', 'Left lower torso'], ['Lead II', 'RA negative → LL positive']] }],
          ['note', 'A 3-lead ECG is for <b>rhythm</b> monitoring only. It cannot rule out a heart attack or locate one — acquire a 12-lead ECG for chest pain or suspected acute coronary syndrome.'],
          ['kc', { q: 'Why is Lead II the standard monitoring lead?', o: ['It parallels normal conduction, giving clear upright P waves and tall R waves', 'It is the only lead that shows the QRS', 'It detects STEMI in all areas of the heart', 'It needs only one electrode'], a: 0, why: 'Lead II looks along the normal path of conduction (right arm toward left leg), so P waves and QRS complexes are upright and easy to see.' }]
        ] },
        { id: 'artifact', title: 'Artifact and troubleshooting', min: 7, blocks: [
          ['p', '<b>Artifact</b> is anything on the ECG that does not come from the heart. It can hide a real rhythm or imitate a dangerous one, so you must recognize it.'],
          ['list', [
            '<b>Patient movement, shivering or tremor</b> — a fuzzy, irregular baseline.',
            '<b>Loose, dried-out or poorly placed electrodes</b> — wandering or flat-line segments.',
            '<b>Electrical interference</b> (60-cycle) — a thick, regular, fine-tooth baseline from nearby equipment.',
            '<b>Breathing and vehicle motion</b> — a baseline that drifts up and down.'
          ]],
          ['strip', 'nsr', { artifact: true, caption: 'Sinus rhythm with artifact. Press New strip to see different kinds of interference.' }],
          ['match', { title: 'Name the artifact', prompt: 'Match each appearance to its most likely cause.', pairs: [
            ['Thick, regular, fine-tooth baseline', 'Electrical (60-cycle) interference'], ['Fuzzy, irregular baseline', 'Tremor or shivering'],
            ['Baseline drifting up and down', 'Breathing or vehicle motion'], ['Sudden flat line in one lead', 'Loose or disconnected electrode']] }],
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
        Q('waves', 'What does the P wave represent?', ['Atrial depolarization', 'Ventricular depolarization', 'Ventricular repolarization', 'AV node delay'], 'The P wave is the impulse spreading through the atria.'),
        Q('waves', 'What does the T wave represent?', ['Ventricular repolarization', 'Atrial repolarization', 'Ventricular depolarization', 'Atrial depolarization'], 'The T wave is ventricular repolarization. Atrial repolarization is hidden in the QRS.'),
        Q('waves', 'What is the normal duration of the QRS complex?', ['Less than 0.12 s', '0.12–0.20 s', 'More than 0.20 s', 'Exactly 0.40 s'], 'A normal QRS is under 0.12 s (fewer than 3 small boxes).'),
        Q('waves', 'What is the normal PR interval?', ['0.12–0.20 s', 'Less than 0.12 s', '0.20–0.40 s', '0.04–0.10 s'], 'The normal PR interval is 0.12–0.20 s, or 3–5 small boxes.'),
        Q('grid', 'At 25 mm/s, one small box equals:', ['0.04 s', '0.20 s', '0.10 s', '1 s'], 'Each 1-mm small box is 0.04 s.'),
        Q('grid', 'How many large boxes make a 6-second strip?', ['30', '6', '15', '60'], 'Five large boxes make 1 second, so 30 large boxes make 6 seconds.'),
        Q('grid', 'A PR interval spans 4 small boxes. How long is it?', ['0.16 s', '0.08 s', '0.20 s', '0.40 s'], '4 × 0.04 s = 0.16 s — a normal PR interval.'),
        Q('grid', 'What is the standard vertical calibration?', ['10 mm = 1 mV', '5 mm = 1 mV', '25 mm = 1 mV', '1 mm = 1 mV'], 'At standard calibration a 1-mV signal is 10 mm (two large boxes) tall.'),
        Q('leads', 'For Lead II, which electrodes are negative and positive?', ['RA negative, LL positive', 'LA negative, LL positive', 'RA negative, LA positive', 'LL negative, RA positive'], 'Lead II runs from the right arm (negative) to the left leg (positive).'),
        Q('leads', 'Where is the white (RA) electrode placed?', ['Right side, below the clavicle', 'Left lower torso', 'Left side, below the clavicle', 'Center of the chest'], '“White on the right.”'),
        Q('artifact', 'A thick, regular, fine-tooth baseline is most likely caused by:', ['Electrical (60-cycle) interference', 'Atrial fibrillation', 'Ventricular fibrillation', 'A dead battery in a pacemaker'], 'Nearby electrical equipment can produce regular 60-cycle interference.'),
        Q('leads', 'A 3-lead ECG can be used to:', ['Monitor the heart rhythm', 'Rule out a STEMI', 'Locate the area of a heart attack', 'Measure cardiac output'], 'A 3-lead is for rhythm monitoring. A 12-lead is needed to evaluate for STEMI.')
      ]
    },

    /* ================================================================ 3 */
    {
      id: 'approach', title: 'The Systematic Approach', color: '#0f766e', icon: 'search',
      summary: 'The five questions for every strip, calculating heart rate, judging stability and naming what you see.',
      lessons: [
        { id: 'steps', title: 'Five questions for every strip', min: 8, blocks: [
          ['p', 'Experienced clinicians do not guess a rhythm at a glance. They ask the same five questions every time, in the same order. This habit stops you from missing a hidden P wave or a dropped beat.'],
          ['html', STEPS, 'One: what is the rate? Two: is the rhythm regular? Three: are there P waves, and is there one before every Q R S? Four: what is the P R interval? Five: is the Q R S narrow or wide?'],
          ['p', 'A heart rate under 60 per minute is <b>bradycardia</b>; over 100 per minute is <b>tachycardia</b>. A <b>narrow QRS</b> means the impulse started above the ventricles and used the normal conduction pathway. A <b>wide QRS</b> (0.12 seconds or more) means the impulse started in the ventricles, or traveled through them abnormally.'],
          ['order', { title: 'Put the five steps in order', prompt: 'Arrange the five questions in the order you ask them.', items: ['Rate', 'Regularity', 'P waves', 'PR interval', 'QRS width'] }],
          ['h', 'Is the patient stable?'],
          ['p', 'After the five steps, <b>look at the patient</b>: pulse, perfusion, mental status and blood pressure. A rhythm causes a problem when it produces any of these signs of <b>instability</b>:'],
          ['html', UNSTABLE, 'Hypotension or signs of shock. Altered mental status. Ischemic chest pain. Acute heart failure.'],
          ['callout', 'Treatment decisions depend on whether the patient is stable or unstable — not on the monitor alone. <b>Treat the patient, not the monitor.</b>'],
          ['kc', { q: 'A rhythm has a QRS of 0.16 s. What does this suggest?', o: ['A ventricular origin or abnormal conduction through the ventricles', 'A normal sinus impulse', 'A junctional rhythm with normal conduction', 'Atrial flutter'], a: 0, why: 'A QRS of 0.12 s or more is wide — the impulse is spreading slowly through the ventricles.' }],
          ['kc', { q: 'Which finding makes a patient with a fast rhythm unstable?', o: ['New confusion and low blood pressure', 'A heart rate of 110', 'Mild anxiety', 'A normal blood pressure with palpitations'], a: 0, why: 'Hypotension, altered mental status, ischemic chest pain and acute heart failure are the signs of instability.' }]
        ] },
        { id: 'rate', title: 'Calculating heart rate', min: 12, blocks: [
          ['p', 'Rate is the first question. You can calculate it three ways, and you should know when each one works.'],
          ['html', RATE_METHODS, 'The six-second method counts the Q R S complexes in six seconds and multiplies by ten. It works for regular and irregular rhythms. The three hundred method divides three hundred by the number of large boxes between R waves. The fifteen hundred method divides fifteen hundred by the number of small boxes. Those two work only for regular rhythms.'],
          ['p', 'In the field, the <b>6-second method</b> is the go-to: it is fast and works for irregular rhythms. Memorize the 300 sequence — <b>300, 150, 100, 75, 60, 50</b> — for a quick estimate of a regular rhythm. For example, 3 large boxes between R waves is 300 ÷ 3 = 100 per minute, and 15 small boxes is 1500 ÷ 15 = 100 per minute.'],
          ['drill', { title: 'Rate calculation drill', kind: 'rate' }],
          ['p', 'Now apply it to real strips. Estimate the rate of each strip, then check your answer. Use the calipers if they help.'],
          ['rate'],
          ['measure', { title: 'Measure the R-to-R interval', what: 'rr', pool: ['nsr', 'sbrady', 'stach', 'junctEscape', 'accelJunct', 'idio'] }],
          ['kc', { q: 'A 6-second strip contains 8 QRS complexes. What is the heart rate?', o: ['80/min', '48/min', '60/min', '100/min'], a: 0, why: '8 complexes × 10 = 80/min.' }]
        ] },
        { id: 'regularity', title: 'Regularity, P waves, PR and QRS', min: 10, blocks: [
          ['p', 'Next, look at the spacing of the R waves. A rhythm can be <b>regular</b>, <b>regularly irregular</b> (there is a repeating pattern), or <b>irregularly irregular</b> (no pattern at all). Compare the examples below.'],
          ['compare', [
            ['nsr', 'Regular — every R-to-R interval is the same.'],
            ['bigeminy', 'Regularly irregular — the irregularity repeats in a predictable pattern.'],
            ['afib', 'Irregularly irregular — no pattern at all. Think atrial fibrillation.']
          ]],
          ['classify', { title: 'Classify the regularity', prompt: 'Is this rhythm regular, regularly irregular or irregularly irregular?', options: ['Regular', 'Regularly irregular', 'Irregularly irregular'], items: { nsr: 0, sbrady: 0, stach: 0, idio: 0, bigeminy: 1, afib: 2 }, n: 4 }],
          ['p', 'Then find the P waves and measure the PR interval. Are the P waves upright and identical? Is the PR normal, long, shortened or changing? Are there <b>more P waves than QRS complexes</b>? If so, some impulses are not getting through the AV node — an <b>AV block</b>.'],
          ['compare', [
            ['nsr', 'Upright P before every QRS, normal PR, narrow QRS.'],
            ['firstDeg', 'P before every QRS, but the PR is longer than 0.20 seconds.'],
            ['junctEscape', 'P waves inverted or hidden — the impulse starts in the AV junction.'],
            ['idio', 'No P waves and a wide QRS — the ventricles are pacing the heart.']
          ]],
          ['classify', { title: 'Narrow or wide?', prompt: 'Is the QRS narrow (under 0.12 s) or wide (0.12 s or more)?', options: ['Narrow', 'Wide'], items: { nsr: 0, svt: 0, junctEscape: 0, afib: 0, idio: 1, vt: 1, vpaced: 1 }, n: 4 }],
          ['h', 'Naming the rhythm'],
          ['p', 'Name the <b>underlying rhythm first</b>, then add anything extra. For example: “Sinus rhythm with first-degree AV block and occasional PVCs.” Include the rate when you report it.'],
          ['kc', { q: 'There are more P waves than QRS complexes. What should you suspect?', o: ['An AV block', 'Sinus tachycardia', 'Ventricular fibrillation', 'Artifact only'], a: 0, why: 'Extra P waves that are not followed by a QRS mean some impulses are not getting through the AV node — an AV block.' }]
        ] },
        { id: 'together', title: 'Putting it together', min: 10, practice: true, blocks: [
          ['p', 'Here is the whole process on one strip. Suppose the rate is 50 per minute, the rhythm is regular, an upright P wave comes before every QRS, the PR is 0.16 seconds and the QRS is narrow. Every rule of sinus rhythm is met except the rate, so this is <b>sinus bradycardia at 50</b>.'],
          ['p', 'Now suppose the rhythm is irregularly irregular at 110, there are no P waves, and the QRS is narrow. No P waves plus an irregularly irregular rhythm means <b>atrial fibrillation with a rapid ventricular response</b>.'],
          ['p', 'Work through the guided worksheet below. Answer each of the five questions, then name the rhythm. Complete at least one strip to finish this lesson — then try a few more.'],
          ['walk', ['nsr', 'sbrady', 'stach', 'afib', 'firstDeg', 'junctEscape', 'idio']],
          ['kc', { q: 'A strip is regular at 50/min with an upright P before every QRS, a PR of 0.16 s and a narrow QRS. What is it?', o: ['Sinus bradycardia', 'Normal sinus rhythm', 'Junctional escape rhythm', 'First-degree AV block'], a: 0, why: 'All the sinus criteria are met, and the rate is under 60 — sinus bradycardia.' }]
        ] }
      ],
      bank: [
        Q('rate', 'A 6-second strip has 7 QRS complexes. What is the rate?', ['70/min', '42/min', '60/min', '77/min'], '7 × 10 = 70/min.'),
        Q('rate', 'Which rate method works best for an irregular rhythm?', ['6-second method', '300 (large-box) method', '1500 (small-box) method', 'Counting one R–R interval'], 'Only the 6-second method averages the beats over time, so it works for irregular rhythms.'),
        Q('rate', 'There are 3 large boxes between R waves in a regular rhythm. What is the rate?', ['100/min', '150/min', '75/min', '60/min'], '300 ÷ 3 = 100/min.'),
        Q('rate', 'There are 4 large boxes between R waves in a regular rhythm. What is the rate?', ['75/min', '60/min', '100/min', '50/min'], '300 ÷ 4 = 75/min.'),
        Q('rate', 'There are 15 small boxes between R waves in a regular rhythm. What is the rate?', ['100/min', '150/min', '75/min', '60/min'], '1500 ÷ 15 = 100/min.'),
        Q('regularity', '“Irregularly irregular” means:', ['The R–R intervals vary with no pattern', 'The rhythm speeds up and slows down with breathing', 'Every other beat is early', 'The rhythm is regular but fast'], 'No pattern at all — the classic finding in atrial fibrillation.'),
        Q('steps', 'A wide QRS is one that measures:', ['0.12 s or more', 'More than 0.20 s', 'Less than 0.12 s', 'More than 0.04 s'], 'A QRS of 0.12 s (3 small boxes) or more is wide.'),
        Q('steps', 'A heart rate under 60/min is called:', ['Bradycardia', 'Tachycardia', 'Normal', 'Fibrillation'], 'Bradycardia is under 60/min; tachycardia is over 100/min.'),
        Q('steps', 'What should you do before treating any rhythm on the monitor?', ['Assess the patient’s pulse and perfusion', 'Print a 30-second strip', 'Change to Lead III', 'Give oxygen to every patient'], 'Treat the patient, not the monitor. Correlate every rhythm with the clinical picture.'),
        Q('steps', 'Which is a sign that a patient is unstable?', ['Hypotension with altered mental status', 'A heart rate of 105 with normal blood pressure', 'Mild palpitations', 'A narrow QRS'], 'Hypotension or shock, altered mental status, ischemic chest pain and acute heart failure are signs of instability.'),
        Q('regularity', 'Which steps best help you identify an AV block?', ['The P waves and the PR interval', 'The QRS width only', 'The rate only', 'The T wave shape'], 'AV blocks are about the relationship between P waves and QRS complexes — look at the P waves and the PR.'),
        Q('regularity', 'When you name a rhythm, what comes first?', ['The underlying rhythm', 'The ectopic beats', 'The treatment', 'The lead you used'], 'Name the underlying rhythm, then add findings — for example, “sinus rhythm with occasional PVCs.”')
      ]
    },

    /* ================================================================ 4 */
    {
      id: 'sinus', title: 'Sinus Rhythms', color: '#3a9b3f', icon: 'heart', module: 'sinus',
      summary: 'Normal sinus rhythm, sinus bradycardia and tachycardia, sinus arrhythmia and sinus arrest.',
      lessons: [
        { id: 'basics', title: 'Normal sinus, bradycardia and tachycardia', min: 10, blocks: [
          ['p', 'Every sinus rhythm shares the same features in Lead II: an <b>upright, uniform P wave before every QRS</b>, a <b>normal, constant PR interval</b>, and a <b>narrow QRS</b>. What changes between them is the <b>rate</b> and the <b>regularity</b>.'],
          ['p', 'Explore each rhythm below. The narration walks through each one in turn; press New strip to see more examples.'],
          ['rhythms', ['nsr', 'sbrady', 'stach']],
          ['h', 'Sinus tachycardia or SVT?'],
          ['p', 'Sinus tachycardia in adults rarely goes above 150 at rest. It speeds up and slows down <b>gradually</b> with its cause, and you can usually find P waves. A narrow, very regular rhythm above 150 with no visible P waves that started <b>suddenly</b> is more likely SVT — you will meet it in Unit 5.'],
          ['callout', 'Sinus tachycardia is the body’s <b>response</b> to a problem. Treat the cause: <b>control bleeding and support perfusion</b> in hypovolemia, treat sepsis, fever, pain and hypoxia. Never give adenosine or cardiovert sinus tachycardia.'],
          ['classify', { title: 'Slow, normal or fast?', prompt: 'Name this sinus rhythm by its rate.', options: ['Sinus bradycardia', 'Normal sinus rhythm', 'Sinus tachycardia'], items: { sbrady: 0, nsr: 1, stach: 2 }, n: 4 }],
          ['kc', { q: 'A hypovolemic trauma patient has sinus tachycardia at 140/min. What is the right approach?', o: ['Treat the cause — control bleeding and support perfusion', 'Give adenosine', 'Perform synchronized cardioversion', 'Give a beta blocker'], a: 0, why: 'Sinus tachycardia is a response to something. Find and treat the cause; never cardiovert or give adenosine for it.' }]
        ] },
        { id: 'irregular', title: 'Sinus arrhythmia and sinus arrest', min: 7, blocks: [
          ['p', 'Two sinus rhythms are irregular. In <b>sinus arrhythmia</b> the rate rises and falls with breathing. In <b>sinus arrest</b> the SA node simply stops firing for a moment, leaving a pause with no P wave and no QRS.'],
          ['rhythms', ['sarrhythmia', 'sarrest']],
          ['sort', { title: 'Arrhythmia or arrest?', prompt: 'Sort each finding.', buckets: ['Sinus arrhythmia', 'Sinus arrest'], items: [
            ['Rate rises and falls with breathing', 0], ['A sudden pause with no P wave or QRS', 1], ['Common and normal in children and young adults', 0], ['Can cause dizziness or syncope if the pause is long', 1]] }],
          ['kc', { q: 'Sinus arrhythmia usually varies with:', o: ['Breathing', 'Blood pressure', 'Body temperature', 'Blood glucose'], a: 0, why: 'The rate speeds up on inspiration and slows on expiration. It is common and normal in children and young adults.' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 10, practice: true, blocks: [
          ['p', 'Put it together. Identify each strip using the five steps, then check your answer. These strips are unlimited and not scored — identify at least three, then work through the patient scenarios.'],
          ['practice', ['nsr', 'sbrady', 'stach', 'sarrhythmia', 'sarrest']],
          ['case', { title: 'Scenario: the dizzy patient', rhythm: 'sbrady', vitals: { HR: '38', BP: '74/40', SpO2: '95%', Skin: 'Cool, pale, clammy' },
            text: 'A 72-year-old woman called because she felt faint while gardening. She is confused about the day and her skin is cool and clammy.',
            qs: [
              { q: 'What is the rhythm?', o: ['Sinus bradycardia', 'Normal sinus rhythm', 'Sinus arrest', 'Sinus tachycardia'], a: 0, why: 'Sinus P waves, normal PR, narrow QRS — at a rate under 60.' },
              { q: 'Is she stable or unstable?', o: ['Unstable — hypotension and altered mental status', 'Stable — her oxygen saturation is normal', 'Stable — the rhythm is regular', 'Cannot be decided without a 12-lead'], a: 0, why: 'Hypotension with altered mental status are signs of instability.' },
              { q: 'What is the first-line drug for her symptomatic bradycardia (per protocol)?', o: ['Atropine', 'Adenosine', 'Amiodarone', 'Diltiazem'], a: 0, why: 'Atropine is first-line for symptomatic sinus bradycardia; prepare transcutaneous pacing or a chronotropic infusion if it does not work.' }
            ] }],
          ['case', { title: 'Scenario: the feverish patient', rhythm: 'stach', vitals: { HR: '128', BP: '118/72', Temp: '39.4 °C', SpO2: '97%' },
            text: 'A 24-year-old man has had the flu for three days. He is weak and thirsty but alert. His heart rate is fast and regular.',
            qs: [
              { q: 'What is the rhythm?', o: ['Sinus tachycardia', 'SVT', 'Atrial flutter', 'Normal sinus rhythm'], a: 0, why: 'Sinus P waves before every QRS at a rate over 100, from an obvious cause.' },
              { q: 'What is the best treatment approach?', o: ['Treat the cause — fever and dehydration', 'Adenosine', 'Synchronized cardioversion', 'Vagal maneuvers'], a: 0, why: 'Sinus tachycardia is a response. Fluids and fever control treat the cause; adenosine and cardioversion are wrong.' }
            ] }]
        ] }
      ],
      bank: [
        Q('basics', 'What is the rate of normal sinus rhythm?', ['60–100/min', '40–60/min', '100–150/min', '20–40/min'], 'A sinus rhythm at 60–100/min is normal sinus rhythm.'),
        Q('basics', 'Which drug is first-line for symptomatic sinus bradycardia in adults?', ['Atropine', 'Adenosine', 'Amiodarone', 'Diltiazem'], 'Atropine is first-line, with pacing or a chronotropic infusion if it fails (per protocol).'),
        Q('irregular', 'What separates sinus arrhythmia from wandering atrial pacemaker?', ['In sinus arrhythmia all P waves look the same', 'Sinus arrhythmia has no P waves', 'Sinus arrhythmia has a wide QRS', 'Sinus arrhythmia is always faster than 100'], 'Sinus arrhythmia comes from one pacemaker, so the P waves are identical. Wandering atrial pacemaker has changing P waves.'),
        Q('basics', 'A narrow, regular rhythm at 170/min with no visible P waves is most likely:', ['SVT', 'Sinus tachycardia', 'Sinus arrhythmia', 'Normal sinus rhythm'], 'Adult sinus tachycardia rarely exceeds 150. Faster than 150 with no visible P waves — think SVT.'),
        Q('irregular', 'In sinus arrest, the pause contains:', ['No P wave and no QRS', 'A P wave without a QRS', 'A wide QRS', 'Flutter waves'], 'The SA node fails to fire, so there is neither a P wave nor a QRS during the pause.'),
        Q('basics', 'Which is a common cause of sinus bradycardia?', ['Vagal stimulation or beta-blocker use', 'Fever', 'Hypovolemia', 'Anxiety'], 'Vagal tone, beta blockers, hypoxia, hypothermia and inferior MI can slow the SA node. Fever, hypovolemia and anxiety speed it up.'),
        Q('basics', 'How does sinus tachycardia usually start and stop?', ['Gradually, with its cause', 'Abruptly, in one beat', 'Only after adenosine', 'With a long pause'], 'Sinus tachycardia changes rate gradually. An abrupt start and stop suggests SVT.'),
        Q('basics', 'Sinus tachycardia in a patient with sepsis is best treated by:', ['Treating the sepsis and supporting perfusion', 'Synchronized cardioversion', 'Adenosine', 'Vagal maneuvers'], 'Sinus tachycardia is compensatory — treat the cause.')
      ]
    },

    /* ================================================================ 5 */
    {
      id: 'atrial', title: 'Atrial Rhythms', color: '#1e88e5', icon: 'atrial', module: 'atrial',
      summary: 'PACs, wandering atrial pacemaker, MAT, atrial flutter, atrial fibrillation and SVT.',
      lessons: [
        { id: 'ectopic', title: 'PACs, wandering pacemaker and MAT', min: 10, blocks: [
          ['p', 'Atrial rhythms start somewhere in the atria other than the SA node. Look for <b>P waves that look different</b> from sinus P waves. Because conduction below the AV node is normal, the QRS is usually <b>narrow</b>.'],
          ['rhythms', ['pac', 'wap', 'mat']],
          ['p', 'Wandering atrial pacemaker and MAT both show <b>at least three different P wave shapes</b>. The difference is the rate: under 100 is wandering atrial pacemaker, over 100 is MAT. MAT is strongly linked to <b>COPD</b> and hypoxia, so treat the lungs.'],
          ['kc', { q: 'What is typical of a premature atrial contraction (PAC)?', o: ['An early beat with a P wave that looks different', 'A wide, bizarre early beat with no P wave', 'A pause with no P wave or QRS', 'A sawtooth baseline'], a: 0, why: 'A PAC is early and comes from an ectopic atrial focus, so its P wave differs in shape. Look for it in or near the preceding T wave.' }]
        ] },
        { id: 'flutfib', title: 'Atrial flutter and atrial fibrillation', min: 10, blocks: [
          ['p', 'In flutter and fibrillation, normal P waves are replaced by rapid atrial activity. <b>Flutter</b> produces organized sawtooth waves at about 300 per minute, best seen in Leads II and III. <b>Fibrillation</b> produces a chaotic, wavy baseline with an irregularly irregular ventricular response.'],
          ['rhythms', ['flutter', 'afib']],
          ['p', 'In atrial fibrillation the atria quiver instead of contracting, so blood pools and <b>clots can form</b>. A clot that travels to the brain causes a stroke. Ask every atrial fibrillation patient when it started, whether they take a blood thinner, and check for stroke symptoms.'],
          ['h', 'Telling irregular narrow rhythms apart'],
          ['html', IRREG_NARROW],
          ['kc', { q: 'What is the hallmark of atrial fibrillation?', o: ['Irregularly irregular rhythm with no identifiable P waves', 'Sawtooth flutter waves', 'A regular rhythm at 150/min', 'Inverted P waves before every QRS'], a: 0, why: 'Chaotic atrial activity with an irregularly irregular ventricular response is atrial fibrillation.' }]
        ] },
        { id: 'svt', title: 'Supraventricular tachycardia', min: 8, blocks: [
          ['p', 'SVT is a fast, regular, narrow-complex tachycardia — usually 150 to 250 per minute — with P waves that are hidden or hard to see. It often starts and stops suddenly, and patients typically describe a racing heart.'],
          ['rhythms', ['svt']],
          ['p', 'For a <b>stable</b> patient, try <b>vagal maneuvers</b> first, such as a modified Valsalva. If they fail, give <b>adenosine</b> by rapid IV push followed immediately by a fast saline flush — its effect lasts only seconds. For an <b>unstable</b> patient, perform <b>synchronized cardioversion</b>. Always follow your local protocol.'],
          ['sort', { title: 'Stable or unstable SVT?', prompt: 'Sort each treatment by when it is used.', buckets: ['Stable SVT', 'Unstable SVT'], items: [
            ['Vagal maneuvers', 0], ['Adenosine rapid IV push with flush', 0], ['Synchronized cardioversion', 1], ['Patient with hypotension and confusion', 1]] }],
          ['kc', { q: 'A stable patient is in SVT at 190/min. What is usually tried first?', o: ['Vagal maneuvers', 'Defibrillation', 'Atropine', 'Transcutaneous pacing'], a: 0, why: 'Vagal maneuvers come first for stable SVT, then adenosine if they fail (per protocol).' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 12, practice: true, blocks: [
          ['p', 'Identify each strip. Atrial rhythms can look alike — compare P wave shapes and check the regularity carefully. Identify at least three, then work through the scenarios.'],
          ['practice', ['pac', 'wap', 'mat', 'flutter', 'afib', 'svt']],
          ['case', { title: 'Scenario: palpitations at the dinner table', rhythm: 'afib', vitals: { HR: '130–150', BP: '132/80', SpO2: '96%', Mental: 'Alert' },
            text: 'A 58-year-old man felt his heart “fluttering” for the last two hours. He has no chest pain and is speaking in full sentences.',
            qs: [
              { q: 'What is the rhythm?', o: ['Atrial fibrillation with rapid ventricular response', 'Sinus tachycardia', 'Atrial flutter with 2:1 conduction', 'SVT'], a: 0, why: 'Irregularly irregular, no P waves, narrow QRS, rate over 100.' },
              { q: 'Which history question matters most for stroke risk?', o: ['When did it start, and does he take a blood thinner?', 'What did he eat for dinner?', 'Has he had a flu shot?', 'Does he exercise?'], a: 0, why: 'Atrial fibrillation lets clots form in the atria. Onset and anticoagulant use guide hospital treatment.' },
              { q: 'He is stable. What is the usual prehospital approach?', o: ['Monitor, 12-lead and rate control per protocol', 'Immediate defibrillation', 'Synchronized cardioversion right away', 'Atropine'], a: 0, why: 'Stable atrial fibrillation with RVR is managed with rate control per protocol and medical direction.' }
            ] }],
          ['case', { title: 'Scenario: sudden racing heart', rhythm: 'svt', vitals: { HR: '210', BP: '118/76', SpO2: '98%', Mental: 'Alert, anxious' },
            text: 'A 30-year-old woman’s heart suddenly started racing 20 minutes ago. This has happened before and stopped on its own.',
            qs: [
              { q: 'What is the rhythm?', o: ['SVT', 'Sinus tachycardia', 'Atrial fibrillation', 'Ventricular tachycardia'], a: 0, why: 'Very fast, regular, narrow and without visible P waves, with a sudden onset.' },
              { q: 'What should you try first?', o: ['Vagal maneuvers', 'Synchronized cardioversion', 'Adenosine slowly over 2 minutes', 'Defibrillation'], a: 0, why: 'She is stable, so vagal maneuvers come first.' },
              { q: 'Vagal maneuvers fail. How is adenosine given?', o: ['Rapid IV push followed immediately by a fast flush', 'Slow IV infusion', 'Intramuscular injection', 'By mouth'], a: 0, why: 'Adenosine lasts only seconds, so it must reach the heart fast.' }
            ] }]
        ] }
      ],
      bank: [
        Q('flutfib', 'Flutter waves are best described as:', ['A sawtooth pattern', 'A chaotic wavy baseline', 'Inverted P waves', 'Tall, peaked T waves'], 'Atrial flutter produces regular sawtooth waves, often at about 300/min, best seen in Leads II and III.'),
        Q('flutfib', 'Why does atrial fibrillation increase the risk of stroke?', ['Clots can form in the quivering atria', 'It causes very high blood pressure', 'It lowers the blood glucose', 'It damages the AV node'], 'Blood pools in the quivering atria and can clot, then travel to the brain.'),
        Q('ectopic', 'Multifocal atrial tachycardia has:', ['At least 3 different P wave shapes and a rate over 100', 'Sawtooth waves', 'No P waves and a wide QRS', 'A constant PR and identical P waves'], 'MAT is like wandering atrial pacemaker, but faster than 100/min. It is common in COPD.'),
        Q('svt', 'An unstable patient is in SVT. What is the treatment?', ['Synchronized cardioversion', 'Vagal maneuvers only', 'Atropine', 'Observation'], 'Unstable tachycardia with a pulse needs synchronized cardioversion.'),
        Q('svt', 'How is adenosine given?', ['Rapid IV push followed by a fast saline flush', 'Slowly over 10 minutes', 'Intramuscularly', 'By mouth'], 'Adenosine lasts only seconds, so it must be pushed rapidly and flushed immediately.'),
        Q('ectopic', 'Wandering atrial pacemaker differs from MAT because it:', ['Has a rate under 100/min', 'Has a wide QRS', 'Has no P waves', 'Is always regular'], 'Both have at least 3 P wave shapes. Under 100/min it is wandering atrial pacemaker; over 100/min it is MAT.'),
        Q('ectopic', 'MAT is most strongly associated with:', ['COPD and hypoxia', 'Digoxin toxicity', 'Hypothermia', 'Pacemaker failure'], 'Treat the underlying lung problem; cardioversion does not work for MAT.'),
        Q('flutfib', 'A regular narrow rhythm at exactly 150/min should make you look for:', ['Atrial flutter with 2:1 conduction', 'Sinus bradycardia', 'Third-degree block', 'Idioventricular rhythm'], 'Flutter waves at 300/min with 2:1 conduction give a ventricular rate of about 150.')
      ]
    },

    /* ================================================================ 6 */
    {
      id: 'junctional', title: 'Junctional Rhythms', color: '#f08a1c', icon: 'junction', module: 'junctional',
      summary: 'Retrograde P waves, PJCs, and junctional escape, accelerated and tachycardic rhythms.',
      lessons: [
        { id: 'retro', title: 'Retrograde P waves and PJCs', min: 8, blocks: [
          ['p', 'When the AV junction starts the impulse, the atria are depolarized <b>backwards</b> — retrograde. In Lead II that means the P wave is <b>inverted</b> and the PR is <b>short</b> (under 0.12 seconds), the P wave is <b>hidden</b> in the QRS, or an inverted P wave appears <b>after</b> the QRS.'],
          ['p', 'The impulse still travels down the normal pathway into the ventricles, so the QRS stays <b>narrow</b>.'],
          ['rhythms', ['pjc']],
          ['h', 'PAC, PJC or PVC?'],
          ['p', 'All three are early beats. Use the P wave and the QRS width to tell them apart.'],
          ['html', EARLY_BEATS],
          ['match', { title: 'Name the early beat', prompt: 'Match each description to the type of early beat.', pairs: [
            ['Early, narrow, upright but different P wave', 'PAC'], ['Early, narrow, inverted or absent P wave', 'PJC'], ['Early, wide and bizarre, no P wave', 'PVC']] }],
          ['kc', { q: 'In Lead II, a junctional P wave that comes before the QRS is:', o: ['Inverted, with a PR under 0.12 s', 'Upright, with a PR over 0.20 s', 'Sawtooth-shaped', 'Followed by a wide QRS'], a: 0, why: 'Retrograde atrial depolarization produces an inverted P wave with a short PR.' }]
        ] },
        { id: 'rates', title: 'Junctional escape, accelerated and tachycardia', min: 10, blocks: [
          ['p', 'The junction’s intrinsic rate is 40 to 60 per minute. The name of a junctional rhythm depends on its rate: <b>junctional escape</b> at 40 to 60, <b>accelerated junctional</b> at 61 to 100, and <b>junctional tachycardia</b> above 100.'],
          ['rhythms', ['junctEscape', 'accelJunct', 'junctTach']],
          ['p', 'A junctional escape rhythm is a protective backup — ask why the SA node failed, and never try to suppress it. Accelerated junctional rhythm is classically caused by <b>digoxin toxicity</b>, as well as ischemia and heart surgery.'],
          ['classify', { title: 'Name it by the rate', prompt: 'All of these are junctional. Name each one by its rate.', options: ['Junctional escape rhythm', 'Accelerated junctional rhythm', 'Junctional tachycardia'], items: { junctEscape: 0, accelJunct: 1, junctTach: 2 }, n: 4 }],
          ['kc', { q: 'A narrow rhythm with inverted P waves runs at 82/min. What is it?', o: ['Accelerated junctional rhythm', 'Junctional escape rhythm', 'Junctional tachycardia', 'Normal sinus rhythm'], a: 0, why: 'Junctional features at 61–100/min make it an accelerated junctional rhythm.' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 10, practice: true, blocks: [
          ['p', 'Identify each strip. Look closely at the P waves — inverted, hidden or after the QRS — and use the rate to name the rhythm. Identify at least three, then work through the scenarios.'],
          ['practice', ['pjc', 'junctEscape', 'accelJunct', 'junctTach', 'nsr', 'sbrady']],
          ['case', { title: 'Scenario: nausea and yellow vision', rhythm: 'accelJunct', vitals: { HR: '84', BP: '112/70', SpO2: '96%', Meds: 'Digoxin, furosemide' },
            text: 'An 81-year-old woman has had nausea and poor appetite for two days and says the lights look yellow. She takes digoxin for heart failure.',
            qs: [
              { q: 'What is the rhythm?', o: ['Accelerated junctional rhythm', 'Junctional escape rhythm', 'Normal sinus rhythm', 'Junctional tachycardia'], a: 0, why: 'Narrow, regular, junctional P waves at 61–100/min.' },
              { q: 'Which cause should you suspect?', o: ['Digoxin toxicity', 'Fever', 'Dehydration only', 'Anxiety'], a: 0, why: 'Nausea, visual changes and an accelerated junctional rhythm in a digoxin user suggest toxicity.' }
            ] }],
          ['case', { title: 'Scenario: the slow, confused patient', rhythm: 'junctEscape', vitals: { HR: '44', BP: '82/50', SpO2: '94%', Mental: 'Confused' },
            text: 'A 77-year-old man is found confused and pale. His rhythm is regular and narrow with no upright P waves.',
            qs: [
              { q: 'What is the rhythm?', o: ['Junctional escape rhythm', 'Sinus bradycardia', 'Idioventricular rhythm', 'Accelerated junctional rhythm'], a: 0, why: 'Narrow, regular, 40–60/min, with no normal upright P waves.' },
              { q: 'He is hypotensive and confused. How is this treated?', o: ['As symptomatic bradycardia — atropine and pacing per protocol', 'With amiodarone to suppress the rhythm', 'With adenosine', 'No treatment is needed'], a: 0, why: 'Treat symptomatic bradycardia per protocol. Never suppress an escape rhythm.' }
            ] }]
        ] }
      ],
      bank: [
        Q('rates', 'What is the rate of a junctional escape rhythm?', ['40–60/min', '61–100/min', 'Over 100/min', '20–40/min'], 'Junctional escape runs at the junction’s intrinsic rate of 40–60/min.'),
        Q('rates', 'Junctional tachycardia has a rate of:', ['Over 100/min', '40–60/min', '61–100/min', 'Under 40/min'], 'A junctional rhythm faster than 100/min is junctional tachycardia.'),
        Q('retro', 'What is the QRS width in a junctional rhythm (without a conduction delay)?', ['Narrow', 'Always wide', 'Absent', 'Variable from beat to beat'], 'The impulse uses the normal pathway below the junction, so the QRS is narrow.'),
        Q('retro', 'Where can the P wave appear in a junctional rhythm?', ['Before, hidden in, or after the QRS', 'Only before the QRS, upright', 'Only as sawtooth waves', 'Nowhere — junctional rhythms never affect the atria'], 'Depending on timing, the retrograde P wave can be before (short PR), hidden in, or after the QRS.'),
        Q('rates', 'Which drug toxicity is a classic cause of accelerated junctional rhythm?', ['Digoxin', 'Acetaminophen', 'Aspirin', 'Naloxone'], 'Digoxin toxicity is a classic cause, along with ischemia and heart surgery.'),
        Q('retro', 'A premature junctional contraction (PJC) is:', ['An early narrow beat with an inverted, absent or retrograde P wave', 'An early wide beat with no P wave', 'A late beat after a pause', 'A dropped QRS'], 'A PJC is early, narrow and has the retrograde P wave pattern of the junction.'),
        Q('retro', 'How does a PAC differ from a PJC?', ['A PAC has an upright (but different) P wave', 'A PAC has a wide QRS', 'A PAC has no P wave', 'A PAC is always late'], 'A PAC has an upright, different P wave; a PJC has an inverted or absent one.')
      ]
    },

    /* ================================================================ 7 */
    {
      id: 'ventricular', title: 'Ventricular Rhythms', color: '#e53935', icon: 'bolt', module: 'ventricular',
      summary: 'PVCs, idioventricular rhythms, ventricular tachycardia, torsades, VF and asystole.',
      lessons: [
        { id: 'pvcs', title: 'PVCs and their patterns', min: 10, blocks: [
          ['p', 'Impulses that start in the ventricles spread slowly from cell to cell instead of using the fast conduction system. The result is a <b>wide, bizarre QRS</b> (0.12 seconds or more), <b>no related P wave</b>, and a <b>T wave pointing the opposite way</b> to the QRS.'],
          ['rhythms', ['pvc', 'bigeminy', 'multifocal']],
          ['h', 'Describing PVCs'],
          ['list', [
            '<b>Unifocal</b> PVCs all look the same; <b>multifocal</b> PVCs have different shapes because they come from more than one focus.',
            '<b>Bigeminy</b>: every other beat is a PVC. <b>Trigeminy</b>: every third beat is a PVC.',
            'A <b>couplet</b> is two PVCs in a row. Three or more in a row is a <b>run of ventricular tachycardia</b>.',
            'An <b>R-on-T</b> PVC lands on the T wave of the beat before it — the vulnerable period.'
          ]],
          ['match', { title: 'PVC vocabulary', prompt: 'Match each term to its meaning.', pairs: [
            ['Bigeminy', 'Every other beat is a PVC'], ['Trigeminy', 'Every third beat is a PVC'], ['Couplet', 'Two PVCs in a row'],
            ['Run of VT', 'Three or more PVCs in a row'], ['Multifocal', 'PVCs with different shapes']] }],
          ['p', 'Frequent, multifocal, paired or R-on-T PVCs are <b>warning signs</b> of an irritable heart. Look for causes such as hypoxia, ischemia and electrolyte problems, get a 12-lead, and keep the defibrillator close.'],
          ['kc', { q: 'What usually follows a PVC?', o: ['A full compensatory pause', 'A P wave with a long PR', 'Atrial fibrillation', 'Nothing — the next beat comes early'], a: 0, why: 'The SA node keeps its timing, so the beat after a PVC arrives on schedule — the pause is fully compensatory.' }]
        ] },
        { id: 'escape', title: 'Idioventricular rhythm and AIVR', min: 7, blocks: [
          ['p', 'When the SA node and the junction both fail, the ventricles take over at 20 to 40 per minute — an <b>idioventricular rhythm</b>. It is often a sign of a dying heart and may have no pulse, so always check. An <b>accelerated idioventricular rhythm (AIVR)</b> runs at 41 to 100, classically after blood flow to the heart is restored (reperfusion).'],
          ['rhythms', ['idio', 'aivr']],
          ['callout', 'Never try to suppress an escape rhythm with an antiarrhythmic such as amiodarone or lidocaine. It may be the only thing keeping the heart beating — abolish it and the patient can go into asystole.'],
          ['kc', { q: 'Why should you not give amiodarone or lidocaine for an idioventricular escape rhythm?', o: ['It may abolish the only pacemaker and cause asystole', 'It will convert the rhythm to sinus tachycardia', 'It narrows the QRS', 'It only works in children'], a: 0, why: 'An escape rhythm is protective. Suppressing it can leave no pacemaker at all.' }]
        ] },
        { id: 'vt', title: 'Ventricular tachycardia and torsades', min: 10, blocks: [
          ['p', 'Three or more PVCs in a row is a run of <b>ventricular tachycardia</b>. VT is a wide-complex, usually regular tachycardia above 100 per minute. The patient may be stable, unstable or pulseless. A wide, regular tachycardia is VT until proven otherwise.'],
          ['rhythms', ['vt', 'torsades']],
          ['p', 'Treatment depends on the patient, not just the rhythm:'],
          ['list', [
            '<b>Pulseless VT</b> is treated exactly like ventricular fibrillation: CPR and immediate <b>defibrillation</b>.',
            'VT <b>with a pulse but signs of instability</b> needs <b>synchronized cardioversion</b>.',
            'VT <b>with a pulse and stable</b>: 12-lead, antiarrhythmic per protocol, and be ready to cardiovert.',
            '<b>Torsades de pointes</b> is a polymorphic VT linked to a long QT interval. It is treated with <b>magnesium sulfate</b>, and with defibrillation when pulseless.'
          ]],
          ['sort', { title: 'Which treatment?', prompt: 'Sort each patient into the right treatment.', buckets: ['Defibrillation + CPR', 'Synchronized cardioversion', 'Antiarrhythmic, monitor, prepare'], items: [
            ['VT, no pulse', 0], ['VT, BP 70/40 and confused', 1], ['VT, alert with BP 124/80', 2], ['Ventricular fibrillation', 0]] }],
          ['kc', { q: 'Your patient is in VT and has no pulse. What is the treatment?', o: ['CPR and defibrillation', 'Synchronized cardioversion', 'Adenosine', 'Vagal maneuvers'], a: 0, why: 'Pulseless VT is a shockable cardiac arrest rhythm — start CPR and defibrillate.' }]
        ] },
        { id: 'arrest', title: 'Ventricular fibrillation and asystole', min: 8, blocks: [
          ['p', 'These are cardiac arrest rhythms. Recognize them in seconds — then confirm the patient is pulseless and act.'],
          ['rhythms', ['vf', 'asystole']],
          ['p', '<b>Ventricular fibrillation</b> is shockable: start CPR and defibrillate as soon as possible, then give epinephrine and an antiarrhythmic per protocol. <b>Asystole</b> is not shockable: confirm it in a second lead and check that the gain and electrodes are correct — fine VF can look flat — then continue CPR and give epinephrine.'],
          ['p', 'Pulseless VT and VF are the <b>shockable</b> arrest rhythms. Asystole and PEA are <b>not shockable</b>; for them, high-quality CPR, epinephrine and a search for reversible causes are the priorities.'],
          ['classify', { title: 'Shockable or not?', prompt: 'If this patient were pulseless, would the rhythm be shockable?', options: ['Shockable', 'Not shockable'], items: { vf: 0, vt: 0, torsades: 0, asystole: 1, idio: 1 }, n: 5 }],
          ['kc', { q: 'The monitor shows a flat line. What should you do before calling it asystole?', o: ['Confirm in a second lead and check the leads and gain', 'Defibrillate immediately', 'Give atropine', 'Start synchronized cardioversion'], a: 0, why: 'A loose lead or low gain can mimic asystole, and fine VF can look flat. Confirm before you treat.' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 12, practice: true, blocks: [
          ['p', 'Identify each strip. For wide-complex rhythms, look at the rate and regularity, and ask whether this patient would have a pulse. Identify at least three, then work through the scenarios.'],
          ['practice', ['pvc', 'bigeminy', 'multifocal', 'idio', 'aivr', 'vt', 'torsades', 'vf', 'asystole']],
          ['case', { title: 'Scenario: collapse at the gym', rhythm: 'vf', vitals: { Pulse: 'None', Breathing: 'Agonal', Response: 'Unresponsive' },
            text: 'A 52-year-old man collapsed on a treadmill. Bystander CPR is in progress when you arrive and attach the monitor.',
            qs: [
              { q: 'What is the rhythm?', o: ['Ventricular fibrillation', 'Asystole', 'Ventricular tachycardia', 'Artifact from CPR'], a: 0, why: 'Chaotic waveform with no identifiable P, QRS or T waves.' },
              { q: 'What is your immediate priority?', o: ['Defibrillate as soon as possible, with high-quality CPR', 'Give atropine', 'Synchronized cardioversion', 'Get a 12-lead first'], a: 0, why: 'VF is shockable. Early defibrillation and CPR with minimal interruptions save lives.' }
            ] }],
          ['case', { title: 'Scenario: wide and fast', rhythm: 'vt', vitals: { HR: '170', BP: '110/70', SpO2: '96%', Mental: 'Alert' },
            text: 'A 64-year-old man with a history of heart attack has chest pressure and palpitations. He is alert and talking.',
            qs: [
              { q: 'What is the rhythm?', o: ['Ventricular tachycardia', 'SVT', 'Sinus tachycardia', 'Atrial fibrillation'], a: 0, why: 'Wide, regular and fast — VT until proven otherwise.' },
              { q: 'He has a pulse and is stable. What is appropriate?', o: ['12-lead, antiarrhythmic per protocol, and prepare to cardiovert', 'Defibrillate now', 'Vagal maneuvers only', 'Atropine'], a: 0, why: 'Stable VT with a pulse: 12-lead, antiarrhythmic per protocol and medical direction, and be ready if he deteriorates.' },
              { q: 'His BP falls to 70/40 and he becomes confused. Now what?', o: ['Synchronized cardioversion', 'Wait for the antiarrhythmic to work', 'Adenosine', 'Start CPR without a shock'], a: 0, why: 'VT with a pulse and signs of instability needs synchronized cardioversion.' }
            ] }]
        ] }
      ],
      bank: [
        Q('escape', 'What is the rate of an idioventricular rhythm?', ['20–40/min', '40–60/min', '60–100/min', 'Over 150/min'], 'The ventricles’ intrinsic rate is 20–40/min.'),
        Q('pvcs', 'Bigeminy means:', ['Every other beat is a PVC', 'Two PVCs in a row', 'PVCs with two shapes', 'A PVC every third beat'], 'In bigeminy, a PVC follows every normal beat.'),
        Q('vt', 'Which drug is used for torsades de pointes?', ['Magnesium sulfate', 'Adenosine', 'Atropine', 'Diltiazem'], 'Magnesium is the treatment for torsades (polymorphic VT with a long QT).'),
        Q('arrest', 'Which arrest rhythm is shockable?', ['Ventricular fibrillation', 'Asystole', 'PEA', 'Idioventricular rhythm with no pulse'], 'VF and pulseless VT are shockable. Asystole and PEA are not.'),
        Q('escape', 'AIVR is commonly seen:', ['After blood flow to the heart is restored (reperfusion)', 'In healthy athletes at rest', 'Only in children', 'During vagal maneuvers'], 'AIVR is a classic reperfusion rhythm and is usually short-lived and well tolerated.'),
        Q('pvcs', 'Multifocal PVCs are:', ['PVCs with different shapes from more than one focus', 'PVCs that all look the same', 'PVCs that occur every other beat', 'PVCs that land on the T wave'], 'Different shapes mean more than one irritable focus — a sign of a more irritable heart.'),
        Q('pvcs', 'Three or more PVCs in a row are called:', ['A run of ventricular tachycardia', 'A couplet', 'Bigeminy', 'Trigeminy'], 'Two in a row is a couplet; three or more is a run of VT.'),
        Q('vt', 'VT with a pulse, BP 72/40 and confusion is treated with:', ['Synchronized cardioversion', 'Defibrillation without synchronization', 'Adenosine', 'Observation'], 'Unstable VT with a pulse needs synchronized cardioversion.'),
        Q('arrest', 'Before treating apparent asystole, you should:', ['Confirm it in a second lead and check gain and electrodes', 'Defibrillate', 'Give adenosine', 'Start pacing'], 'Fine VF or a loose lead can mimic asystole.')
      ]
    },

    /* ================================================================ 8 */
    {
      id: 'blocks', title: 'AV Blocks', color: '#7b4bc4', icon: 'block', module: 'blocks',
      summary: 'First-degree, Wenckebach, Mobitz II, 2:1 and complete heart block.',
      lessons: [
        { id: 'first', title: 'First-degree and Wenckebach', min: 10, blocks: [
          ['p', 'AV blocks are all about the <b>relationship between P waves and QRS complexes</b>. March out the P waves first — they are usually regular. Then ask: is the PR constant or changing, and does every P wave produce a QRS?'],
          ['rhythms', ['firstDeg', 'wenck']],
          ['p', 'Wenckebach produces <b>grouped beating</b>: clusters of beats separated by pauses. The PR right after a pause is the shortest; the PR just before the dropped beat is the longest. It is usually at the AV node, often transient, and commonly seen with an inferior MI.'],
          ['measure', { title: 'Measure the PR interval', what: 'pr', pool: ['firstDeg', 'nsr', 'sbrady'] }],
          ['kc', { q: 'Which PR pattern defines second-degree type I (Wenckebach)?', o: ['The PR lengthens progressively until a QRS is dropped', 'The PR is constant, then a QRS is suddenly dropped', 'The PR is long but constant with no dropped beats', 'There is no relationship between P waves and QRS complexes'], a: 0, why: '“Longer, longer, longer, drop — then you have a Wenckebach.”' }]
        ] },
        { id: 'second', title: 'Mobitz II and 2:1 block', min: 9, blocks: [
          ['p', 'In <b>Mobitz II</b> the PR stays the same, then a P wave suddenly fails to conduct. The block is below the AV node, the QRS is often wide, and it can progress to complete heart block without warning. Place pacing pads early.'],
          ['p', 'In a <b>2:1 block</b>, every other P wave is blocked, so there are two P waves for every QRS. Because two conducted beats never occur in a row, you cannot tell whether it is type I or type II from the strip alone.'],
          ['rhythms', ['mobitz2', 'twoToOne']],
          ['kc', { q: 'What is the priority for a patient in Mobitz II?', o: ['Place pacing pads early and be ready to pace', 'Give adenosine', 'Defibrillate', 'No treatment is needed'], a: 0, why: 'Mobitz II can progress suddenly to third-degree block. Pacing is the definitive prehospital treatment if the patient is symptomatic.' }]
        ] },
        { id: 'third', title: 'Third-degree (complete) block', min: 10, blocks: [
          ['p', 'In <b>complete heart block</b>, no impulses get through. The atria and ventricles beat independently. The P waves march through at their own rate, and the ventricles are paced by a slow escape rhythm — narrow if junctional, wide if ventricular. The PR changes randomly, but the R-to-R stays regular.'],
          ['rhythms', ['chb']],
          ['callout', 'Symptomatic complete heart block needs <b>transcutaneous pacing</b>. Atropine is unlikely to work, especially when the escape rhythm is wide.'],
          ['h', 'Comparing the blocks'],
          ['html', BLOCK_TABLE],
          ['classify', { title: 'What is the PR doing?', prompt: 'March out the P waves and describe the PR pattern.', options: ['Long and constant — every P conducts', 'Lengthens until a beat drops', 'Constant, with sudden dropped beats', 'No relationship between P and QRS'], items: { firstDeg: 0, wenck: 1, mobitz2: 2, chb: 3 }, n: 4 }],
          ['kc', { q: 'What is the hallmark of third-degree AV block?', o: ['Regular P waves and a regular QRS rhythm that are unrelated to each other', 'A long but constant PR interval', 'Progressive PR lengthening', 'An irregularly irregular rhythm with no P waves'], a: 0, why: 'AV dissociation: P waves and QRS complexes each keep their own regular rate, with no relationship between them.' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 10, practice: true, blocks: [
          ['p', 'Identify each block. Use the calipers to march out the P waves and measure each PR interval. Identify at least three, then work through the scenarios.'],
          ['practice', ['firstDeg', 'wenck', 'mobitz2', 'twoToOne', 'chb']],
          ['case', { title: 'Scenario: syncope in the kitchen', rhythm: 'chb', vitals: { HR: '34', BP: '70/40', SpO2: '93%', Mental: 'Drowsy' },
            text: 'A 70-year-old man fainted while cooking. He is pale and drowsy. The P waves march through the strip with no relationship to the slow QRS complexes.',
            qs: [
              { q: 'What is the rhythm?', o: ['Third-degree (complete) AV block', 'Sinus bradycardia', 'Second-degree type I', 'First-degree AV block'], a: 0, why: 'Regular P waves and a regular, slow ventricular rhythm with no relationship between them.' },
              { q: 'What is the treatment priority?', o: ['Transcutaneous pacing', 'Adenosine', 'Defibrillation', 'Observation'], a: 0, why: 'He is unstable with complete heart block — pace. Atropine is unlikely to work.' }
            ] }],
          ['case', { title: 'Scenario: inferior MI', rhythm: 'wenck', vitals: { HR: '58 (irregular)', BP: '118/70', SpO2: '97%', Mental: 'Alert' },
            text: 'A 61-year-old woman with an inferior STEMI has grouped beating on the monitor. She is alert and her blood pressure is normal.',
            qs: [
              { q: 'What is the rhythm?', o: ['Second-degree AV block type I (Wenckebach)', 'Second-degree AV block type II', 'Third-degree AV block', 'Sinus arrhythmia'], a: 0, why: 'The PR lengthens until a beat is dropped — grouped beating.' },
              { q: 'She is stable. What is appropriate?', o: ['Monitor closely; treat with atropine only if she becomes symptomatic', 'Immediate transcutaneous pacing', 'Defibrillation', 'Adenosine'], a: 0, why: 'Wenckebach is usually transient and well tolerated, especially with inferior MI.' }
            ] }]
        ] }
      ],
      bank: [
        Q('first', 'First-degree AV block is defined by:', ['A PR over 0.20 s that stays constant', 'Dropped QRS complexes', 'A PR under 0.12 s', 'No P waves'], 'Every impulse is conducted, but each one is delayed.'),
        Q('second', 'Which AV block is most likely to progress suddenly to complete heart block?', ['Second-degree type II (Mobitz II)', 'First-degree', 'Second-degree type I (Wenckebach)', 'Sinus arrhythmia'], 'Mobitz II is a block below the AV node and is unstable.'),
        Q('second', 'In a 2:1 AV block, how many P waves are there for each QRS?', ['2', '1', '3', 'None'], 'Every other P wave is blocked, so there are two P waves for each QRS.'),
        Q('third', 'In complete heart block, the PR interval is:', ['Completely variable — there is no relationship', 'Constant and long', 'Progressively lengthening', 'Short and constant'], 'The atria and ventricles beat independently, so the PR changes randomly.'),
        Q('first', 'Wenckebach often shows which pattern?', ['Grouped beating', 'A sawtooth baseline', 'Wide bizarre complexes', 'A flat line'], 'The repeating cycle of lengthening PR and a dropped beat produces grouped beating.'),
        Q('third', 'What is the definitive prehospital treatment for symptomatic third-degree block?', ['Transcutaneous pacing', 'Adenosine', 'Vagal maneuvers', 'Defibrillation'], 'Pacing is the priority. Atropine is often ineffective, especially with a wide escape rhythm.'),
        Q('second', 'Why can 2:1 block not be called type I or type II from the strip alone?', ['There are never two conducted beats in a row to compare the PR', 'The QRS is always wide', 'There are no P waves', 'The rate is too fast'], 'Without consecutive conducted beats you cannot see whether the PR would lengthen.'),
        Q('first', 'Wenckebach is commonly seen with which type of MI?', ['Inferior', 'Anterior', 'Lateral', 'Posterior only'], 'Wenckebach at the AV node is common and usually transient with inferior MI.')
      ]
    },

    /* ================================================================ 9 */
    {
      id: 'paced', title: 'Pacemaker Rhythms', color: '#16838f', icon: 'pacer', module: 'paced',
      summary: 'Ventricular and dual-chamber pacing, capture, and pacemaker malfunction.',
      lessons: [
        { id: 'paced', title: 'Paced rhythms and capture', min: 8, blocks: [
          ['p', 'A pacemaker produces a sharp, narrow vertical <b>pacer spike</b>. A spike followed by a P wave means <b>atrial capture</b>; a spike followed by a <b>wide QRS</b> means <b>ventricular capture</b>. A paced QRS is wide because the impulse starts in the ventricular muscle and spreads slowly, like a PVC.'],
          ['rhythms', ['vpaced', 'avpaced']],
          ['p', 'Electrical capture on the monitor is not enough — confirm <b>mechanical capture</b> by feeling a pulse that matches the paced rate. A paced rhythm also makes ST-segment changes unreliable for spotting a heart attack.'],
          ['classify', { title: 'One spike or two?', prompt: 'Look at the pacer spikes. Which kind of pacing is this?', options: ['Ventricular pacing — one spike per beat', 'Dual-chamber pacing — two spikes per beat'], items: { vpaced: 0, avpaced: 1 }, n: 3 }],
          ['kc', { q: 'A pacer spike followed by a wide QRS means:', o: ['Ventricular capture', 'Failure to capture', 'Atrial capture only', 'Failure to sense'], a: 0, why: 'The ventricles depolarized in response to the spike — that is ventricular capture.' }]
        ] },
        { id: 'failure', title: 'Pacemaker malfunction', min: 8, blocks: [
          ['p', 'There are three main kinds of pacemaker malfunction:'],
          ['list', [
            '<b>Failure to capture</b>: the spike appears, but no complex follows it.',
            '<b>Failure to pace</b>: no spike appears when one is expected.',
            '<b>Failure to sense</b>: the pacemaker fires even though the heart has just beaten on its own.'
          ]],
          ['rhythms', ['failCapture']],
          ['match', { title: 'Name the malfunction', prompt: 'Match each finding to the type of malfunction.', pairs: [
            ['Spike with no complex after it', 'Failure to capture'], ['No spike when one is expected', 'Failure to pace'], ['Spike fires right after the patient’s own beat', 'Failure to sense']] }],
          ['note', 'For a symptomatic patient with a failing pacemaker, treat the bradycardia per protocol — usually transcutaneous pacing. Place the pads <b>at least several centimeters away from the device</b>, never directly over it.'],
          ['kc', { q: 'A pacer spike appears but is not followed by a QRS. What is this?', o: ['Failure to capture', 'Failure to pace', 'Normal ventricular pacing', 'Failure to sense'], a: 0, why: 'The pacemaker fired, but the heart did not respond — failure to capture.' }]
        ] },
        { id: 'practice', title: 'Practice and scenarios', min: 8, practice: true, blocks: [
          ['p', 'Identify each paced rhythm. Look for spikes, then check that each one is followed by a complex. Identify at least three, then work through the scenario.'],
          ['practice', ['vpaced', 'avpaced', 'failCapture', 'idio', 'chb']],
          ['case', { title: 'Scenario: weak and dizzy with a pacemaker', rhythm: 'failCapture', vitals: { HR: '36', BP: '78/46', SpO2: '95%', Device: 'Pacemaker, left chest' },
            text: 'An 84-year-old woman with a pacemaker feels weak and dizzy. Some pacer spikes on the monitor are not followed by a QRS.',
            qs: [
              { q: 'What is the problem?', o: ['Pacemaker failure to capture', 'Normal ventricular pacing', 'Failure to sense', 'Atrial fibrillation'], a: 0, why: 'Spikes without a following complex mean failure to capture.' },
              { q: 'Where should you place the pacing pads?', o: ['At least several centimeters away from the device', 'Directly over the device', 'On her abdomen', 'It does not matter'], a: 0, why: 'Pads directly over the generator can damage it and reduce the energy delivered.' }
            ] }]
        ] }
      ],
      bank: [
        Q('paced', 'Why is a ventricular paced QRS wide?', ['The impulse starts in the ventricle and spreads slowly', 'The pacemaker battery is low', 'The atria are blocked', 'It is always artifact'], 'Like a PVC, a paced beat starts in the ventricular muscle rather than using the fast conduction system.'),
        Q('paced', 'A dual-chamber (AV sequential) paced rhythm shows:', ['Two spikes per beat — one before the P wave and one before the QRS', 'One spike before every P wave only', 'No spikes', 'Spikes with no complexes'], 'The device paces the atria, waits a programmed delay, then paces the ventricles.'),
        Q('failure', 'Failure to pace means:', ['No pacer spike when one is expected', 'A spike without a following complex', 'A spike that lands on a T wave', 'A narrow paced QRS'], 'The pacemaker did not fire at all when it should have.'),
        Q('paced', 'How should you confirm mechanical capture in a paced patient?', ['Feel for a pulse that matches the paced rate', 'Look at the QRS width only', 'Increase the monitor gain', 'Switch to Lead I'], 'Electrical capture on the monitor must be confirmed with a matching palpable pulse.'),
        Q('failure', 'Where should defibrillation or pacing pads go in a patient with an implanted pacemaker?', ['At least several centimeters away from the device', 'Directly over the device', 'On the abdomen', 'It does not matter'], 'Placing pads directly over the generator can damage the device and reduce current delivery.'),
        Q('failure', 'Failure to sense means the pacemaker:', ['Fires even though the heart has just beaten on its own', 'Does not fire at all', 'Fires but does not capture', 'Paces both chambers'], 'The device does not “see” the patient’s own beats, so it fires inappropriately.'),
        Q('paced', 'Why are ST changes unreliable in a ventricular paced rhythm?', ['The wide paced QRS changes the ST segment and T wave', 'Pacemakers hide the P waves', 'The rate is always too fast', 'The leads are reversed'], 'A paced rhythm makes ST-segment interpretation for ACS unreliable.')
      ]
    }
  ];

  // Tag each bank question with its unit so final-exam feedback can link to the lesson.
  UNITS.forEach(function (u) { u.bank.forEach(function (q) { q.unit = u.id; }); });

  global.ECGCourse = {
    UNITS: UNITS,
    PASS: 80,
    EXAM: { concept: 10, strips: 15 },
    unitById: function (id) { return UNITS.filter(function (u) { return u.id === id; })[0]; }
  };
})(window);

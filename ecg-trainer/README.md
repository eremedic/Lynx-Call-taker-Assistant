# CSHealthED ECG Trainer

An interactive 3-lead ECG rhythm interpretation trainer for paramedic students, branded for **CSHealthED — Healthcare Education Software**.

It is a static website (HTML, CSS and plain JavaScript, with no build step and no server), so it can be hosted anywhere.

## What's inside

| Module | Content |
|---|---|
| 1 · Foundations | Conduction system and intrinsic rates, an annotated beat (P, QRS, T, PR, ST, QT), ECG paper, 3-lead electrode placement with Einthoven's triangle, the 5-step systematic approach, and an interactive **rate trainer** |
| 2 · Sinus | NSR, sinus bradycardia, sinus tachycardia, sinus arrhythmia, sinus arrest |
| 3 · Atrial | PACs, wandering atrial pacemaker, MAT, atrial flutter, atrial fibrillation, SVT |
| 4 · Junctional | PJCs, junctional escape, accelerated junctional, junctional tachycardia |
| 5 · Ventricular | Unifocal PVCs, bigeminy/trigeminy, multifocal PVCs, idioventricular, AIVR, VT, torsades, VF, asystole |
| 6 · AV Blocks | 1st degree, 2nd degree type I (Wenckebach), 2nd degree type II, 2:1, 3rd degree |
| 7 · Pacemaker | Ventricular paced, AV sequential paced, failure to capture |
| 8 · Final exam | 20 mixed rhythms from every module |

### Self-paced course: Basic ECG Interpretation (`#course`)

A guided course on its own **Course** tab, with 9 units and 34 lessons taken in order:

1. The heart's electrical system (including refractory periods)
2. ECG paper, waves and leads
3. The systematic approach, rate and stability
4. Sinus rhythms
5. Atrial rhythms
6. Junctional rhythms
7. Ventricular rhythms
8. AV blocks
9. Pacemaker rhythms

Each lesson includes:

- **Narration.** Lessons are read aloud with the browser's speech synthesis, with play/pause, skip and speed controls. The paragraph being read is highlighted, and rhythm explorers switch strips as the narration reaches each rhythm.
- **Interactive strips** and comparison tables (PAC/PJC/PVC, irregular narrow rhythms, AV blocks).
- **Knowledge checks.**
- **Reinforcement activities.** These come in eight kinds:
  - matching
  - put-in-order
  - sorting
  - live-strip classification (for example regularity, narrow vs wide, shockable or not, PR pattern)
  - box and rate calculation drills
  - caliper measurement of PR and R-to-R intervals on live strips
  - a guided five-step worksheet
  - patient scenarios with a strip and follow-up questions

How a student moves through the course:

- Each rhythm unit ends with unlimited practice ECGs and scenarios.
- A lesson is complete once every knowledge check and activity in it is done. A to-do list at the bottom links to anything left.
- Each unit ends with a quiz: 8 concept questions, or 4 concept questions plus 6 rhythm strips. Passing it with 80% unlocks the next unit.
- After all 9 unit quizzes are passed, a 25-question final exam unlocks: 10 concept questions and 15 strips.
- Passing the exam gives a printable certificate.

Every bank question names the lesson that teaches its answer (`see`), and quiz feedback links back to that lesson.

Progress is stored in `localStorage` under `cshealthed-ecg-course-v1`.

### Separate course: Basic 12-Lead ECG (`#twelve`)

A stand-alone course for after the 3-lead modules:

1. Why acquire a 12-lead (and when)
2. Electrode placement: V1–V6 chest diagram and landmarks
3. The twelve views: the standard 3 × 4 + rhythm-strip layout with color-coded territories (inferior, lateral, septal, anterior) and their usual arteries
4. A systematic 12-lead read
5. Axis: the quadrant method with an interactive hexaxial dial (drag the axis and watch Leads I, aVF and II change)
6. The ST segment and STEMI criteria: an annotated J-point measurement, contiguous leads, reciprocal changes, V4R/V7–V9 and STEMI mimics
7. Case library: normal, inferior, anterior and lateral STEMI, posterior MI, RBBB, LBBB, LVH, pericarditis and hyperkalemia. Each case has an **ST map** that boxes the leads with measured ST elevation or depression.

The 12-lead quiz (10 questions) mixes interpretation, STEMI territory and axis questions. The 12-lead tracings come from `js/ecg12-engine.js`, which models each wave as a 3-D cardiac vector, so limb and precordial leads (and their reciprocal changes) stay consistent.

Each rhythm page includes:

- A realistic strip on standard ECG paper (25 mm/s, 10 mm/mV) with 3-second marks
- **Lead I / II / III / all three leads**. Waveforms are modeled as cardiac vectors, so the leads are physiologically consistent (II = I + III)
- **Live monitor** view with sweep, heart-rate display and an optional QRS tone
- **Calipers**: drag across the strip to measure seconds, small boxes and the equivalent rate
- **New strip**: every strip is generated fresh (rate, timing and morphology vary), so students can't memorize images
- Five-step criteria (rate, regularity, P waves, PR, QRS), a description, recognition tips and prehospital considerations

Quizzes cover each module (10 questions) plus the final exam (20). They use multiple-choice identification with an optional rate estimate, then show a full explanation. The pass mark is 80%. Progress and best scores are saved in the browser's `localStorage`.

### Practice Lab (`#lab`)

Unlimited, randomized interpretation practice. Choose 3-lead rhythm strips, 12-lead ECGs or a mix, and filter rhythm groups. Every tracing is a new "patient": rates, amplitudes, T waves, R-wave progression and PR vary. Optional real-world artifact (muscle tremor, 60 Hz interference, baseline wander) is added at random, and 12-leads come with different underlying rhythms (sinus, bradycardia, tachycardia, atrial fibrillation, first-degree block).

Students fill in a worksheet (rate, rhythm, P waves, QRS and interpretation for strips; rate, rhythm, axis and main finding for 12-leads). Each field is checked against the values measured from the tracing, and session and all-time stats are kept.

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```bash
cd ecg-trainer && python3 -m http.server 8080
```

Then go to http://localhost:8080.

## Deploy

- **Netlify**: create a new site from this repository and set **Base directory** to `ecg-trainer`. The included `netlify.toml` publishes the folder as-is. You can also drag and drop the `ecg-trainer` folder onto Netlify Drop.
- **GitHub Pages, Cloudflare Pages, S3 or any web host**: upload the contents of `ecg-trainer/`.

## Files

```
ecg-trainer/
├── index.html            page shell, header/footer branding
├── css/styles.css        CSHealthED theme (navy / teal / red + module colors)
├── js/ecg-engine.js      waveform synthesis: rhythm generators → Lead I/II/III signals
├── js/ecg-render.js      ECG-paper renderer, animated monitor, calipers
├── js/content.js         modules, rhythm criteria, tips, prehospital notes
├── js/course.js          self-paced course: units, lessons, knowledge checks, question banks
├── js/ecg12-engine.js    12-lead synthesis (3-D vectors), 12-lead layout renderer, ST measurement
├── js/content12.js       12-lead course cases, findings and axis categories
├── js/app.js             routing, lessons, quizzes, reference, progress
└── assets/               CSHealthED logo, emblem, favicon
```

To add a rhythm, write a generator in `ecg-engine.js` (`G.myRhythm = function (rng, dur) {...}`), add its entry to `RHYTHMS` in `content.js`, and list its id in a module's `rhythms` array.

## Disclaimer

Strips are computer-generated simulations for education. Clinical notes are general guidance and do not replace local protocols, medical direction or a 12-lead ECG.

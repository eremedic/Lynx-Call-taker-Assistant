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

Each rhythm page includes:

- A realistic strip on standard ECG paper (25 mm/s, 10 mm/mV) with 3-second marks
- **Lead I / II / III / all three leads**. Waveforms are modelled as cardiac vectors, so the leads are physiologically consistent (II = I + III)
- **Live monitor** view with sweep, heart-rate display and an optional QRS tone
- **Calipers**: drag across the strip to measure seconds, small boxes and the equivalent rate
- **New strip**: every strip is generated fresh (rate, timing and morphology vary), so students can't memorise images
- Five-step criteria (rate, regularity, P waves, PR, QRS), a description, recognition tips and prehospital considerations

Quizzes cover each module (10 questions) plus the final exam (20). They use multiple-choice identification with an optional rate estimate, then show a full explanation. The pass mark is 80%. Progress and best scores are saved in the browser's `localStorage`.

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
├── css/styles.css        CSHealthED theme (navy / teal / red + module colours)
├── js/ecg-engine.js      waveform synthesis: rhythm generators → Lead I/II/III signals
├── js/ecg-render.js      ECG-paper renderer, animated monitor, calipers
├── js/content.js         modules, rhythm criteria, tips, prehospital notes
├── js/app.js             routing, lessons, quizzes, reference, progress
└── assets/               CSHealthED logo, emblem, favicon
```

To add a rhythm, write a generator in `ecg-engine.js` (`G.myRhythm = function (rng, dur) {...}`), add its entry to `RHYTHMS` in `content.js`, and list its id in a module's `rhythms` array.

## Disclaimer

Strips are computer-generated simulations for education. Clinical notes are general guidance and do not replace local protocols, medical direction or a 12-lead ECG.

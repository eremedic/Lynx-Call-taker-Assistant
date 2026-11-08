# CSHealthED Pharmacology Trainer

Paramedic pharmacology practice from **CSHealthED — Healthcare Education Software**. It matches the ECG Trainer's look, including dark mode, and is a static site (HTML, CSS and plain JavaScript, with no build step).

## Sections

| Section | What students do |
|---|---|
| **Flashcards** | Choose drug categories (13) and the facts to test (class, mechanism, indications, contraindications, side effects, adult dose, pediatric dose, how supplied). Then either flip cards (missed cards come back until mastered) or answer multiple-choice questions. |
| **Med Math** | Unlimited randomized problems in 8 skills: unit conversions, percent and ratio solutions, weight-based dosing, volume to administer, weight-based dose to volume, drip rates (gtt/min), pump rates (mL/hr), and infusions or push-dose epinephrine. Each problem shows the medication label when relevant, checks the answer within a tolerance and gives a step-by-step solution. A formula sheet is always visible. |
| **Draw-Up Lab** | A random order and a realistic label. The student calculates the volume, chooses a syringe (1, 3, 5, 10 or 20 mL) and drags the plunger to the line, with keyboard support. Feedback shows the correct volume, the nearest line on the syringe, the dose that would actually be given, whether the syringe choice was best, and the worked math. |
| **Scenarios** | 10 patient cases (chest pain/STEMI, anaphylaxis, opioid overdose, hypoglycemia, pediatric seizure, SVT, VF arrest, post-ROSC shock, severe asthma, trauma hemorrhage). Each mixes decisions, calculations and syringe draw-ups, with feedback after every step. |
| **Exam** | 20 questions: drug knowledge, medication math and draw-ups. Pass mark 80%, with a review list of missed items. |
| **Drug Reference** | 32 medications with full monographs, clinical pearls and labels, plus search. |

Progress is saved in the browser's `localStorage`. The site follows the device's dark-mode setting until the student picks a theme; the choice is shared with the ECG Trainer.

## Labels

Labels are **simulated**. They show what real labels show: generic name, concentration, total amount per volume, route, container type, schedule (C-II to C-IV), Rx only, lot and expiry. Paralytics have the red cap and the "Warning: paralyzing agent" banner. To avoid imitating real products, they carry no manufacturer names or logos, use a placeholder NDC (`0000-…`), and have a "Simulated label · For training only" banner.

## Syringe graduations

| Syringe | Smallest mark | Labeled every |
|---|---|---|
| 1 mL | 0.01 mL | 0.1 mL |
| 3 mL | 0.1 mL | 0.5 mL |
| 5 mL | 0.2 mL | 1 mL |
| 10 mL | 0.2 mL | 1 mL |
| 20 mL | 1 mL | 5 mL |

A draw-up counts as correct within half of the smallest mark on the chosen syringe.

## Run and deploy

Open `index.html` directly, or serve the folder:

```bash
cd pharm-trainer && python3 -m http.server 8080
```

To deploy, upload the folder to any static host. On Netlify, set the base directory to `pharm-trainer`. Add `?embed=1` to hide the trainer's own logo and footer when it is framed inside the CSHealthED platform.

## Files

```
pharm-trainer/
├── index.html
├── css/styles.css     CSHealthED design system + pharmacology components
├── js/drugs.js        32-drug database (categories, monographs, label specs)
├── js/labels.js       simulated label and container SVGs
├── js/syringe.js      interactive syringe component
├── js/calc.js         8 med-math problem generators with worked solutions
├── js/scenarios.js    10 practice scenarios
├── js/app.js          routing, flashcards, med math, draw-up lab, scenarios, exam, reference
└── assets/            CSHealthED logo, emblem, favicon
```

## Disclaimer

Educational use only. Doses reflect common EMS practice and AHA guidance, but protocols vary. Always follow local protocols and medical direction.

# CSHealthED · Basic ECG Interpretation

A standalone, self-paced ECG interpretation course for paramedic students, branded CSHealthED. It runs entirely in the browser, with no build step and no server. Progress is saved in the student's browser.

## What's inside

A guided, self-paced course with 9 units and 34 lessons, taken in order:

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

## Run locally

Any static file server works:

```bash
cd ecg-course
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Deploy

On Netlify, create a new site from this repository and set **Base directory** to `ecg-course`. `netlify.toml` here handles the rest (publish the folder as-is, no build command). Any static host works the same way: upload the folder.

## Files

```
ecg-course/
├── index.html            page shell: header, navigation, footer
├── css/styles.css        styles (light and dark themes)
├── js/ecg-engine.js      waveform synthesis: rhythm generators → Lead I/II/III signals
├── js/ecg-render.js      ECG-paper renderer, animated monitor, calipers
├── js/content.js         rhythm criteria, tips and prehospital notes
├── js/course.js          units, lessons, activities, knowledge checks, question banks
├── js/app.js             course pages, narration, activities, quizzes, exam, certificate
├── assets/               logo, emblem, favicon, 3-lead placement illustration
├── netlify.toml
└── README.md
```

`ecg-engine.js`, `ecg-render.js` and `content.js` are shared with the ECG Trainer (`../ecg-trainer`). When you change one there, copy it here too.

## Disclaimer

Strips are computer-generated simulations for education. Clinical notes are general guidance aligned with common EMS practice. Always follow local protocols and medical direction.

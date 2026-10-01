# Lynx Call-Taker Assistant

Real-time decision support for ambulance call takers. While the caller is on the phone, Lynx listens to (or reads) the conversation, picks out clinical details, prompts the call taker with the next question to ask, and continuously evaluates whether the transport meets **CMS medical-necessity** requirements for ambulance transport.

An **admin dashboard** lets supervisors add, edit, reorder, and deactivate questions, so anything the built-in bank or the AI misses can be added without touching code.

> **Decision support only.** Lynx does not make coverage determinations. Final decisions must rest on complete documentation, 42 CFR 410.40, the Medicare Benefit Policy Manual (Pub. 100-02) Ch. 10, and your MAC's local coverage policies.

## Features

**Call-taker console** (`/`)
- **Live conversation capture.** Uses the browser's speech recognition (Chrome or Edge) to transcribe as the caller talks. Call takers can also type or paste notes.
- **Detection from the conversation.** Phrases like "bedbound", "on 2 liters nasal cannula", "stage 4 sacral wound", or "no chest pain" become suggested answers, each with the quoted evidence. Negations ("not on oxygen") and corrections ("he can walk… actually he cannot walk") are handled. The call taker accepts each suggestion with one click.
- **"Ask next" prompt.** Shows the most important unanswered question, followed by the next three. Ranking uses priority, whether it's required, and whether something said in the conversation makes it relevant.
- **Conditional questions.** Some questions only appear when relevant words are heard (for example, "heparin drip" brings up the titration/SCT question). Follow-ups appear when a parent question gets a specific answer.
- **Live CMS assessment.** Shows the status (meets / likely / needs review / does not meet / gathering info), the three-part bed-confinement test, supporting conditions, disqualifiers, alerts, missing required items, and documentation requirements (PCS, the 60-day rule for repetitive transports, the 48-hour rule for non-repetitive ones).
- **Recommended level of service.** BLS, ALS1, or SCT, emergency or non-emergency, with the HCPCS code (A0428/A0429/A0426/A0427/A0434).
- **Emergency screening.** A banner tells the call taker to transfer to 911 when red-flag symptoms come up on a non-emergency call.
- **Save, copy, and print.** Save the call record, copy a narrative for the trip record or PCS request, or print a summary.
- **Optional AI analysis (Claude).** Suggests answers, writes a short summary, and proposes follow-up questions the bank doesn't cover.

**Admin dashboard** (`/admin.html`, password protected)
- **Overview:** question-bank and call statistics, plus recent calls.
- **Question Bank:** search and filter, add or edit questions, activate or deactivate, reorder, and delete custom questions. For each question you can set:
  - wording, category, guidance text, answer type (yes/no, choice, text, number)
  - **criterion**: emergency screen, bed confinement, supports necessity, ALS/SCT indicator, disqualifier, documentation, or information
  - qualifying answer, priority, required flag, and which call types it applies to
  - **trigger words** (only ask when heard), **detection phrases** for yes and no, and follow-up rules
  - **alerts** shown to the call taker for a specific answer
- **Call Log:** every saved call with its assessment, responses, and transcript.
- **Settings:** organization name and AI on/off and auto-analyze toggles.

## Quick start

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`).

```bash
npm install
ADMIN_PASSWORD='choose-a-strong-password' npm start
```

- Console: http://localhost:3000/
- Admin: http://localhost:3000/admin.html

On first run, the database (`data/lynx.db`) is created and loaded with the default CMS question bank.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_PASSWORD` | `admin` (warns at startup) | Admin dashboard password |
| `DB_PATH` | `data/lynx.db` | SQLite database file |
| `ANTHROPIC_API_KEY` | — | Turns on Claude-powered transcript analysis |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for AI analysis |

### Tests

```bash
npm test
```

## How the assessment works

Each question has a **criterion** that tells the engine (`server/engine/evaluate.js`) how to use the answer:

| Criterion | Effect |
|---|---|
| Emergency screen | A qualifying answer raises a critical "transfer to 911" alert |
| Bed confinement | CMS test: unable to get up from bed without help, **and** unable to ambulate, **and** unable to sit in a chair or wheelchair. All three are required. |
| Supports necessity | Any qualifying answer supports ambulance transport (oxygen, IV, restraints, fractures, contractures, wounds, isolation, bariatric, and others) |
| ALS / SCT indicator | Supports necessity and raises the level of service (cardiac monitoring → ALS; vent or titrated drips → SCT) |
| Disqualifier | The patient could travel by other means, or the request is for convenience. Gives "does not meet", or "needs review" if it conflicts with a qualifying condition. |
| Documentation | PCS and prior authorization. A non-qualifying answer is flagged as a documentation gap. |
| Information | Recorded only. Alerts can still be attached. |

Status logic:
- **Meets:** support is established, no disqualifiers, and every required item and document is in place.
- **Likely meets:** support is established, but required items or documentation are still open.
- **Needs review:** support and a disqualifier conflict.
- **Does not meet:** a disqualifier applies, or every criterion has been answered without support.
- **Gathering information:** none of the above yet.

The client sends call state to `POST /api/evaluate`, so admin changes to the question bank take effect on the next call. Saved calls are re-evaluated on the server.

## Project layout

```
server/
  index.js            entry point
  app.js              Express app, REST API, admin auth
  db.js               SQLite schema and repositories (questions, calls, settings)
  seed-questions.js   default CMS question bank
  ai.js               optional Claude transcript analysis
  engine/detect.js    phrase detection with negation handling
  engine/evaluate.js  medical-necessity evaluation and question prioritization
public/
  index.html, js/console.js   call-taker console
  admin.html, js/admin.js     admin dashboard
  css/app.css                 shared styles
test/                 engine and API tests (node:test)
```

## Capturing caller audio

Browser speech recognition listens to the computer's **microphone**. To capture both sides of the call, route the phone audio into the computer (a softphone, a USB phone adapter, or a headset with a mixed-audio output). Speech recognition in Chrome and Edge is processed by the browser vendor's cloud service. Check that this fits your privacy policy, or replace it with a HIPAA-eligible speech-to-text service (see roadmap).

## Security and PHI

Call records and transcripts contain protected health information. Before production use:
- Run behind HTTPS and set a strong `ADMIN_PASSWORD`.
- Add call-taker authentication. The console is currently open to anyone who can reach the server.
- Only enable AI analysis under a Business Associate Agreement that covers the AI provider.
- Set backup, retention, and access-audit policies for `data/lynx.db`.

## Roadmap ideas

- Call-taker accounts and role-based access, with audit logging
- HIPAA-eligible streaming speech-to-text with speaker separation (caller vs. call taker)
- Per-payer and per-MAC rule sets (Medicaid, Medicare Advantage, commercial)
- PCS form generation and e-signature request to the facility
- CAD/dispatch and billing system integration
- Reporting on denial risk and call-taker performance

# Lynx Call-Taker Assistant

Real-time decision support for ambulance call takers. While the caller is on the phone, Lynx listens to (or reads) the conversation, picks out clinical details, prompts the call taker with the next question to ask, and continuously evaluates whether the transport meets **CMS medical-necessity** requirements for ambulance transport.

An **admin dashboard** lets supervisors add, edit, reorder, and deactivate questions, so anything the built-in bank or the AI misses can be added without touching code.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/eremedic/Lynx-Call-taker-Assistant?quickstart=1)

> **Decision support only.** Lynx does not make coverage determinations. Final decisions must rest on complete documentation, 42 CFR 410.40, the Medicare Benefit Policy Manual (Pub. 100-02) Ch. 10, and your MAC's local coverage policies.

## Features

**Accounts and sign-in** (`/login.html`)
- **Two roles.** *Call Taker* uses the console. *Administrator* also manages questions, users, settings, and the audit log.
- **Temporary passwords.** Each new account gets one, and the user must choose their own at first sign-in. Passwords need at least 10 characters with letters and numbers, and can't contain the username.
- **Lockout.** Five failed sign-ins lock the account for 15 minutes. An administrator password reset clears the lock.
- **Sessions** last 12 hours. Deactivating an account or resetting its password signs that user out everywhere. Accounts are deactivated, never deleted, so the audit trail stays intact.

**Audit log**
- **Append-only.** Database triggers block every update and delete.
- **What's recorded:** sign-ins, failed sign-ins, lockouts, sign-outs, and password changes; access denials; every call saved; every time an administrator opens the call log or a call record (PHI access); every transcript sent to the AI service; question, user, and settings changes, with before and after values; audit exports.
- **Each entry** has a timestamp (UTC), user, action, record, details, and IP address.
- **Filtering and export:** filter by user, action, date, or text, and export to CSV.

**Payer rules** (Original Medicare, Medicare Advantage, Medicaid, Commercial, Private pay, Facility pay, and any transport brokers you add)
- **Choose the payer at the start of the call.** That selection sets which questions are asked, how prior authorization is handled, the documentation checklist, and the authorization contacts shown to the call taker.
- **Prior authorization per call type.** Each payer has a policy (*Required*, *Varies — verify*, or *Not required*) for emergency, non-emergency, and repetitive calls. The console asks for the authorization status only when the policy calls for it, and makes it required when the policy is *Required*. A pending authorization keeps the call from reaching "meets". A denied one raises a critical alert.
- **Medicare Advantage.** No prior auth on emergency calls (42 CFR 422.113). Prior auth and network status are checked on non-emergency calls. The call taker records the plan name and the authorization number. Patients who don't qualify for ambulance are referred to the plan's supplemental transportation benefit.
- **Medicaid.** The call taker verifies eligibility for the date of service and completes the state's certification form instead of the Medicare PCS. Dual-eligible patients get a payer-of-last-resort alert (bill Medicare first). Managed-care (MCO) members get an alert too. Patients who don't qualify for ambulance are referred to the state NEMT broker (42 CFR 431.53).
- **Private pay and facility pay.** These payers skip every medical-necessity question: no bed-confinement test, clinical conditions, PCS, or prior authorization. The console shows "Medical Necessity Not Required" and asks only for the emergency screen, the reason for transport, and the payment details (the responsible party and quoted-rate agreement for private pay; the paying facility, who authorized it, and the PO number for facility pay). Any payer can be switched to this mode with the **Requires medical-necessity review** setting. Each question has a **Medical-necessity question** checkbox that controls whether it's skipped.
- **Transport brokers.** Add them under **Admin → Payers & Brokers → + Add Broker** (for example a Medicaid NEMT broker or a Medicare Advantage transportation vendor).
  - Brokers appear in their own group in the call taker's payer list.
  - Each broker records the payer program it books for. Its calls get that program's questions plus a required broker trip number.
  - Each broker has its own prior-authorization policy and its own phone, fax, email, and portal.
  - When the parent payer is selected, its brokers are listed in the payer panel, so the call taker can make referrals.
- **State and plan differences.** Medicaid and Medicare Advantage rules vary by state and plan. Administrators can edit the built-in profiles or add one per state program or plan (for example "Texas Medicaid — Superior"), and scope custom questions to it.

**Call-taker console** (`/`)
- **Live conversation capture.** Uses the browser's speech recognition (Chrome or Edge) to transcribe as the caller talks. Call takers can also type or paste notes.
- **Detection from the conversation.** Phrases like "bedbound", "on 2 liters nasal cannula", "stage 4 sacral wound", or "no chest pain" become suggested answers, each with the quoted evidence. Negations ("not on oxygen") and corrections ("he can walk… actually he cannot walk") are handled. The call taker accepts each suggestion with one click.
- **"Ask next" prompt.** Shows the most important unanswered question, followed by the next three. Ranking uses priority, whether it's required, and whether something said in the conversation makes it relevant.
- **Conditional questions.** Some questions only appear when relevant words are heard (for example, "heparin drip" brings up the titration/SCT question). Follow-ups appear when a parent question gets a specific answer.
- **Live CMS assessment.** Shows the status (meets / likely / needs review / does not meet / gathering info), the three-part bed-confinement test, supporting conditions, disqualifiers, alerts, missing required items, and documentation requirements (PCS, the 60-day rule for repetitive transports, the 48-hour rule for non-repetitive ones).
- **Recommended level of service.** BLS, ALS1, or SCT, emergency or non-emergency, with the HCPCS code (A0428/A0429/A0426/A0427/A0434).
- **Emergency screening.** A banner tells the call taker to transfer to 911 when red-flag symptoms come up on a non-emergency call.
- **Save, copy, and print.** Save the call record (attributed to the signed-in call taker), copy a narrative for the trip record or PCS request, or print a summary.
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
- **Payers & Brokers:** add transport brokers and edit payer profiles, including the prior-authorization policy for each call type, certification and documentation requirements, alternate-transport guidance, and authorization contacts.
- **Users:** add call takers and administrators, change roles, deactivate accounts, and reset passwords.
- **Audit Log:** search, filter, and export the audit trail.
- **Settings:** organization name and AI on/off and auto-analyze toggles.

## Try it in your browser (GitHub Codespaces)

1. Click **[Open in GitHub Codespaces](https://codespaces.new/eremedic/Lynx-Call-taker-Assistant?quickstart=1)** and then **Create codespace**.
2. Wait a minute or two while it installs. The server starts automatically in the terminal panel.
3. The terminal shows the **first-run administrator username and temporary password**. Copy the password.
4. The app opens in a new browser tab. If it doesn't, open the **Ports** tab and click the globe icon next to port 3000. Sign in as `admin` and choose your own password.
5. Go to **Admin → Users** to create call-taker accounts. To test as a call taker, sign in with a different browser or a private window.

**Can't find the password?** Open a terminal (**Ctrl + `**, or ☰ → Terminal → New Terminal) and run `npm run reset-password -- admin`. It prints a new temporary password that works right away. Until the administrator has signed in once, restarting the server also prints a fresh password.

Codespaces stops after a period of inactivity. Your data stays in the codespace until you delete it. Personal GitHub accounts include free monthly Codespaces hours.

## Run it on your own computer

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`).

```bash
npm install
npm start
```

Then open http://localhost:3000. On first run:
- The database (`data/lynx.db`) is created and loaded with the default CMS question bank.
- An administrator account is created. Its temporary password is printed in the terminal, or it's the value of `ADMIN_PASSWORD` if you set one. A new password is required at first sign-in.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ADMIN_USERNAME` | `admin` | Username for the first administrator (first run only) |
| `ADMIN_PASSWORD` | randomly generated | Temporary password for the first administrator (first run only) |
| `COOKIE_SECURE` | — | Set to `true` to mark session cookies Secure (when served over HTTPS) |
| `TRUST_PROXY` | — | Express `trust proxy` setting, so the audit log records real client IPs behind a reverse proxy |
| `DB_PATH` | `data/lynx.db` | SQLite database file |
| `ANTHROPIC_API_KEY` | — | Turns on Claude-powered transcript analysis |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model used for AI analysis |

### Account recovery

```bash
npm run reset-password -- <username>
```

This issues a new temporary password, reactivates the account, and records the reset in the audit log.

### Tests

```bash
npm test
```

## How the assessment works

Questions can be limited to specific call types and specific payers. Each question has a **criterion** that tells the engine (`server/engine/evaluate.js`) how to use the answer:

| Criterion | Effect |
|---|---|
| Emergency screen | A qualifying answer raises a critical "transfer to 911" alert |
| Bed confinement | CMS test: unable to get up from bed without help, **and** unable to ambulate, **and** unable to sit in a chair or wheelchair. All three are required. |
| Supports necessity | Any qualifying answer supports ambulance transport (oxygen, IV, restraints, fractures, contractures, wounds, isolation, bariatric, and others) |
| ALS / SCT indicator | Supports necessity and raises the level of service (cardiac monitoring → ALS; vent or titrated drips → SCT) |
| Disqualifier | The patient could travel by other means, or the request is for convenience. Gives "does not meet", or "needs review" if it conflicts with a qualifying condition. |
| Documentation | PCS, state certification forms, eligibility checks. A non-qualifying answer is flagged as a documentation gap. |
| Prior authorization | Asked only when the selected payer's policy for the call type is *Required* or *Varies*, and required when it is *Required*. A non-qualifying answer (Pending or Denied) is a documentation gap. |
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
  app.js              Express app, REST API, access control, audit hooks
  auth.js             password hashing (scrypt), sessions, lockout
  reset-password.js   command-line password recovery
  db.js               SQLite schema and repositories (questions, calls, settings, users, sessions, audit log)
  seed-questions.js   default question bank (CMS criteria + payer-specific questions)
  seed-payers.js      default payer profiles
  ai.js               optional Claude transcript analysis
  engine/detect.js    phrase detection with negation handling
  engine/evaluate.js  medical-necessity evaluation and question prioritization
public/
  login.html, js/login.js     sign-in and password change
  index.html, js/console.js   call-taker console
  admin.html, js/admin.js     admin dashboard
  css/app.css                 shared styles
test/                 engine and API tests (node:test)
```

## Capturing caller audio

Browser speech recognition listens to the computer's **microphone**. To capture both sides of the call, route the phone audio into the computer (a softphone, a USB phone adapter, or a headset with a mixed-audio output). Speech recognition in Chrome and Edge is processed by the browser vendor's cloud service. Check that this fits your privacy policy, or replace it with a HIPAA-eligible speech-to-text service (see roadmap).

## Security and PHI

Call records and transcripts contain protected health information. Before production use:
- Run behind HTTPS with `COOKIE_SECURE=true`, and set `TRUST_PROXY` if behind a load balancer.
- Give each person their own account. Never share logins; the audit trail depends on it.
- Review the audit log regularly, and export it to your long-term retention system.
- Only enable AI analysis under a Business Associate Agreement that covers the AI provider.
- Set backup, retention, and access-audit policies for `data/lynx.db`.

## Roadmap ideas

- Single sign-on (SAML/OIDC) and multi-factor authentication
- HIPAA-eligible streaming speech-to-text with speaker separation (caller vs. call taker)
- PCS form generation and e-signature request to the facility
- CAD/dispatch and billing system integration
- Reporting on denial risk and call-taker performance

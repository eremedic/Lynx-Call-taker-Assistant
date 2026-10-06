# AmbuIntake — AI call-taker assistant

Real-time decision support for ambulance call takers. While the caller is on the phone, AmbuIntake listens to (or reads) the conversation, picks out clinical details, prompts the call taker with the next question to ask, and continuously evaluates whether the transport meets **CMS medical-necessity** requirements for ambulance transport.

An **admin dashboard** lets supervisors add, edit, reorder, and deactivate questions, so anything the built-in bank or the AI misses can be added without touching code.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/eremedic/Lynx-Call-taker-Assistant?quickstart=1)

> **Decision support only.** AmbuIntake does not make coverage determinations. Final decisions must rest on complete documentation, 42 CFR 410.40, the Medicare Benefit Policy Manual (Pub. 100-02) Ch. 10, and your MAC's local coverage policies.

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
- **PCS form generation.** **Generate PCS form** saves the call and opens a prefilled Physician Certification Statement in a new tab. Use **Print / Save as PDF** to print it, fax it, or email it to the facility for the practitioner to sign.
  - **Prefilled from the call:** patient, payer, transport details, diagnosis, the "other transport contraindicated" answer, the three bed-confinement criteria, every condition with qualifying ones checked, level of service, and the certifying practitioner named on the call.
  - **The certification page** has the certification statement, practitioner-type checkboxes, the non-physician attestation, signature and date lines, and the 60-day (repetitive) or 48-hour (non-repetitive) rule.
  - **Edit before printing** lets the call taker correct fields or checkboxes on the printout. These edits aren't saved to the call record.
  - **Notices on the form** flag emergency calls, payers that don't require a PCS, possible state Medicaid forms, and calls where no qualifying condition was found.
  - **Where to open it:** administrators can open the PCS for any call from the Call Log. Call takers can open the PCS only for their own calls. Each generation is recorded in the audit log.
  - **Saving twice** updates the same call record, so regenerating the PCS after changes doesn't create duplicates.
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

## Deploy to Netlify (with Supabase)

On Netlify, the pages in `public/` are served as a static site. The API runs as a Netlify Function (`netlify/functions/api.mjs`), and all data lives in your Supabase Postgres database. `netlify.toml` already holds the build settings.

### 1. Get your Supabase connection string
1. In Supabase, open your project and click **Connect** at the top.
2. Copy the **Transaction pooler** connection string (port **6543**). This mode is meant for serverless functions like Netlify's. It looks like:
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres`
3. Replace `[YOUR-PASSWORD]` with your database password. If the password contains symbols such as `@ : / # ?`, URL-encode them (for example `@` → `%40`).

**Optional: create the tables yourself.** Instead of letting the app do it, open Supabase → **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql) and then [`supabase/seed.sql`](supabase/seed.sql). Both are safe to run again, and they give exactly the database the app would create. User accounts aren't in these files: the first administrator is still created from `ADMIN_USERNAME` / `ADMIN_PASSWORD` the first time the app starts.

AmbuIntake creates its own tables the first time it starts. They go in a separate **`ambuintake`** schema, so they never touch your other Supabase tables. Row-level security is turned on, so Supabase's public `anon` and `authenticated` API keys can't read them.

### 2. Create the Netlify site
1. In Netlify, choose **Add new site → Import an existing project → GitHub**, then pick this repository and the branch to deploy.
2. Keep the build settings Netlify reads from `netlify.toml`: publish directory `public`, functions in `netlify/functions`.
3. Before deploying, add the environment variables below under **Site configuration → Environment variables**.

### 3. Environment variables

| Variable | Value | Required |
|---|---|---|
| `DATABASE_URL` | Your Supabase Transaction pooler connection string (step 1) | **Yes** (mark as secret) |
| `ADMIN_PASSWORD` | A temporary password for the first administrator. You'll be asked to change it at first sign-in. | **Yes, for the first deploy** (mark as secret) |
| `ADMIN_USERNAME` | Username for the first administrator | No (default `admin`) |
| `COOKIE_SECURE` | `true` | **Yes** |
| `TRUST_PROXY` | `true`, so the audit log records real IP addresses | **Yes** |
| `ANTHROPIC_API_KEY` | Your Anthropic API key, for AI transcript analysis | Only for the AI features (mark as secret) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | No (that's the default) |
| `DATABASE_CA_CERT` | Supabase's SSL certificate (Project Settings → Database → SSL → download), pasted in full | No. Connections are always encrypted; with this set, the server's identity is also verified |
| `DATABASE_POOL_SIZE` | Database connections per function instance | No (default `3`) |

`NODE_VERSION` (22) is already set in `netlify.toml`.

### 4. Deploy and sign in
1. Click **Deploy**. On the first visit, AmbuIntake creates its tables in Supabase and the administrator account. That first load can take a few seconds.
2. Open your site, sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`, and choose a new password.
3. Go to **Admin → Settings** and enter your ambulance service's name (it's printed on PCS forms). Then add call takers under **Admin → Users**.
4. Optional: add your domain under **Domain management**. Netlify sets up HTTPS automatically.

**Good to know**
- **Admin password reset:** the `ADMIN_PASSWORD` variable is only used to create the first administrator. To reset a lost administrator password, run `DATABASE_URL="…" npm run reset-password -- admin` from a Codespace or any computer with the project. Administrators can reset call takers' passwords from **Admin → Users**.
- **Set up the database ahead of time (optional):** run `DATABASE_URL="…" ADMIN_PASSWORD="…" npm run db:setup` once to create the tables and the administrator before the first deploy.
- **AI analysis on Netlify:** Netlify functions time out after 10 seconds on standard plans (longer on paid plans). AI transcript analysis can occasionally take longer. If it does, the console shows an error for that analysis, and everything else keeps working.

## Run it on your own computer or in Codespaces

Requires **Node.js 20+**.

```bash
npm install
npm start
```

Then open http://localhost:3000.
- **Database:** without `DATABASE_URL`, AmbuIntake uses an embedded Postgres database stored in `data/pglite`, so there's nothing to install. With `DATABASE_URL`, it uses that database instead, for example your Supabase project.
- **Administrator:** on first run an administrator account is created. Its temporary password is printed in the terminal, or it's the value of `ADMIN_PASSWORD` if you set one. A new password is required at first sign-in.

### Configuration (local)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | Postgres connection string (e.g. Supabase); without it, the embedded database is used |
| `PGLITE_DIR` | `data/pglite` | Folder for the embedded database |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / generated | First administrator (first run only) |
| `COOKIE_SECURE` / `TRUST_PROXY` | — | Set both to `true` behind HTTPS / a reverse proxy |
| `ANTHROPIC_API_KEY` / `CLAUDE_MODEL` | — / `claude-opus-5-5` | AI transcript analysis |

### Account recovery

```bash
npm run reset-password -- <username>
```

This issues a new temporary password, reactivates the account, and records the reset in the audit log.

### Tests

```bash
npm test                                                   # embedded Postgres
TEST_DATABASE_URL=postgresql://… node --test test/api.test.js   # against a real Postgres server (resets its ambuintake schema; never point this at production)
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
  index.js            local server entry point
  setup-db.js         one-time database setup (npm run db:setup)
  export-sql.js       writes supabase/schema.sql and seed.sql (npm run db:export-sql)
  app.js              Express app, REST API, access control, audit hooks
  auth.js             password hashing (scrypt), sessions, lockout
  reset-password.js   command-line password recovery
  db.js               Postgres schema, migrations and repositories
  db/client.js        Supabase (node-postgres) and embedded (PGlite) connections
  seed-questions.js   default question bank (CMS criteria + payer-specific questions)
  seed-payers.js      default payer profiles
  ai.js               optional Claude transcript analysis
  pcs.js              builds the prefilled PCS from a saved call
  engine/detect.js    phrase detection with negation handling
  engine/evaluate.js  medical-necessity evaluation and question prioritization
supabase/schema.sql, seed.sql  database files for Supabase's SQL Editor (generated)
netlify/functions/api.mjs   Netlify Function running the API
netlify.toml                Netlify build, function and redirect settings
public/
  login.html, js/login.js     sign-in and password change
  index.html, js/console.js   call-taker console
  pcs.html, js/pcs.js         printable PCS form (css/pcs.css)
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
- Set backup and retention policies for the database. On Supabase, check your plan's backups and point-in-time recovery.
- Never use Supabase's service-role or anon keys in the browser. AmbuIntake doesn't need them: the server connects directly with `DATABASE_URL`.

## Roadmap ideas

- Single sign-on (SAML/OIDC) and multi-factor authentication
- HIPAA-eligible streaming speech-to-text with speaker separation (caller vs. call taker)
- E-signature requests and fax delivery of the PCS to the facility
- CAD/dispatch and billing system integration
- Reporting on denial risk and call-taker performance

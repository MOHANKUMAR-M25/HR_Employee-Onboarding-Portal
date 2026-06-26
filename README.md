# From Workflow to Agent — ADLC HR Onboarding Demo

A live demo for the lightning talk **"From Workflow to Agent: How HR Onboarding
Changes When AI Thinks."** It shows what onboarding looks like when a classic
static **SDLC** workflow is replaced by an **ADLC** onboarding *agent* that
reasons about each hire, retrieves the right policy, adapts its plan, retries on
failure, and flags compliance — all from the same goal, with no new code
branches.

The demo ships the *agent* side of that story as a working HR portal: import a
roster (or add hires by hand), pick who to onboard, and watch the agent generate
a personalised plan and welcome email for each one. It's a custom **React +
EmailJS** frontend over a **zero-dependency Java** backend, so it runs anywhere
with just Node and a JDK — no Flowise install, no cloud, no API keys required on
stage.

> The "before" (the rigid SDLC workflow) lives in the talk narrative; this app
> embodies the "after." See **[TALK.md](TALK.md)** for the full stage cue sheet.

---

## What's inside

```
HR Portal_ADLC/
├── backend/                      Zero-dependency Java REST API (JDK HttpServer)
│   ├── src/com/cognizant/adlc/
│   │   ├── Server.java           HTTP routing, CORS, CSV history endpoints
│   │   ├── AdlcAgent.java        the onboarding agent (reasoning + tool calls)
│   │   ├── PolicyStore.java      simulated RAG over the policy docs
│   │   └── Dsl.java / Json.java  tiny helpers (no JSON library, no deps)
│   ├── onboarded-candidates.csv  onboarding history (written at runtime)
│   ├── removed-candidates.csv    removed-candidate audit trail
│   └── run.ps1 / run.sh          compile + run with a stock JDK
├── frontend/                     React (Vite) + EmailJS
│   ├── src/
│   │   ├── App.jsx               portal shell: import/add → select → onboard
│   │   ├── api.js                thin client for the Java backend
│   │   ├── auth.js               client-side session (email/password or Google)
│   │   ├── email.js              EmailJS (mock by default, live via .env)
│   │   ├── parseHires.js         CSV/XLSX import + field normalisation
│   │   ├── assistant.js          offline NL assistant (no LLM, no network)
│   │   └── components/           login, import panel, hire form, results,
│   │                             dashboard, assistant panel, theme toggle…
│   └── .env.example              backend URL, Google client ID, EmailJS config
├── policies/                     mock policy "PDFs" the RAG retrieves from
├── sample-new-hires.csv          a sample roster you can import
├── TALK.md                       the 15–20 min lightning-talk cue sheet
└── README.md
```

The bundled [sample-new-hires.csv](sample-new-hires.csv) is a global roster
(FTEs, contractors and interns across NA, EU, APAC, ASIA and LATAM) chosen to
exercise every branch the agent reasons over:

| Dimension | What the agent does with it |
|---|---|
| **Employment type** (FTE / contractor / intern) | Picks which tools apply — buddy, managed laptop, payroll & benefits vs. BYOD + scoped VPN vs. stipend (no payroll) |
| **Region / country** (esp. EU) | Retrieves the governing policy; raises GDPR + works-council flags for EU hires |
| **Start timing** (quarter-start / mid-quarter / quarter-end) | Live cohort vs. self-paced orientation + manager 1:1 / reserved next-quarter seat |
| **Locale** (greeting) | Localises the welcome email (e.g. "Hallo", "Namaste", "Bonjour") |

Edit the CSV, or add a hire from the form, to demo any combination on stage.

---

## Run it (≈2 minutes)

You need **Node 18+** and a **JDK 17+** (built and tested on Node 25 / JDK 25).
No Maven, no Gradle.

### 1. Start the backend (terminal 1)

```powershell
cd backend
./run.ps1            # compiles src/ to out/, serves http://localhost:8080
```

On macOS/Linux: `cd backend && ./run.sh`

Sanity check: open <http://localhost:8080/api/health> → `{"status":"ok",...}`

### 2. Start the frontend (terminal 2)

```powershell
cd frontend
npm install          # first time only
npm run dev          # opens http://localhost:5173
```

### 3. Drive the demo

1. **Sign in.** Any valid email + a 4-character password works (auth is local to
   the demo), or use the Google button. There's no auth backend — see *Auth* below.
2. **Choose who to onboard** on the **Onboarding** tab:
   - **Import file** — drop a `.csv`/`.xlsx` (try `sample-new-hires.csv`); rows
     load into a candidate table you can search, select, edit and trim, or
   - **Add a new hire** — fill the form to append one candidate.
3. **Select** the candidates you want and click **▶ Onboard**. The agent
   generates a plan for each, then the welcome emails are sent (mock by default).
4. Open the **Dashboard** tab for analytics over everything onboarded so far,
   or use the floating **AI assistant** (bottom-right) to drive the portal by
   typing plain English — e.g. *"import the sample, onboard all interns in Asia."*

---

## How it works

### Backend — a tiny REST API (no frameworks)

[`Server.java`](backend/src/com/cognizant/adlc/Server.java) runs on the JDK's
`com.sun.net.httpserver` and exposes:

| Route | Purpose |
|---|---|
| `GET /api/health` | Liveness probe (the UI shows *service online/offline*) |
| `POST /api/onboard` | Takes one new-hire JSON object → returns its personalised onboarding plan |
| `GET/POST /api/onboarded` | Onboarding history CSV — GET reads it, POST appends a sent invitation |
| `GET/POST /api/removed` | Removed-candidate audit trail CSV |
| `GET/POST /api/candidates` | The working-roster store — POST persists the edited roster (and mirrors it to the sample) |
| `GET /api/sample` | The curated `sample-new-hires.csv` — what the assistant's "import sample" loads (with your saved edits) |

History and the working roster are persisted as plain CSV files in `backend/`
(`onboarded-candidates.csv`, `removed-candidates.csv`, `candidates.csv`), so the
dashboard and the candidate table survive restarts.

### The agent — [`AdlcAgent.java`](backend/src/com/cognizant/adlc/AdlcAgent.java)

For each hire the agent emits the *shape* of agentic output — reasoning,
tool calls, reflections and compliance flags — by:

1. **Perceiving** the profile into working memory (`hr_lookup`),
2. **Classifying** by employment type / region / department / timing,
3. **Retrieving policy via RAG** ([`PolicyStore.java`](backend/src/com/cognizant/adlc/PolicyStore.java))
   — the right policy doc for *this* profile, with citations,
4. **Drafting a localised welcome email**,
5. **Inviting to Slack** — the first call returns a simulated HTTP 429, so the
   agent reflects and retries instead of failing the run,
6. **Branching on employment type** (contractor → BYOD/liaison, no FTE benefits;
   intern → buddy + laptop, stipend not payroll; FTE → buddy + laptop + payroll),
7. **Raising compliance flags** for EU hires (GDPR Art. 13 + works council),
8. **Scheduling orientation** based on start timing.

> **The reasoning is deterministic, rule-based logic dressed as agent
> "thoughts"** — chosen so the live demo never flakes. The output shape matches a
> real LLM-driven agent, so wiring in the Anthropic API later is a drop-in at
> `AdlcAgent.java`. The `policies/` markdown files are the mock "PDFs" the RAG
> retrieves from — open one on stage to show where a citation comes from.

### Frontend — the portal ([`App.jsx`](frontend/src/App.jsx))

- **Import / add hires** — [`parseHires.js`](frontend/src/parseHires.js) reads
  CSV/XLSX with forgiving header aliasing and normalises values to the enums the
  agent expects. Imported rows become a selectable candidate table; edit an email
  inline or click the ✎ icon to edit a candidate's full details. Every change is
  saved to the backend and mirrored into `sample-new-hires.csv` (non-empty rosters
  only — clearing the table never wipes the sample). The table starts empty on
  load; use the assistant's "import sample" or the Import tab to (re)load the saved
  `sample-new-hires.csv` with your edits.
- **Batch onboarding** — each selected hire is POSTed to `/api/onboard`; the
  results render step-by-step, then welcome emails are bulk-sent. The run button
  locks afterwards so a batch can't be onboarded twice.
- **Dashboard** — pulls the persisted history and shows counts, breakdowns
  (by region / type / department) and searchable tables.
- **Offline AI assistant** ([`assistant.js`](frontend/src/assistant.js)) — a
  deterministic, regex-based "agent" with **no LLM and no network call**. It
  parses plain-English commands into a plan of tool calls, runs them against the
  live portal, and narrates the result — so the assistant demo works on any
  machine, offline, behind any proxy.
- **Theme toggle** — light / dark / system.

---

## Auth (demo-only)

There is no auth backend in this prototype:

- **Email/password** is validated locally (any valid email + 4-character
  password) and the session is kept in `localStorage` so a refresh stays signed in.
- **Google sign-in** uses real Google Identity Services when
  `VITE_GOOGLE_CLIENT_ID` is set; otherwise a clearly-labelled demo Google
  account is used so the flow still reaches the portal on stage.

---

## Email: mock vs live (EmailJS)

The welcome email is generated by the backend and rendered in the UI. Sending is
handled client-side by **EmailJS**.

- **Mock mode (default)** — `VITE_EMAILJS_MODE=mock`. Sending is simulated and a
  confirmation is shown. No account, no network. **Use this on stage.**
- **Live mode** — set in `frontend/.env`:

  ```ini
  VITE_EMAILJS_MODE=live
  VITE_EMAILJS_SERVICE_ID=your_service_id
  VITE_EMAILJS_TEMPLATE_ID=your_template_id
  VITE_EMAILJS_PUBLIC_KEY=your_public_key
  ```

  Your EmailJS template should use: `{{name}}` in the **Subject**, `{{to_email}}`
  as the **To Email**, and `{{message}}` followed by `{{footer}}` in the
  **Content** (body + footer note). Restart `npm run dev` after editing `.env`.

See [`.env.example`](frontend/.env.example) for every setting (backend URL,
Google client ID, EmailJS keys).

---

## What changes when the workflow becomes an agent (the teaching point)

|  | Static SDLC workflow (the "before") | ADLC agent (this demo) |
|---|---|---|
| Control flow | Fixed steps, same for everyone | Plans the tools per hire from one goal |
| New hire type | Needs a new code branch | Reasons about it at runtime |
| Policy | Hard-coded assumptions | Retrieved via RAG (with citations) |
| Failure | Step fails / wrong output | Reflects → retries → escalates |
| Compliance | A blind spot (no step for it) | Flagged for a human, with source |
| Changing it | New release | New prompt / tool — no redeploy |

For a **Germany contractor**, a static workflow would still run its fixed steps
— getting the buddy, IT checklist and benefits *wrong* while silently missing
GDPR and works-council obligations. The agent instead retrieves
`DE-Contractor-Policy.pdf`, skips the inapplicable steps, provisions BYOD, raises
the GDPR flag, and localises the email to "Hallo" — with no new code.

---

## Deploy (live)

The repo ships a GitHub Actions workflow and a Dockerfile so it can run live. The
two halves deploy separately — **GitHub Pages can't run the Java backend.**

### Frontend → GitHub Pages

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the Vite app
and publishes `frontend/dist`. One-time setup:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source = GitHub Actions.**
3. Push to `main` (or run the workflow manually) → the site goes live at
   `https://<you>.github.io/<repo>/`.

Production build settings live in [`frontend/.env.production`](frontend/.env.production)
(email mocked, Google demo button, `VITE_API_BASE` empty → offline-demo mode).
Login, theming and the offline Onboarding Agent work out of the box; onboarding,
persistence and the dashboard need a backend (below).

### Backend → any Docker host (Render / Railway / Fly.io / a VM)

The root [`Dockerfile`](Dockerfile) compiles and runs the Java server. It listens
on `$PORT` (default 8080) and binds `0.0.0.0`, so it works on common PaaS hosts:

```bash
docker build -t onboarding-backend .
docker run -p 8080:8080 onboarding-backend
```

On Render/Railway: new **Web Service** from the repo, runtime **Docker**, deploy —
you'll get a public URL like `https://onboarding-backend.onrender.com`.

### Wire them together

Point the frontend at the backend in [`frontend/.env.production`](frontend/.env.production)
and re-deploy the frontend:

```ini
VITE_API_BASE=https://your-backend-url
```

The backend already sends `Access-Control-Allow-Origin: *`, so the Pages origin is
accepted. (CSV persistence inside the container is ephemeral — mount a volume if
you need it to survive restarts.)

## Notes & troubleshooting

- **"service offline" banner** → the backend isn't running or is on another port.
  Start `backend/run.ps1`; if you change the port, set `VITE_API_BASE` in
  `frontend/.env`.
- **Port already in use** → `./run.ps1 9090` to pick another backend port (then
  update `VITE_API_BASE`).
- **Recompile backend after editing Java** → just re-run `run.ps1` (it always
  recompiles `src/` into `out/`).
- **Dashboard is empty** → onboard a few candidates first; history is written to
  the CSV files in `backend/` as invitations are sent.

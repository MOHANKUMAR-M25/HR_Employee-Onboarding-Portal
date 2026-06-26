# Stage Cue Sheet — "From Workflow to Agent"

**Lightning Talk · 15–20 min · mixed audience.** Cues map the talk structure to
this demo: what to *click* and what to *say*. Times are cumulative-ish targets.

> **Before you walk on:** backend running (`backend/run.ps1`), `npm run dev` up,
> browser on <http://localhost:5173>, **signed in** (any email + a 4-character
> password, or the Google button), on the **Onboarding** tab. Header shows
> **● service online** and **email: mock**. Optionally pre-import
> `sample-new-hires.csv` so the roster is already on screen. Zoom the browser to
> ~110–125% for the room.
>
> This build ships the **agent**. The rigid SDLC workflow is the *conceptual*
> contrast (the §2 slide) — you narrate what a hard-coded workflow would do; you
> don't click through one. That's the point: there's no five-branch workflow left
> to maintain.

---

## 1 · Hook (2 min) — *no clicks yet*

> "A new hire joins. 11 tools, 6 forms, 4 departments, zero context. What
> happens? A human runs around connecting the dots. Today I want to show you what
> happens when the *system* connects the dots instead — when it can **think**."

Set the frame: onboarding is the perfect lab — multi-step, context-sensitive,
full of exceptions. We'll look at it through two lenses.

## 2 · SDLC vs ADLC, conceptually (4 min) — *slide*

Land the contrast (slide):

| SDLC | ADLC |
|---|---|
| Requirements → Design → Build → Test → Deploy | Goal → Agent design → Tool binding → Eval → Deploy + monitor |
| Deterministic steps | Reasoning + dynamic tool use |
| Human handles exceptions | Agent handles exceptions |
| Linear, versioned releases | Iterative, continuous tuning |

> "SDLC builds a **conveyor belt**: five fixed steps, the same for everyone, and a
> human patches every exception. ADLC builds a **thinking co-worker** that plans
> the steps per hire. Let me show you the co-worker." → switch to the browser:
> one portal, one agent.

## 3 · Demo — the easy case (3 min)

1. **Import the roster.** *Import file* → choose `sample-new-hires.csv`. The
   candidate table fills — ~18 hires, mixed FTE / contractor / intern across NA,
   EU, APAC, ASIA and LATAM. *"A real-ish roster: different types, countries,
   start times."*
2. **Onboard one standard full-timer.** Clear the *select-all* checkbox, then tick
   just **Sarah Johnson** (Consultant · FTE · US · quarter-start). Click
   **▶ Onboard 1 candidate**.
3. Watch the plan stream in: profile loaded → policies retrieved → welcome email →
   Slack invite → buddy → managed laptop → payroll & benefits → live cohort. All
   green ✓, **0 compliance, 0 skipped**. Expand **"How the agent planned this
   onboarding"** to show the reasoning behind it.

> "For a standard full-timer this is exactly what you'd expect — and honestly a
> hard-coded workflow would nail it too. This is the demo everyone gives. The
> difference shows up on the **exceptions**. So let's hire a contractor. In
> Germany. Watch the *same* agent — with no new code."

## 4 · Demo — the agent earns its keep (5 min)

Tick **Tom Becker** (DevOps Engineer · **Contractor** · **Germany / EU** ·
quarter-start). *Selecting a new candidate re-arms the Onboard button* after the
previous run. Click **▶ Onboard 1 candidate** and walk the result top to bottom.

1. **Header stats** — ~8 actions, **2 compliance**, **2 skipped**. Already a
   different plan from Sarah's.
2. **Onboarding plan** — point out it's **not** the same steps:
   - **Profile loaded** (`hr_lookup`) → `CONTRACTOR · Germany`.
   - **Policies retrieved** (`policy_rag`) → expand the doc snippets:
     **`DE-Contractor-Policy.pdf` §2 + §4** and **`IT-Access-Guide.pdf` §1**, with
     citations. *"This is RAG — it pulled the *right* policy for this exact hire."*
   - **Slack workspace invite** → **429 rate-limited ↻**, then **"sent on retry."**
     *"It reflected on a transient failure instead of dying."*
   - **IT provisioning** (`itsm`) → BYOD + scoped VPN — *not* a managed laptop.
   - **HR system** (`hris`) → a contractor liaison — *not* an FTE buddy.
3. **Compliance & approvals** — **GDPR Art. 13** (warning) + **Betriebsrat /
   works-council** (info), each with a source. *"It flagged what a human must see —
   the blind spot a five-step workflow has no box for."*
4. **Not applicable for this hire** — FTE payroll & benefits, and the FTE buddy
   (replaced by the liaison). *"It skipped those **on purpose**."*
5. **Policies applied** — `DE-Contractor-Policy.pdf`, `IT-Access-Guide.pdf`.
6. **Welcome email** — **"Hallo Tom"**, contractor-aware (BYOD, no payroll/buddy),
   with the GDPR acknowledgement line. The email **auto-sent in mock mode** — the
   green banner confirms *"✓ Mock-sent 1 welcome email."* (Wire EmailJS live in
   `.env` and it really sends.)

> "Same goal. Different hire. **Zero new code.** It reasoned, retrieved, adapted,
> recovered, and escalated. That's the difference between a workflow and an agent."

*(Optional 20s flexes:)*
- **Timing adapts too:** onboard **Carlos Mendoza** (mid-quarter FTE, Brazil) — the
  agent swaps the live cohort for **self-paced orientation + a manager 1:1**.
- **It's all tracked:** open the **Dashboard** tab — counts and breakdowns by
  region / type / department across everyone you just onboarded.
- **Hands-free:** open the floating **AI assistant** and type *"onboard all interns
  in Asia"* — a no-API, offline assistant drives the portal from plain English.

## 5 · Key lessons (3 min) — *back to slide*

- ADLC **extends** SDLC; it doesn't replace it — reach for it on ambiguous,
  multi-step, context-sensitive problems.
- The lifecycle shift: **evaluation is continuous** (prompt drift, tool failures,
  hallucination), not a one-time QA gate.
- **Low-code makes it accessible** — you don't need to be an ML engineer. (This
  demo is a React app + a small zero-dependency Java backend + simulated reasoning.)
- **New roles emerge:** Agent Designer, Prompt Engineer, Evaluation Ops.

## 6 · Call to action (1 min)

- **Developers:** rebuild one brittle workflow as an agent this week.
- **Non-devs:** the agent you saw is a config, not a PhD — open the tools today.
- **Everyone:** *"Where in your org does a human run around connecting dots?"*
  That's your first agent.

---

## Backup / Q&A pocket answers

- **"Where's the SDLC version in the app?"** — Deliberately not here. The rigid
  five-step workflow is the conceptual contrast on the slide; the whole point is
  you stop maintaining hard-coded branches. The agent *is* the after.
- **"Is it really thinking / a real LLM?"** — In this build the reasoning is
  deterministic so the demo can't flake on stage; the *architecture* (goal →
  reason → dynamic tools → reflect → flag) is exactly an LLM agent's, and
  `AdlcAgent.java` is a drop-in for the Anthropic API.
- **"What's the RAG?"** — The `policies/` folder holds the mock policy docs;
  `policy_rag` retrieves the sections relevant to the hire (e.g.
  `DE-Contractor-Policy.pdf` for a German contractor) and returns citations.
- **Onboard button greyed out / says "✓ Onboarded"** — that's the double-run guard.
  Tick a different candidate (or import/add one) to re-arm it.
- **If the network dies** — everything runs locally; email is in **mock** mode by
  default. Nothing on stage needs the internet.
- **If the backend banner is red** ("service offline") — restart `backend/run.ps1`;
  check the port matches `VITE_API_BASE` in `frontend/.env`.

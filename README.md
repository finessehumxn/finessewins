# FinesseWins — Government Contract Proposal Platform

Built by Millennials Creatives LLC | L.Finesse Humxn

## What It Does

FinesseWins is an AI-powered platform that helps small businesses — especially WOSB, MBE, and minority-owned companies — find and win government contracts. It searches **every major bid site in one query** (SAM.gov, Grants.gov, FedConnect, GSA eBuy, DLA DIBBS, and state/local portals) and uses Claude (via LangGraph) to automatically write technical, past performance, and pricing proposal volumes.

## 🚀 Production / go-live

**Full runbook: [`DEPLOY.md`](DEPLOY.md).** The app has been run end-to-end and hardened:

- **Boots without keys** — the Anthropic client is lazy; every non-AI feature works offline, and missing services degrade gracefully (in-memory data, logged emails).
- **Sample-data gating** — curated placeholder listings are flagged `sample` and shown with a **SAMPLE** badge; set `FINESSEWINS_HIDE_SAMPLE=1` in prod so users only ever see live opportunities.
- **Rate limiting** — per-IP limits on the heavy endpoints (`backend/ratelimit.py`): search 40/min, Bid IQ 30/min, generate 8/min.
- **CORS** is env-driven (`CORS_ORIGINS`); no wildcard with credentials.
- **Legal** — `landing/privacy.html`, `landing/terms.html`, and a "guidance, not a guarantee" disclaimer on Bid IQ (have counsel review before taking payments).
- **Tests** — `cd backend && pip install pytest && pytest -q` → 13 offline tests (scoring, stores, impact, DOCX, aggregator, rate limiter).
- **Deploy artifacts** — `backend/Dockerfile`, `render.yaml` (API + static app), `frontend/vercel.json`.

Remaining go-live steps are yours (accounts/keys/DNS): Supabase, Anthropic, Stripe, Resend, SAM.gov key, and pointing the domains — all scripted in `DEPLOY.md`.

## Bid sources (one search, every site)

Search fans out across all sites concurrently, normalizes to one schema, de-dupes,
and sorts by soonest deadline. Each site is a pluggable adapter in `backend/sources/` —
adding a new one is a single file.

| Source | Type | Live data | How to enable live |
|--------|------|-----------|--------------------|
| **SAM.gov** | Federal contracts | ✅ real API | set `SAM_API_KEY` (curated without it) |
| **Grants.gov** | Federal grants | ✅ real API (keyless) | on by default |
| **FedConnect** | Federal contracts | ✅ **live scrape** (incl. NAICS) | on by default (`FEDCONNECT_LIVE=0` to disable) |
| **AZ APP Portal** | Arizona state/local | ✅ **live scrape** | on by default (`AZ_APP_LIVE=0` to disable) |
| **GSA eBuy** | MAS RFQs | curated | requires GSA Schedule + authed session |
| **DLA DIBBS** | Defense supplies | curated | needs DoD consent-cookie flow |
| **State & Local** | BidNet, Bonfire… | curated | dedicated adapters over time |

Live scraping uses `httpx` + `BeautifulSoup` (`sources/scrape_util.py`) — both AZ APP
and FedConnect are server-rendered, so no headless browser is required. Any scrape
failure or timeout falls back to curated data without breaking the search.

`GET /api/opportunities/sources` lists them; every search response includes a
`sources` array with per-site counts and whether the data came from a live API.

## 🧠 Bid IQ — the "should I even bid?" answer nobody else gives

Writing an AI proposal is now table stakes (GovDash, Sweetspot, Rogue all do it).
The real, unsolved pain for a first-time / minority small business is **wasting 40
hours on a bid they never had a chance at.** Bid IQ answers that honestly, using
**real federal award data** (USAspending.gov — free, keyless, every federal award):

- **Winnability Score (0–100)** — an honest verdict: *Worth bidding · Winnable with
  the right moves · Long shot · Skip this one.* It will tell you to walk away.
- **Price-to-win band** — what winning awards in this NAICS + set-aside *actually
  paid* (from the small-business/WOSB award pool, not billion-dollar primes).
- **Incumbent analysis** — who wins this work and how entrenched they are (recompete risk).
- **Market reality** — small-business share and *your* set-aside lane's share of the money.
- **Path to win** — concrete, data-driven moves (team as a sub, find the set-aside
  version, line up past performance, price near $X).

All math on public data — fast (<1s) and defensible, no LLM guessing.
Engine: `winnability.py` + `usaspending.py` · UI: `pages/BidIQ.jsx` · also reachable
via a **"📊 My odds"** button on every Find Bids result. Every listing in **Find
Bids** and **Bid Radar** also shows an inline **◎ winnability badge** (batch-scored
and cached via `/api/intel/scores`) so you can triage at a glance.

## Brand

Logo = a rounded-square badge in the magenta→cyan brand gradient with two stacked
upward chevrons ("rising flow"). Reusable component `frontend/src/components/Logo.jsx`
(`<LogoMark>` / `<Logo>`), standalone `frontend/public/logo.svg`, and an inline SVG
favicon on both the app and the landing page.

## ⭐ Bid Radar — save your NAICS codes, get alerted everywhere

The headline feature. A user saves their **NAICS codes** once; FinesseWins then sweeps
**every bid site twice a day** and drops every new match into one feed — with an
email digest. No more logging into SAM.gov, Grants.gov, FedConnect, and three state
portals separately.

- **Set once, watched forever** — codes live on the company profile (`watched_naics`).
- **Twice-daily sweep** — `scheduler.py` runs the NAICS watch every 12h (`NAICS_INTERVAL_HOURS`).
- **One unified feed** — new matches are de-duplicated into `opportunity_matches`; the
  sidebar shows an unseen-count badge, and the **Bid Radar** page lists them with a
  "Build Proposal" shortcut into the AI generator.
- **Check now** — `POST /api/alerts/run` sweeps on demand for instant results.
- **Newbie-friendly** — every code shows a plain-language name (`naics_data.py`), with
  a starter picker of the codes small/minority-owned service firms actually bid.

Engine: `alerts.py` · Feed store: `db.MatchStore` · Email digest: `email_service.send_naics_digest`.

## 🏛 Advisor Console — sell to accelerators, SBDCs & supplier-diversity offices

The B2G/institutional wedge. APEX Accelerators, SBDCs, MBDA Centers, and
supplier-diversity offices are **funded on the outcomes they must report**. The
Advisor Console lets one advisor manage a whole cohort and produce that report:

- **Client roster** — track every business they counsel (certs, NAICS, stage, outcomes).
- **Per-client live matching** — one click finds current bids across all sites for a
  client's NAICS codes (reuses the aggregator).
- **Program impact** — businesses served, diversity %, cert breakdown, bids, wins,
  win-rate, and contract dollars, rolled up automatically.
- **Export report (CSV)** — `GET /api/org/impact/report.csv` for their funder.

Backend: `advisor.py` (impact + CSV) · `db.ClientStore` · Frontend: `pages/Advisor.jsx`.

## Stack

**Backend**: Python · FastAPI · LangGraph · Claude API (claude-sonnet-4-6) · Supabase (Postgres + Auth) · python-docx · Resend/SMTP
**Frontend**: React 18 · Vite · Vanilla CSS-in-JS · Supabase JS
**Marketing**: Standalone static landing page (`landing/index.html`) for finessewins.com

## What's new in v1.1

Everything on the old production roadmap is now built:

- **User auth** — Supabase Auth (email/password). Backend verifies the JWT on every protected route (`auth.py`); frontend has a real login/signup screen (`pages/Login.jsx`) and session gating.
- **Database** — `ProposalStore` replaced by Supabase Postgres (`db.py`) with per-user Row Level Security (`schema.sql`). Proposals, company profiles, and tracked solicitations persist. Falls back to in-memory if Supabase isn't configured, so local dev still runs.
- **DOCX export** — real submission-ready Word docs via python-docx (`docx_export.py`): cover page, per-volume sections, headings/bullets, footer with CAGE/UEI.
- **Email notifications** — amendment alerts + deadline reminders (`email_service.py`) driven by a background scheduler (`scheduler.py`). Resend or SMTP; logs to stdout if neither is set.

> **Dev mode:** with no `SUPABASE_*` env vars, auth is disabled and data is in-memory — the whole app still works end-to-end for local testing. Set the env vars to turn on real auth + persistence. See `backend/.env.example` and `frontend/.env.example`.

## Quick Start

### 1. Backend Setup

```bash
cd finessewins/backend
pip install -r requirements.txt

# Set environment variables
export ANTHROPIC_API_KEY=your_claude_api_key
export SAM_API_KEY=your_sam_gov_api_key  # optional, uses mock data without it

# Run
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd finessewins/frontend
npm install
npm run dev
# Open http://localhost:5173
```

### 3. SAM.gov API Key (optional but recommended)

Get a free API key at https://open.gsa.gov/api/get-started/
Add it as SAM_API_KEY environment variable to search real federal opportunities.

## Project Structure

```
finessewins/
├── backend/
│   ├── main.py              # FastAPI app — all API routes
│   ├── auth.py              # Supabase JWT verification (require_user / optional_user)
│   ├── db.py                # Supabase Postgres stores (+ in-memory fallback)
│   ├── schema.sql           # DB schema + Row Level Security
│   ├── agent.py             # LangGraph proposal generation agent
│   ├── sam_search.py        # Search entry point → delegates to sources/
│   ├── sources/             # Pluggable bid-site adapters (one file per site)
│   │   ├── __init__.py      #   aggregator: fan-out, dedupe, per-source report
│   │   ├── base.py          #   BidSource interface + normalized schema
│   │   ├── sam.py           #   SAM.gov (real API)
│   │   ├── grants.py        #   Grants.gov (real keyless API)
│   │   ├── fedconnect.py    #   FedConnect (scrape-ready)
│   │   ├── gsa_ebuy.py      #   GSA eBuy MAS RFQs
│   │   ├── dibbs.py         #   DLA DIBBS
│   │   └── state_portals.py #   AZ APP + state/local aggregators
│   ├── opportunity_matcher.py # Fit-scoring engine
│   ├── amendment_tracker.py # SAM.gov amendment polling
│   ├── docx_export.py       # DOCX proposal builder (python-docx)
│   ├── email_service.py     # Amendment + deadline emails (Resend/SMTP)
│   ├── scheduler.py         # Background amendment/deadline sweeps
│   ├── stripe_billing.py    # Subscription plans + checkout
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Root component + auth gate + routing
│   │   ├── lib/
│   │   │   ├── supabase.js   # Supabase client
│   │   │   └── api.js        # Auth'd fetch helpers (apiJson / apiDownload)
│   │   ├── components/
│   │   │   └── Sidebar.jsx   # Navigation + account/sign-out
│   │   └── pages/
│   │       ├── Login.jsx        # Sign in / sign up
│   │       ├── Dashboard.jsx    # Bid pipeline overview
│   │       ├── NewProposal.jsx  # 3-step proposal generator
│   │       ├── ProposalView.jsx # View + edit + export DOCX
│   │       ├── Opportunities.jsx # Search bids
│   │       ├── Pricing.jsx      # Plans + checkout
│   │       └── Profile.jsx      # Company profile (persisted)
│   ├── index.html
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js
└── landing/
    └── index.html           # Marketing page for finessewins.com
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | /api/opportunities/sources | public | List every bid site searched |
| POST   | /api/opportunities/search | optional | Search ALL bid sites (returns results + per-source status) |
| POST   | /api/opportunities/ranked | optional | Search + fit-score for a profile |
| POST   | /api/proposal/generate | **required** | Start AI proposal generation |
| GET    | /api/proposal/{id} | **required** | Get proposal status + content |
| GET    | /api/proposal/{id}/export | **required** | Download submission-ready DOCX |
| GET    | /api/proposals | **required** | List the user's proposals |
| DELETE | /api/proposal/{id} | **required** | Delete a proposal |
| GET    | /api/profile | **required** | Get saved company profile |
| PUT    | /api/profile | **required** | Save company profile |
| POST   | /api/amendments/track | **required** | Subscribe to amendment alerts (emails) |
| POST   | /api/capability-statement | optional | Generate capability statement |
| POST   | /api/certifications/check | optional | Check cert eligibility |
| POST   | /api/intel/winnability | optional | Honest bid odds from real award data (score, price-to-win, path) |
| POST   | /api/intel/scores | optional | Batch quick winnability scores (inline badges on listings) |
| POST   | /api/intel/market | optional | Market snapshot for a NAICS (awards, price, top winners) |
| GET    | /api/naics/suggestions | public | Common NAICS codes + plain-language names |
| GET/PUT| /api/alerts/settings | **required** | Get/save watched NAICS codes + alert prefs |
| GET    | /api/alerts/matches | **required** | Unified feed of matched opportunities |
| POST   | /api/alerts/matches/seen | **required** | Mark matches as seen |
| POST   | /api/alerts/run | **required** | "Check now" — sweep all sites immediately |
| GET/PUT| /api/org | **required** | Advisor/org identity (accelerator, SBDC…) |
| GET/POST| /api/org/clients | **required** | List / add managed client businesses |
| PUT/DEL| /api/org/clients/{id} | **required** | Update outcomes/stage or remove a client |
| GET    | /api/org/clients/{id}/matches | **required** | Live bids across all sites for a client's NAICS |
| GET    | /api/org/impact | **required** | Program impact metrics |
| GET    | /api/org/impact/report.csv | **required** | Export impact report (CSV) |
| GET    | /api/usage | **required** | Plan + proposals used/remaining this month |
| GET    | /api/billing/plans | public | List subscription plans |
| POST   | /api/billing/checkout | optional | Create Stripe checkout session |
| POST   | /api/billing/webhook | Stripe sig | Sync subscription → `company_profiles.plan` |

## Supabase setup

1. Create a project at supabase.com.
2. Run `backend/schema.sql` in the SQL editor (creates tables + RLS).
3. Copy `backend/.env.example` → `backend/.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_JWT_SECRET` (Settings → API).
4. Copy `frontend/.env.example` → `frontend/.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
5. For email, set `RESEND_API_KEY` (or `SMTP_*`). Without it, alerts log to stdout.

## Landing page

`landing/index.html` is a single self-contained marketing page for **finessewins.com**
(deploy to any static host — Vercel, Netlify, Cloudflare Pages, S3). Its CTAs point
to the app at `https://app.finessewins.com`.

## Production Roadmap

- [x] Replace ProposalStore with Supabase PostgreSQL
- [x] Add Stripe subscriptions (Solo $47 · Pro $97 · Agency $297)
- [x] Add document export (DOCX via python-docx)
- [x] Add SAM.gov amendment monitoring (background sweep every 6 hours)
- [x] Add user auth (Supabase Auth)
- [x] Amendment + deadline email notifications
- [x] Marketing landing page (finessewins.com)
- [x] Stripe webhook → sync plan to `company_profiles.plan`
- [x] Monthly usage limits per plan (Free 2 · Solo 5 · Pro 20 · Agency ∞) enforced on generate
- [x] Live usage meter + real-data Dashboard
- [ ] AZ APP Portal scraper (Playwright)
- [ ] FedRAMP authorization for government sales

### Billing wiring

- Set `STRIPE_SECRET_KEY`, the three `STRIPE_*_PRICE_ID`s, and `STRIPE_WEBHOOK_SECRET`.
- Point a Stripe webhook at `POST /api/billing/webhook` for `checkout.session.completed`,
  `customer.subscription.updated`, and `customer.subscription.deleted`.
- Checkout stamps the Supabase `user_id` onto the session, so the webhook attributes
  the subscription to the right account and updates their plan automatically.
- Plan limits are enforced on `/api/proposal/generate` (HTTP 402 when exceeded); the
  sidebar meter reads `/api/usage`.

## NAICS Codes to Add to SAM.gov

- 541512 — Computer Systems Design (primary for FinesseWins)
- 541511 — Custom Computer Programming
- 541519 — Other Computer Related Services
- 541611 — Administrative Management Consulting
- 611430 — Professional and Management Development Training
- 624110 — Child and Youth Services

## Certifications

- WOSB — Women-Owned Small Business
- MBE — Minority Business Enterprise  
- DBE — Disadvantaged Business Enterprise
- 8(a) — Application in progress (SBA Application #101510)

---

© 2026 Millennials Creatives LLC · Phoenix AZ · CAGE 18ZQ0 · UEI WBGAAWMD3YE5

# FinesseWins — Go-Live Runbook

Everything is code-complete and hardened. This is the exact sequence to take it
live. Steps marked **[you]** need your own accounts/keys — I can't do those for you.
Budget ~2–3 focused hours.

Domains assumed: `finessewins.com` (marketing), `app.finessewins.com` (the app),
`finessewins-api.onrender.com` or `api.finessewins.com` (the backend).

---

## 1. Supabase — auth + database  **[you]**
1. Create a project at https://supabase.com.
2. **SQL Editor → paste and run** `backend/schema.sql` (creates tables + row-level security).
3. **Settings → API**, copy:
   - Project URL → `SUPABASE_URL` (backend) and `VITE_SUPABASE_URL` (frontend)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (backend only — never ship to the browser)
   - `anon` public key → `VITE_SUPABASE_ANON_KEY` (frontend)
   - **JWT Settings → JWT Secret** → `SUPABASE_JWT_SECRET` (backend)
4. **Authentication → Providers → Email**: enable. For launch you can turn *Confirm email* off to reduce friction, or leave on for security.

## 2. Anthropic — AI proposals  **[you]**
- Get an API key at https://console.anthropic.com → `ANTHROPIC_API_KEY`.
- Model defaults to `claude-sonnet-5` (override with `ANTHROPIC_MODEL`).

## 3. SAM.gov — live federal contracts  **[you, optional but recommended]**
- Free key at https://open.gsa.gov/api/get-started/ → `SAM_API_KEY`.
- Without it, SAM.gov returns *sample* rows which are hidden in production (see `FINESSEWINS_HIDE_SAMPLE`). Grants.gov, FedConnect, and AZ APP are already live with no key.

## 4. Email — alerts & digests  **[you]**
- Create a Resend account (https://resend.com), verify your sending domain, get `RESEND_API_KEY`.
- Set `FINESSEWINS_FROM_EMAIL="FinesseWins <alerts@finessewins.com>"`.
- (Alternative: SMTP via `SMTP_HOST/PORT/USER/PASS`.)

## 5. Stripe — billing  **[you]**
1. In Stripe, create 4 recurring Products/Prices: Solo $47, Pro $97, Agency $297, Org $499 (monthly).
2. Copy the price IDs → `STRIPE_SOLO_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_AGENCY_PRICE_ID`, `STRIPE_ORG_PRICE_ID`.
3. Secret key → `STRIPE_SECRET_KEY`.
4. **Developers → Webhooks → Add endpoint**: `https://<your-api-host>/api/billing/webhook`, events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

## 6. Deploy the backend  **[you]**
Two easy options:

**A) Render (uses the included `render.yaml`)** — push this repo to GitHub, then in Render
"New → Blueprint" and point at the repo. It provisions `finessewins-api` (Python) and
`finessewins-app` (static). Fill every `sync:false` env var in the dashboard with the keys above.

**B) Docker anywhere** — `backend/Dockerfile` is ready:
```
cd backend
docker build -t finessewins-api .
docker run -p 8000:8000 --env-file .env finessewins-api
```
Deploy that image to Fly.io / Railway / Cloud Run and set the env vars there.

Set backend env: all keys above, plus
`CORS_ORIGINS=https://finessewins.com,https://app.finessewins.com`,
`FINESSEWINS_APP_URL=https://app.finessewins.com`, `FINESSEWINS_HIDE_SAMPLE=1`, `RATE_LIMIT_DISABLED=0`.

Verify: `GET https://<api-host>/api/health` → `{"ok":true,"auth_enabled":true,"db":true}`.

## 7. Deploy the frontend  **[you]**
- **Vercel** (recommended): import `frontend/` (root), framework auto-detected as Vite (`vercel.json` included). Set env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=https://<api-host>`.
- Point `app.finessewins.com` at it.
- Deploy `landing/` (static) to `finessewins.com` (Vercel/Netlify/Cloudflare Pages — it's plain HTML).

## 8. DNS  **[you]**
- `finessewins.com` → landing host
- `app.finessewins.com` → frontend host
- (optional) `api.finessewins.com` → backend host; if you use it, update `VITE_API_URL` and `CORS_ORIGINS`.

## 9. Smoke test in production
- [ ] Sign up, confirm you land in the app.
- [ ] Company Profile saves and reloads.
- [ ] Find Bids returns live results; no `SAMPLE` badges appear (they're hidden in prod).
- [ ] Bid IQ returns a score + price band for a common NAICS (e.g. 541512, WOSB).
- [ ] Bid Radar: add a code, "Check now" returns matches.
- [ ] Generate a proposal end-to-end; export the DOCX.
- [ ] Pricing → checkout opens Stripe; complete a test-mode purchase; confirm the plan updates (webhook).
- [ ] Advisor Console: add a client, export the impact CSV.

---

## Local development
```
# backend
cd backend && python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # fill what you have; blanks degrade gracefully
uvicorn main:app --reload --port 8000

# frontend (new terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```
With no Supabase/keys set, the app runs in dev mode (in-memory data, auth disabled,
emails logged to stdout) so you can click through everything offline.

## Tests
```
cd backend && pip install pytest && pytest -q
```

## Notes / ongoing
- **Scrapers** (FedConnect, AZ APP) parse the portals' current HTML. If a portal
  redesigns, that source falls back to sample data (hidden in prod) until you update
  the selectors in `backend/sources/`. Worth a monthly check.
- **USAspending** (Bid IQ) is free but rate-limits bursts; results are cached 6h per
  NAICS. Fine at normal traffic; if you scale, add Redis behind `winnability._market_cache`.
- **Legal**: `landing/privacy.html` and `landing/terms.html` are solid starting drafts —
  have counsel review before taking payments.
- **Rate limiting** is per-instance in-memory. If you run multiple backend instances,
  move `backend/ratelimit.py` to Redis.

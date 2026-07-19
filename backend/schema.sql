-- FinesseWins — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- Auth is handled by Supabase Auth (auth.users). Everything here is scoped to a
-- user via user_id + Row Level Security so tenants never see each other's data.

-- ─────────────────────────────────────────────────────────────────────────────
-- COMPANY PROFILES  (one row per user — the company they bid as)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.company_profiles (
    user_id          uuid primary key references auth.users(id) on delete cascade,
    name             text not null default '',
    uei              text,
    cage             text,
    ein              text,
    certifications   jsonb not null default '[]'::jsonb,   -- ["WOSB","MBE",...]
    naics_codes      jsonb not null default '[]'::jsonb,
    capabilities     text  not null default '',
    past_performance jsonb not null default '[]'::jsonb,
    state            text  not null default 'AZ',
    address          text,
    phone            text,
    email            text,
    website          text,
    -- ── NAICS watch / alerts ──
    watched_naics    jsonb not null default '[]'::jsonb,    -- codes to monitor across all bid sites
    alert_keywords   text,                                  -- optional extra keyword filter
    alert_email      text,                                  -- where digests go (defaults to auth email)
    alerts_enabled   boolean not null default true,         -- master on/off
    -- ── Advisor / organization (APEX Accelerator, SBDC, MBDA, supplier-diversity office) ──
    is_advisor       boolean not null default false,
    org_name         text,
    org_type         text,                                  -- apex|sbdc|mbda|diversity|prime|other
    plan             text  not null default 'free',         -- free|solo|pro|agency|org
    stripe_customer_id text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROPOSALS  (generated proposal volumes + status)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.proposals (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references auth.users(id) on delete cascade,
    solicitation_number text,
    title               text,
    agency              text,
    naics_code          text,
    set_aside           text,
    deadline            timestamptz,
    status              text not null default 'generating',  -- generating|complete|error
    volumes             jsonb not null default '{}'::jsonb,   -- {technical, past_performance, pricing}
    word_counts         jsonb not null default '{}'::jsonb,
    plain_english_summary text,
    analysis            jsonb,
    review              jsonb,
    error               text,
    -- bid outcome tracking (win/loss analytics)
    outcome             text,          -- submitted|won|lost|no_bid  (null = not yet decided)
    award_value         numeric,       -- dollars, when won
    outcome_notes       text,
    outcome_at          timestamptz,
    created_at          timestamptz not null default now(),
    completed_at        timestamptz
);

create index if not exists proposals_user_id_idx  on public.proposals (user_id, created_at desc);
create index if not exists proposals_deadline_idx on public.proposals (deadline) where status = 'complete';

-- ─────────────────────────────────────────────────────────────────────────────
-- TRACKED SOLICITATIONS  (amendment monitoring subscriptions)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tracked_solicitations (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references auth.users(id) on delete cascade,
    solicitation_number text not null,
    title               text,
    deadline            timestamptz,
    known_amendments    jsonb not null default '[]'::jsonb,
    last_checked        timestamptz,
    notify_email        text,
    created_at          timestamptz not null default now(),
    unique (user_id, solicitation_number)
);

create index if not exists tracked_deadline_idx on public.tracked_solicitations (deadline);

-- ─────────────────────────────────────────────────────────────────────────────
-- OPPORTUNITY MATCHES  (the unified alert feed — one row per new bid that hit a
-- user's watched NAICS codes; the twice-daily sweep fills this)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.opportunity_matches (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references auth.users(id) on delete cascade,
    opportunity_id text not null,                 -- source's unique id (for de-dupe)
    source         text,
    solicitation_number text,
    title          text,
    agency         text,
    naics_code     text,
    matched_naics  text,                          -- which watched code caught it
    set_aside      text,
    deadline       timestamptz,
    url            text,
    type           text,
    seen           boolean not null default false,
    notified       boolean not null default false,
    created_at     timestamptz not null default now(),
    unique (user_id, opportunity_id)
);

create index if not exists matches_user_idx on public.opportunity_matches (user_id, created_at desc);
create index if not exists matches_unseen_idx on public.opportunity_matches (user_id) where seen = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- ORG CLIENTS  (businesses an advisor/accelerator manages — powers the Advisor
-- Console + Impact Reporting that accelerators/SBDCs buy the product for)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.org_clients (
    id              uuid primary key default gen_random_uuid(),
    advisor_id      uuid not null references auth.users(id) on delete cascade,
    name            text not null,
    contact_email   text,
    certifications  jsonb not null default '[]'::jsonb,   -- WOSB/MBE/8a/…
    naics_codes     jsonb not null default '[]'::jsonb,
    stage           text not null default 'lead',          -- lead|active|bidding|won|inactive
    bids_submitted  integer not null default 0,
    bids_won        integer not null default 0,
    dollars_won     numeric not null default 0,
    notes           text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists org_clients_advisor_idx on public.org_clients (advisor_id, created_at desc);

drop trigger if exists org_clients_touch on public.org_clients;
create trigger org_clients_touch
    before update on public.org_clients
    for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- keep updated_at fresh
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists company_profiles_touch on public.company_profiles;
create trigger company_profiles_touch
    before update on public.company_profiles
    for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY  — each user only sees their own rows
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.company_profiles     enable row level security;
alter table public.proposals             enable row level security;
alter table public.tracked_solicitations enable row level security;
alter table public.opportunity_matches   enable row level security;
alter table public.org_clients            enable row level security;

drop policy if exists "own matches" on public.opportunity_matches;
create policy "own matches" on public.opportunity_matches
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own clients" on public.org_clients;
create policy "own clients" on public.org_clients
    for all using (auth.uid() = advisor_id) with check (auth.uid() = advisor_id);

drop policy if exists "own profile"  on public.company_profiles;
create policy "own profile" on public.company_profiles
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own proposals" on public.proposals;
create policy "own proposals" on public.proposals
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tracked" on public.tracked_solicitations;
create policy "own tracked" on public.tracked_solicitations
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Note: the FastAPI backend uses the SERVICE ROLE key, which bypasses RLS. The
-- backend enforces the same scoping in code (every query filters by user_id from
-- the verified JWT). RLS is the second line of defense for any direct client access.

-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATIONS (idempotent — safe to re-run this whole file on an existing DB)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026-07: bid outcome tracking for win/loss analytics
alter table public.proposals add column if not exists outcome       text;
alter table public.proposals add column if not exists award_value   numeric;
alter table public.proposals add column if not exists outcome_notes text;
alter table public.proposals add column if not exists outcome_at    timestamptz;
create index if not exists proposals_outcome_idx on public.proposals (user_id, outcome);

-- ═══════════════════════════════════════════════════════════════════════════
-- FinesseWins — July 2026 migration
--
-- Run this ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run more than once (every statement is idempotent).
--
-- Adds what the newest features need:
--   1. Win/loss tracking on proposals  → Dashboard "Track Record" + analytics
--   2. Saved searches                  → Find Bids "★ Save this search"
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Win/loss outcome tracking ──────────────────────────────────────────
-- Records what actually happened to a bid. This is the data moat: it's what
-- turns "we generated a proposal" into "we won $X at a Y% win rate".
alter table public.proposals add column if not exists outcome       text;      -- submitted|won|lost
alter table public.proposals add column if not exists award_value   numeric;   -- $ won, when known
alter table public.proposals add column if not exists outcome_notes text;      -- debrief notes
alter table public.proposals add column if not exists outcome_at    timestamptz;

create index if not exists proposals_outcome_idx
    on public.proposals (user_id, outcome);


-- ── 2. Saved searches ─────────────────────────────────────────────────────
-- Named, re-runnable bid searches. A first-timer works out the one search that
-- surfaces their trade exactly once, then re-runs it forever.
create table if not exists public.saved_searches (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid not null references auth.users(id) on delete cascade,
    name         text not null,
    keywords     text,
    naics_code   text,
    set_aside    text,
    state        text,
    created_at   timestamptz not null default now(),
    last_run_at  timestamptz
);

create index if not exists saved_searches_user_idx
    on public.saved_searches (user_id, created_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists "own searches" on public.saved_searches;
create policy "own searches" on public.saved_searches
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── verify ────────────────────────────────────────────────────────────────
-- Should return 4 outcome columns and the saved_searches table.
select column_name
  from information_schema.columns
 where table_schema = 'public' and table_name = 'proposals'
   and column_name in ('outcome', 'award_value', 'outcome_notes', 'outcome_at')
 order by column_name;

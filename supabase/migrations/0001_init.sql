-- POTD — Supabase schema
-- Three tables, all per-user, all RLS-protected.

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────────────────────
-- user_code: one row per (user, problem, file). Stores the user's edits.
-- Only present if the user's content differs from the starter code.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_code (
  user_id     uuid          not null references auth.users(id) on delete cascade,
  problem_id  text          not null,
  filename    text          not null,
  content     text          not null,
  updated_at  timestamptz   not null default now(),
  primary key (user_id, problem_id, filename)
);

create index if not exists user_code_problem_idx
  on public.user_code (user_id, problem_id);

-- ────────────────────────────────────────────────────────────────────────────
-- problem_status: one row per (user, problem). 'attempted' or 'solved'.
-- Inserted on first non-trivial test run.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.problem_status (
  user_id     uuid          not null references auth.users(id) on delete cascade,
  problem_id  text          not null,
  status      text          not null check (status in ('attempted','solved')),
  passed      integer       not null default 0,
  total       integer       not null default 0,
  updated_at  timestamptz   not null default now(),
  primary key (user_id, problem_id)
);

-- ────────────────────────────────────────────────────────────────────────────
-- ui_state: one row per user. Free-form jsonb for split sizes, last-active
-- problem, theme preferences, etc.
--
-- NOTE: schema only. No code path reads or writes this table today —
-- loadUiState / saveUiState in web/lib/storage.ts are localStorage-only.
-- The table is reserved for future cross-device UI-state sync; until that
-- ships, the RLS policy and trigger below are harmless dead weight (free
-- to keep, since dropping and re-creating later would just churn migrations).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.ui_state (
  user_id     uuid          primary key references auth.users(id) on delete cascade,
  state       jsonb         not null default '{}'::jsonb,
  updated_at  timestamptz   not null default now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- Row-Level Security: every read/write must match auth.uid().
-- ────────────────────────────────────────────────────────────────────────────
alter table public.user_code      enable row level security;
alter table public.problem_status enable row level security;
alter table public.ui_state       enable row level security;

drop policy if exists "users own code"      on public.user_code;
drop policy if exists "users own status"    on public.problem_status;
drop policy if exists "users own ui state"  on public.ui_state;

create policy "users own code"
  on public.user_code
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users own status"
  on public.problem_status
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users own ui state"
  on public.ui_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists user_code_set_updated_at      on public.user_code;
drop trigger if exists problem_status_set_updated_at on public.problem_status;
drop trigger if exists ui_state_set_updated_at       on public.ui_state;

create trigger user_code_set_updated_at
  before update on public.user_code
  for each row execute function public.set_updated_at();

create trigger problem_status_set_updated_at
  before update on public.problem_status
  for each row execute function public.set_updated_at();

create trigger ui_state_set_updated_at
  before update on public.ui_state
  for each row execute function public.set_updated_at();

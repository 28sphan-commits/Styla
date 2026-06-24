-- Quests: a sequential progression that lets free users earn extra wardrobe
-- upload slots (base 40 → hard cap 75, i.e. +35 spread across the catalog).
-- Quest definitions live in code (src/lib/quests/catalog.ts); this stores the
-- per-user progress, earned bonus, and skip allowance.

-- Per-user quest meta on the profile. aura_points is the cross-tier status
-- currency earned from quests (free ×1, pro ×3, elite ×5) and ranked on the
-- Explore leaderboard. It is readable on public profiles via the existing
-- "Profiles are visible to owner or public" policy.
alter table public.profiles
  add column if not exists quest_skips_remaining integer not null default 3,
  add column if not exists wardrobe_bonus_slots integer not null default 0,
  add column if not exists aura_points integer not null default 0,
  add column if not exists last_skip_at timestamptz;

create index if not exists profiles_aura_idx
  on public.profiles (aura_points desc)
  where is_public = true;

-- One row per (user, quest). quest_key references a code-defined quest.
-- assigned_at anchors progress counting: completion is measured from activity
-- created after this timestamp.
create table if not exists public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_key text not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'skipped')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  reward_granted integer not null default 0,
  unique (user_id, quest_key)
);

create index if not exists user_quests_user_status_idx
  on public.user_quests (user_id, status);

alter table public.user_quests enable row level security;

drop policy if exists "Users can read own quests" on public.user_quests;
create policy "Users can read own quests"
  on public.user_quests for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own quests" on public.user_quests;
create policy "Users can insert own quests"
  on public.user_quests for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own quests" on public.user_quests;
create policy "Users can update own quests"
  on public.user_quests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

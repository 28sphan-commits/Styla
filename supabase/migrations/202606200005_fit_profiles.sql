-- Virtual fitting room — Phase A (body shape).
-- Stores the user's numeric measurements (collected during onboarding) plus any
-- manual tweaks to their silhouette. Face-swap mannequin columns (avatar_*,
-- consent_at) and the private selfie bucket are added later in Phase B.

create table if not exists public.fit_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  height_cm numeric check (height_cm between 90 and 250),
  weight_kg numeric check (weight_kg between 25 and 350),
  -- display preference only; height_cm / weight_kg are always canonical metric.
  measurement_unit text not null default 'imperial'
    check (measurement_unit in ('imperial', 'metric')),
  -- persisted manual adjustments to the generated silhouette (slider tweaks).
  silhouette_params jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fit_profiles enable row level security;

-- Owner-only access, mirroring the style_dna policy split.
drop policy if exists "Users can read own fit profile" on public.fit_profiles;
create policy "Users can read own fit profile"
  on public.fit_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own fit profile" on public.fit_profiles;
create policy "Users can insert own fit profile"
  on public.fit_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own fit profile" on public.fit_profiles;
create policy "Users can update own fit profile"
  on public.fit_profiles for update
  using (auth.uid() = user_id);

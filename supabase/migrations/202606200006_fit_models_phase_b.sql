-- Virtual fitting room — Phase B (face-swap mannequin).
-- Adds async generation state to fit_profiles, a PRIVATE bucket + selfie table
-- for likeness data, and owner-only RLS. Pro-gating + consent are enforced in
-- the app layer; storage here is locked down so selfies are never public.

alter table public.fit_profiles
  add column if not exists avatar_status text not null default 'none'
    check (avatar_status in ('none', 'processing', 'ready', 'failed')),
  add column if not exists avatar_storage_path text,
  add column if not exists avatar_provider text,
  add column if not exists avatar_job_id text,
  add column if not exists avatar_error text,
  add column if not exists consent_at timestamptz;

-- Source selfies (biometric/likeness data) — owner-only, cascade-deleted.
create table if not exists public.fit_selfies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.fit_selfies enable row level security;

drop policy if exists "Users manage own selfies" on public.fit_selfies;
create policy "Users manage own selfies"
  on public.fit_selfies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- PRIVATE bucket (public = false) for selfies + generated mannequins. Served
-- only via short-lived signed URLs, never getPublicUrl.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fit-models', 'fit-models', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Per-user folder, owner-only — note there is NO public read policy.
drop policy if exists "Users upload own fit media" on storage.objects;
create policy "Users upload own fit media"
  on storage.objects for insert
  with check (
    bucket_id = 'fit-models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users read own fit media" on storage.objects;
create policy "Users read own fit media"
  on storage.objects for select
  using (
    bucket_id = 'fit-models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users update own fit media" on storage.objects;
create policy "Users update own fit media"
  on storage.objects for update
  using (
    bucket_id = 'fit-models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own fit media" on storage.objects;
create policy "Users delete own fit media"
  on storage.objects for delete
  using (
    bucket_id = 'fit-models'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

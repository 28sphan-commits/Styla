-- Virtual fitting room — full-body upgrade, Step 1.
-- A PUBLIC base-mannequin library (gender × body type) + base tracking on
-- fit_profiles, and a flexible (ordered, optionally-labeled) selfie array
-- instead of hardcoded angle slots.

-- Base mannequins are stock, non-sensitive assets that must be displayable and
-- fetchable by the VTON/face-swap model, so this bucket is PUBLIC (unlike the
-- private fit-models bucket that holds user selfies + results).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fit-base', 'fit-base', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read (writes are left to the dashboard / service role only).
drop policy if exists "Base mannequins are public" on storage.objects;
create policy "Base mannequins are public"
  on storage.objects for select
  using (bucket_id = 'fit-base');

-- Remember the user's resolved base + (later) their personalized base body.
alter table public.fit_profiles
  add column if not exists base_model_key text,
  add column if not exists base_image_path text;

-- Flexible reference-photo array: any number of selfies (one row each), ordered,
-- with an optional free-form label (e.g. "front", "full body") — NOT a fixed
-- enum of angle slots.
alter table public.fit_selfies
  add column if not exists sort_order integer not null default 0,
  add column if not exists label text;

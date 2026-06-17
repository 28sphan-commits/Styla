-- New-user defaults for Google sign-ups:
--   1. is_public defaults to true
--   2. username is auto-generated from the email local part (before "@")
--   3. collisions get a random 4-digit suffix so creation never fails
--
-- Adds a reusable generate_unique_username() helper (also used by the existing-
-- account backfill in 202606170002) and rewires the handle_new_user() trigger
-- from 202606160001 to use it. Existing profiles are untouched by this file.

-- Turn an email local part into a unique, constraint-valid username.
-- (profiles_username_format requires ^[A-Za-z0-9_]{3,20}$; profiles.username is UNIQUE.)
create or replace function public.generate_unique_username(seed_email text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
  candidate text;
  attempts int := 0;
begin
  base_username := lower(
    regexp_replace(split_part(coalesce(seed_email, ''), '@', 1), '[^A-Za-z0-9_]', '', 'g')
  );

  -- 3-20 chars required: pad short/empty handles, cap base so a 4-digit suffix fits.
  if length(base_username) < 3 then
    base_username := 'stylist' || base_username;
  end if;
  base_username := left(base_username, 16);

  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate) loop
    attempts := attempts + 1;
    candidate := base_username || lpad((floor(random() * 10000))::int::text, 4, '0');
    -- Vanishingly unlikely fallback after repeated collisions: random hex tail.
    if attempts > 25 then
      candidate := left(base_username, 8)
        || left(replace(gen_random_uuid()::text, '-', ''), 12);
    end if;
  end loop;

  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, username, is_public)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    public.generate_unique_username(new.email),
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        -- never clobber a username/visibility the user has already set
        username = coalesce(public.profiles.username, excluded.username),
        is_public = public.profiles.is_public,
        updated_at = now();

  return new;
end;
$$;

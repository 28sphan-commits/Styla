-- Make email optional at sign-up (username-only accounts).
--
-- Supabase Auth still requires a unique email per password account, so the app
-- mints a synthetic, non-routable placeholder address when the user doesn't give
-- a real one. We use the RFC 2606 reserved ".invalid" TLD (guaranteed never
-- routable) rather than ".local" (which is reserved for mDNS).
--
-- This migration keeps those placeholders OUT of profiles.email (so the profile
-- UI never shows a fake address) and resolves username logins against auth.users
-- — the real source of truth for the login email — instead of profiles.email.
--
-- NOTE: the '@placeholder.invalid' suffix below must stay in sync with
-- PLACEHOLDER_EMAIL_DOMAIN in src/app/login/actions.ts.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  desired text := nullif(trim(new.raw_user_meta_data->>'username'), '');
  chosen text;
  public_email text;
begin
  -- Honor a valid, available user-chosen username; otherwise auto-generate one
  -- so account creation can never fail because of the username.
  if desired is not null
     and desired ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(desired)) then
    chosen := desired;
  else
    chosen := public.generate_unique_username(new.email);
  end if;

  -- Synthetic placeholder emails have no real inbox; keep them out of the profile.
  public_email := case
    when new.email ilike '%@placeholder.invalid' then null
    else new.email
  end;

  insert into public.profiles (id, email, full_name, avatar_url, username, is_public)
  values (
    new.id,
    public_email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
    chosen,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        username = coalesce(public.profiles.username, excluded.username),
        is_public = public.profiles.is_public,
        updated_at = now();

  return new;
end;
$$;

-- Resolve username logins against auth.users (the real login email) so accounts
-- with no profile email — i.e. username-only accounts — can still sign in.
create or replace function public.resolve_login_email(identifier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  trimmed text := trim(coalesce(identifier, ''));
  resolved text;
begin
  if trimmed = '' then
    return null;
  end if;

  -- An '@' means it's already an email; hand it straight back (normalized).
  if position('@' in trimmed) > 0 then
    return lower(trimmed);
  end if;

  -- Otherwise resolve a username (case-insensitive) to its auth email.
  select u.email
    into resolved
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(p.username) = lower(trimmed)
   limit 1;

  return resolved;
end;
$$;

-- Re-assert execute access for the pre-auth sign-in path. Idempotent, and keeps
-- this migration safe to apply even if 202606180001 (the original grant) wasn't.
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

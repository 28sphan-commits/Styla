-- Email/username + password login support.
--
-- Supabase Auth authenticates by email only, but Styla lets users sign in with
-- either their email OR their auto-generated username (see generate_unique_username
-- in 202606170001). This SECURITY DEFINER function resolves a login identifier to
-- the account email so the server-side sign-in action can hand it to
-- signInWithPassword. It is intentionally narrow: it returns ONLY the email.
--
-- Email-shaped identifiers are short-circuited in app code and never reach this
-- function, so in practice it is only consulted for username logins.

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

  -- Otherwise resolve a username (case-insensitive) to its email.
  select p.email
    into resolved
    from public.profiles p
   where lower(p.username) = lower(trimmed)
   limit 1;

  return resolved;
end;
$$;

-- The sign-in action runs as the anon role (no session exists yet), so it must be
-- able to execute this pre-auth. Usernames are already public in this app, and the
-- function only ever returns an email, nothing else.
revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

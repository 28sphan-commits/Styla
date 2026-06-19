-- Let new users choose their own username at sign-up.
--
-- Builds on 202606170001 (generate_unique_username + handle_new_user) by:
--   1. Adding is_username_available() so the sign-up form can pre-check a handle.
--   2. Teaching handle_new_user() to honor a user-supplied username (passed via
--      auth metadata as raw_user_meta_data->>'username') when it is valid and
--      free, falling back to the auto-generated handle otherwise so sign-up can
--      never fail because of a username collision.

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when candidate is null or candidate !~ '^[A-Za-z0-9_]{3,20}$' then false
    else not exists (
      select 1 from public.profiles where lower(username) = lower(candidate)
    )
  end;
$$;

-- Callable pre-auth from the sign-up form. Only leaks username existence, which
-- is already public in this app.
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  desired text := nullif(trim(new.raw_user_meta_data->>'username'), '');
  chosen text;
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

  insert into public.profiles (id, email, full_name, avatar_url, username, is_public)
  values (
    new.id,
    new.email,
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

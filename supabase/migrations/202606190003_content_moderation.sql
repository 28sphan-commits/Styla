-- Content moderation & 3-strike account system.
--
-- Adds a strike counter and ban status to profiles, then makes those two
-- columns TAMPER-PROOF. The app only has the anon/authenticated key (no
-- service-role key), and RLS lets a user UPDATE their own profile row — so
-- without protection a banned user could simply reset their own strikes or
-- flip status back to 'active'. We prevent that with a BEFORE UPDATE trigger
-- that reverts any change to strikes/status UNLESS a transaction-local flag
-- (app.moderation) is set, which only the SECURITY DEFINER strike function
-- below ever sets. Normal profile edits (bio, username, etc.) pass through
-- untouched; the moderation columns are effectively read-only to clients.

alter table public.profiles
  add column if not exists strikes integer not null default 0,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'banned'));

-- Single BEFORE UPDATE trigger that does two jobs:
--   1. Tamper guard: client writes can't change strikes/status.
--   2. Policy: when a moderation-authorized write pushes strikes to 3+, the
--      account is automatically banned.
create or replace function public.enforce_strike_policy()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.moderation', true) = 'on' then
    -- Authorized moderation write (from record_text_violation). Apply the
    -- 3-strike rule so banning happens at the database level no matter what.
    if new.strikes >= 3 then
      new.status := 'banned';
    end if;
  else
    -- Ordinary client update: keep moderation columns immutable.
    new.strikes := old.strikes;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_strike_policy on public.profiles;
create trigger enforce_strike_policy
  before update on public.profiles
  for each row execute procedure public.enforce_strike_policy();

-- Records a content violation for the CURRENT user only. Because it reads
-- auth.uid() internally, a caller can never strike another account — only
-- their own. SECURITY DEFINER + the app.moderation flag let it (and only it)
-- write the otherwise-immutable moderation columns. Returns the post-update
-- strike count and status so the API can surface the right message / ban.
create or replace function public.record_text_violation()
returns table (strikes integer, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Authorize the moderation-column write for this transaction only.
  perform set_config('app.moderation', 'on', true);

  return query
  update public.profiles p
     set strikes = p.strikes + 1,
         updated_at = now()
   where p.id = uid
  returning p.strikes, p.status;
end;
$$;

revoke all on function public.record_text_violation() from public;
grant execute on function public.record_text_violation() to authenticated;

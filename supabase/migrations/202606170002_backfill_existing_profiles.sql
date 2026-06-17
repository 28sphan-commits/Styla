-- One-off backfill so accounts created before 202606170001 match the new
-- new-user defaults. Idempotent: usernames are only generated where missing, and
-- is_public is only flipped where it isn't already true.
--
-- Depends on public.generate_unique_username() from 202606170001 — run that first.

-- 1. Give every username-less profile a generated handle. Row-by-row, so each new
--    username is visible to the next iteration's uniqueness check (no intra-batch
--    collisions, and no collisions with usernames already in the table).
do $$
declare
  r record;
begin
  for r in
    select id, email
    from public.profiles
    where username is null
    order by created_at
  loop
    update public.profiles
      set username = public.generate_unique_username(r.email),
          updated_at = now()
    where id = r.id;
  end loop;
end;
$$;

-- 2. Make existing accounts public, matching the new default.
update public.profiles
  set is_public = true,
      updated_at = now()
  where is_public is distinct from true;

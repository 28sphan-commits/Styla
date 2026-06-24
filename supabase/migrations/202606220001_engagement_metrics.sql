-- Engagement metrics: per-outfit view tracking + readable save (bookmark)
-- counts. Powers the saves/views numbers on Explore and the analytics row in a
-- user's own Outfits library.

-- 1. Persistent view counter on each outfit.
alter table public.outfits
  add column if not exists view_count integer not null default 0;

-- 2. Increment helper. SECURITY DEFINER so any visitor (even signed-out) can
-- bump the counter on a public outfit, while RLS still blocks direct writes to
-- the outfits table. A creator's views of their own look are not counted.
create or replace function public.increment_outfit_views(
  p_outfit_id uuid,
  p_viewer_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.outfits
     set view_count = view_count + 1
   where id = p_outfit_id
     and is_public = true
     and (p_viewer_id is null or user_id <> p_viewer_id);
end;
$$;

grant execute on function public.increment_outfit_views(uuid, uuid) to anon, authenticated;

-- 3. Allow reading bookmark rows for public outfits so save counts can be
-- displayed (mirrors the existing "read likes on public outfits" policy).
-- Owners keep full access to their own bookmarks via the existing policy.
drop policy if exists "Users can read bookmarks on public outfits" on public.bookmarks;
create policy "Users can read bookmarks on public outfits"
  on public.bookmarks for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.outfits
      where outfits.id = bookmarks.outfit_id
        and outfits.is_public = true
    )
  );

-- Add per-outfit social controls.
--
--   allow_saves  boolean  — when false, the Save/Bookmark button is hidden in
--                           the feed so other users cannot add it to their library.
--   visibility   text     — 'public' appears on the global Explore feed;
--                           'friends' is only visible to mutual follows.
--
-- Existing outfits default to public/saves-enabled so nothing breaks.

alter table public.outfits
  add column if not exists allow_saves boolean not null default true,
  add column if not exists visibility  text    not null default 'public'
    check (visibility in ('public', 'friends'));

-- ── Update the outfits SELECT policy to enforce friends-only visibility ────────
-- A viewer can read an outfit when:
--   a) they own it, OR
--   b) it is public AND
--        • visibility = 'public', OR
--        • visibility = 'friends' AND a mutual follow exists with the owner.

drop policy if exists "Users can read own outfits or public outfits" on public.outfits;
create policy "Users can read own outfits or public outfits"
  on public.outfits for select
  using (
    auth.uid() = user_id
    or (
      is_public = true
      and (
        visibility = 'public'
        or (
          visibility = 'friends'
          and exists (
            select 1 from public.follows
            where follower_id = auth.uid() and following_id = outfits.user_id
          )
          and exists (
            select 1 from public.follows
            where follower_id = outfits.user_id and following_id = auth.uid()
          )
        )
      )
    )
  );

-- outfit_items and wardrobe_items policies reference outfits via subqueries,
-- so they inherit the updated outfits RLS automatically — no changes needed.

-- The bookmarks INSERT policy also uses a subquery on outfits, which will
-- respect the new RLS (non-friends can't find a friends-only outfit row).

-- Upgrade get_recommended_stylists to blend three signals:
--   1. Style DNA match  — onboarding survey (aesthetic 4pt, lifestyle 2pt, color_pref 1pt)
--   2. Wardrobe overlap — clothing-type match 2× per item, color match 1× per item
--   3. Popularity nudge — ln(follower_count + 1) × 2, so well-followed stylists
--      float up without completely outranking great taste matches.
--
-- SECURITY DEFINER is required so the function can cross-read wardrobe_items
-- and style_dna, both of which have per-user RLS policies.  Only aggregated
-- scores and public profile fields are returned — no individual item details
-- or raw survey answers leak to the caller.

create or replace function public.get_recommended_stylists(
  viewer_id uuid,
  limit_n   int default 6
)
returns table (
  id              uuid,
  username        text,
  full_name       text,
  avatar_url      text,
  bio             text,
  membership_tier text,
  outfit_count    bigint,
  follower_count  bigint,
  following_count bigint,
  is_following    boolean,
  match_score     int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_has_items boolean;
begin
  select exists(select 1 from wardrobe_items where user_id = viewer_id limit 1)
    into viewer_has_items;

  if viewer_has_items then
    -- ── Blended path: wardrobe overlap + style DNA + popularity ──────────────
    return query
    with viewer_dna as (
      -- Pull the viewer's survey answers once.
      select style_aesthetic, lifestyle, color_preference
      from style_dna
      where user_id = viewer_id
    ),
    viewer_tags as (
      -- Pull the viewer's unique clothing types and colors once.
      select
        array_agg(distinct t) as types,
        array_agg(distinct c) as colors
      from wardrobe_items wi,
           unnest(wi.type)  as t,
           unnest(wi.color) as c
      where wi.user_id = viewer_id
    ),
    candidates as (
      -- All public stylists the viewer is not already following.
      select p.id
      from profiles p
      where p.is_public = true
        and p.id <> viewer_id
        and not exists (
          select 1 from follows f
          where f.follower_id = viewer_id and f.following_id = p.id
        )
    ),
    dna_scores as (
      -- Style DNA overlap against each candidate.
      select
        sd.user_id,
        (case when sd.style_aesthetic = vd.style_aesthetic then 4 else 0 end
         + case when sd.lifestyle      = vd.lifestyle       then 2 else 0 end
         + case when sd.color_preference = vd.color_preference then 1 else 0 end
        ) as dna_score
      from style_dna sd
      cross join viewer_dna vd
      where sd.user_id in (select id from candidates)
    ),
    wardrobe_scores as (
      -- Wardrobe item overlap against each candidate.
      select
        wi.user_id,
        count(distinct wi.id) filter (where wi.type  && vt.types)  * 2
          + count(distinct wi.id) filter (where wi.color && vt.colors) as wardrobe_score
      from wardrobe_items wi
      cross join viewer_tags vt
      where wi.user_id in (select id from candidates)
      group by wi.user_id
    ),
    follower_counts as (
      select following_id as uid, count(*) as cnt
      from follows
      where following_id in (select id from candidates)
      group by following_id
    ),
    ranked as (
      select
        c.id as uid,
        coalesce(ds.dna_score, 0)
          + coalesce(ws.wardrobe_score, 0)
          + (ln(coalesce(fc.cnt, 0) + 1) * 2)::int  as score
      from candidates c
      left join dna_scores       ds on ds.user_id     = c.id
      left join wardrobe_scores  ws on ws.user_id     = c.id
      left join follower_counts  fc on fc.uid          = c.id
      -- Require at least one signal match so we don't surface totally cold profiles.
      where coalesce(ds.dna_score, 0) + coalesce(ws.wardrobe_score, 0) > 0
      order by score desc
      limit limit_n
    )
    select
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.membership_tier,
      (select count(*) from outfits o where o.user_id      = p.id and o.is_public = true)::bigint,
      (select count(*) from follows f where f.following_id  = p.id)::bigint,
      (select count(*) from follows f where f.follower_id   = p.id)::bigint,
      false::boolean,
      r.score::int
    from ranked r
    join profiles p on p.id = r.uid
    order by r.score desc;

  else
    -- ── Fallback: viewer has no wardrobe yet ─────────────────────────────────
    -- Use style DNA alone (if they completed onboarding) combined with
    -- popularity so the section still surfaces relevant, popular stylists.
    return query
    with viewer_dna as (
      select style_aesthetic, lifestyle, color_preference
      from style_dna
      where user_id = viewer_id
    ),
    candidates as (
      select p.id
      from profiles p
      where p.is_public = true
        and p.id <> viewer_id
        and not exists (
          select 1 from follows f
          where f.follower_id = viewer_id and f.following_id = p.id
        )
    ),
    scored as (
      select
        c.id as uid,
        (case when sd.style_aesthetic   = vd.style_aesthetic   then 4 else 0 end
         + case when sd.lifestyle       = vd.lifestyle          then 2 else 0 end
         + case when sd.color_preference = vd.color_preference  then 1 else 0 end
         + (ln(coalesce(fc.cnt, 0) + 1) * 2)::int
        ) as score
      from candidates c
      cross join viewer_dna vd
      left join style_dna sd on sd.user_id = c.id
      left join lateral (
        select count(*) as cnt from follows where following_id = c.id
      ) fc on true
      order by score desc
      limit limit_n
    )
    select
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.membership_tier,
      (select count(*) from outfits o where o.user_id      = p.id and o.is_public = true)::bigint,
      (select count(*) from follows f where f.following_id  = p.id)::bigint,
      (select count(*) from follows f where f.follower_id   = p.id)::bigint,
      false::boolean,
      s.score::int
    from scored s
    join profiles p on p.id = s.uid
    order by s.score desc;

  end if;
end;
$$;

-- Permissions unchanged — only authenticated sessions may call this.
revoke all on function public.get_recommended_stylists(uuid, int) from public;
grant execute on function public.get_recommended_stylists(uuid, int) to authenticated;

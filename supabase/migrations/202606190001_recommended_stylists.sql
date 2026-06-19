-- Smart stylist recommendation function.
--
-- Scores each candidate by how many of their wardrobe items share clothing
-- types (weight 2×) or colors (weight 1×) with the viewer's wardrobe.
-- Type is a stronger style signal than color, hence the double weight.
--
-- Fallback: when the viewer has no wardrobe items yet, returns the
-- most-followed public stylists instead so the section is never empty.
--
-- SECURITY DEFINER is required because wardrobe_items RLS restricts each
-- user to their own rows; cross-user reads must bypass RLS inside this
-- function. The function only exposes public profile data and aggregate
-- wardrobe counts — no individual item details leak to the caller.

create or replace function public.get_recommended_stylists(
  viewer_id uuid,
  limit_n  int default 6
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
    -- ── Taste-match path ─────────────────────────────────────────────────────
    -- Aggregate the viewer's unique clothing types and colors in one pass.
    -- Then score each eligible candidate by item-level overlap.
    return query
    with viewer_tags as (
      select
        array_agg(distinct t) as types,
        array_agg(distinct c) as colors
      from wardrobe_items wi,
           unnest(wi.type)  as t,
           unnest(wi.color) as c
      where wi.user_id = viewer_id
    ),
    ranked as (
      select
        wi.user_id                                                                as uid,
        count(distinct wi.id) filter (where wi.type  && vt.types)  * 2
          + count(distinct wi.id) filter (where wi.color && vt.colors)           as score
      from wardrobe_items wi
      cross join viewer_tags vt
      join profiles p on p.id = wi.user_id
      where p.is_public = true
        and wi.user_id <> viewer_id
        and not exists (
          select 1 from follows f
          where f.follower_id = viewer_id and f.following_id = wi.user_id
        )
      group by wi.user_id
      having count(distinct wi.id) filter (where wi.type  && vt.types)
           + count(distinct wi.id) filter (where wi.color && vt.colors) > 0
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
      (select count(*) from outfits o  where o.user_id     = p.id and o.is_public = true)::bigint,
      (select count(*) from follows f  where f.following_id = p.id)::bigint,
      (select count(*) from follows f  where f.follower_id  = p.id)::bigint,
      false::boolean,
      r.score::int
    from ranked r
    join profiles p on p.id = r.uid
    order by r.score desc;

  else
    -- ── Fallback: most-followed public stylists ───────────────────────────────
    return query
    select
      p.id,
      p.username,
      p.full_name,
      p.avatar_url,
      p.bio,
      p.membership_tier,
      (select count(*) from outfits o  where o.user_id     = p.id and o.is_public = true)::bigint,
      (select count(*) from follows f  where f.following_id = p.id)::bigint,
      (select count(*) from follows f  where f.follower_id  = p.id)::bigint,
      false::boolean,
      0::int
    from profiles p
    where p.is_public = true
      and p.id <> viewer_id
      and not exists (
        select 1 from follows f
        where f.follower_id = viewer_id and f.following_id = p.id
      )
    order by (select count(*) from follows f where f.following_id = p.id) desc
    limit limit_n;
  end if;
end;
$$;

-- Only authenticated sessions may call this function.
revoke all on function public.get_recommended_stylists(uuid, int) from public;
grant execute on function public.get_recommended_stylists(uuid, int) to authenticated;

-- "Discover Sustainable Places Near You" — geo-indexed directory of secondhand
-- shops (Shop Sustainable) and textile recycling / donation spots (Conscious
-- Cleanout). Nested under Explore › Discover Stylists.

create extension if not exists postgis;

do $$ begin
  create type public.sustainable_mode as enum ('shop', 'cleanout');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sustainable_place_type as enum (
    'vintage', 'consignment', 'thrift', 'curated_resale',          -- shop
    'donation_dropbox', 'nonprofit_donation', 'recycling_bin', 'textile_recycler'); -- cleanout
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.place_source as enum ('osm', 'partner', 'community', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.place_status as enum ('published', 'pending', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.sustainable_places (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  mode          public.sustainable_mode not null,
  place_type    public.sustainable_place_type not null,
  geom          geography(Point, 4326) not null,
  address       text,
  city          text,
  region        text,
  country       text,
  postal_code   text,
  -- sustainability credentials
  accepted_items        text[] not null default '{}',   -- cleanout: clothing, shoes, textiles, bags
  styla_style_tags      text[] not null default '{}',   -- shop: vintage, streetwear, designer, y2k
  sustainability_score  numeric(3,1) check (sustainability_score between 0 and 10),
  credentials   jsonb not null default '{}',            -- {b_corp, certifications:[], notes}
  price_tier    smallint check (price_tier between 1 and 3),
  hours         jsonb,
  website       text,
  phone         text,
  -- partner / monetization
  is_verified_partner boolean not null default false,
  partner_tier  text check (partner_tier in ('standard', 'featured')),
  partner_until timestamptz,
  -- provenance / moderation
  source        public.place_source not null default 'community',
  osm_id        text unique,
  submitted_by  uuid references auth.users(id) on delete set null,
  status        public.place_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists sustainable_places_geom_idx on public.sustainable_places using gist (geom);
create index if not exists sustainable_places_mode_idx on public.sustainable_places (mode, status);

alter table public.sustainable_places enable row level security;

drop policy if exists "Read published places" on public.sustainable_places;
create policy "Read published places"
  on public.sustainable_places for select
  using (status = 'published' or submitted_by = auth.uid());

drop policy if exists "Members submit places" on public.sustainable_places;
create policy "Members submit places"
  on public.sustainable_places for insert
  with check (submitted_by = auth.uid() and status = 'pending' and source = 'community');

-- Proximity search. STABLE, runs the geo math server-side. Verified partners
-- float to the top, then nearest-first. Mode-filterable. RLS still applies
-- (the function is SECURITY INVOKER), and the published-rows policy covers it.
create or replace function public.nearby_sustainable_places(
  p_lat double precision,
  p_lng double precision,
  p_mode public.sustainable_mode default null,
  p_radius_m integer default 8000,
  p_limit integer default 60
)
returns table (
  id uuid,
  name text,
  mode public.sustainable_mode,
  place_type public.sustainable_place_type,
  lat double precision,
  lng double precision,
  distance_m double precision,
  accepted_items text[],
  styla_style_tags text[],
  sustainability_score numeric,
  price_tier smallint,
  is_verified_partner boolean,
  address text,
  city text,
  website text
)
language sql
stable
set search_path = public
as $$
  select
    p.id,
    p.name,
    p.mode,
    p.place_type,
    st_y(p.geom::geometry) as lat,
    st_x(p.geom::geometry) as lng,
    st_distance(p.geom, st_makepoint(p_lng, p_lat)::geography) as distance_m,
    p.accepted_items,
    p.styla_style_tags,
    p.sustainability_score,
    p.price_tier,
    p.is_verified_partner,
    p.address,
    p.city,
    p.website
  from public.sustainable_places p
  where p.status = 'published'
    and (p_mode is null or p.mode = p_mode)
    and st_dwithin(p.geom, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by
    p.is_verified_partner desc,
    st_distance(p.geom, st_makepoint(p_lng, p_lat)::geography) asc
  limit p_limit;
$$;

grant execute on function public.nearby_sustainable_places(
  double precision, double precision, public.sustainable_mode, integer, integer
) to anon, authenticated;

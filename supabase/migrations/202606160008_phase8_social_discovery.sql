create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outfit_id)
);

create index if not exists follows_follower_created_idx
  on public.follows (follower_id, created_at desc);

create index if not exists follows_following_created_idx
  on public.follows (following_id, created_at desc);

create index if not exists likes_outfit_idx
  on public.likes (outfit_id);

create index if not exists likes_user_created_idx
  on public.likes (user_id, created_at desc);

alter table public.follows enable row level security;
alter table public.likes enable row level security;

drop policy if exists "Users can read follows involving public profiles" on public.follows;
create policy "Users can read follows involving public profiles"
  on public.follows for select
  using (
    auth.uid() = follower_id
    or auth.uid() = following_id
    or exists (
      select 1
      from public.profiles
      where profiles.id = follows.following_id
        and profiles.is_public = true
    )
  );

drop policy if exists "Users can follow public profiles" on public.follows;
create policy "Users can follow public profiles"
  on public.follows for insert
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = follows.following_id
        and profiles.is_public = true
    )
  );

drop policy if exists "Users can unfollow from their own account" on public.follows;
create policy "Users can unfollow from their own account"
  on public.follows for delete
  using (auth.uid() = follower_id);

drop policy if exists "Users can read likes on public outfits" on public.likes;
create policy "Users can read likes on public outfits"
  on public.likes for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.outfits
      where outfits.id = likes.outfit_id
        and outfits.is_public = true
    )
  );

drop policy if exists "Users can like public outfits" on public.likes;
create policy "Users can like public outfits"
  on public.likes for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfits
      where outfits.id = likes.outfit_id
        and outfits.is_public = true
    )
  );

drop policy if exists "Users can unlike from their own account" on public.likes;
create policy "Users can unlike from their own account"
  on public.likes for delete
  using (auth.uid() = user_id);

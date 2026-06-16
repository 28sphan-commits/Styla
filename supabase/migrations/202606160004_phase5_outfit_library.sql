create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  occasion text not null
    check (occasion in ('casual','work','date','formal','workout','travel')),
  mood text not null
    check (mood in ('confident','relaxed','bold','minimal','creative','classic')),
  weather text not null
    check (weather in ('hot','cold','rainy','mild')),
  title text not null,
  description text not null,
  piece_count integer not null check (piece_count > 0 and piece_count <= 6),
  is_public boolean not null default false,
  share_slug text not null unique default encode(gen_random_bytes(8), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  wardrobe_item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  position integer not null default 0,
  primary key (outfit_id, wardrobe_item_id)
);

create index if not exists outfits_user_created_idx
  on public.outfits (user_id, created_at desc);

create index if not exists outfit_items_item_idx
  on public.outfit_items (wardrobe_item_id);

alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;

drop policy if exists "Users can read own outfits or public outfits" on public.outfits;
create policy "Users can read own outfits or public outfits"
  on public.outfits for select
  using (auth.uid() = user_id or is_public = true);

drop policy if exists "Users can insert own outfits" on public.outfits;
create policy "Users can insert own outfits"
  on public.outfits for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own outfits" on public.outfits;
create policy "Users can update own outfits"
  on public.outfits for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own outfits" on public.outfits;
create policy "Users can delete own outfits"
  on public.outfits for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read outfit items for visible outfits" on public.outfit_items;
create policy "Users can read outfit items for visible outfits"
  on public.outfit_items for select
  using (
    exists (
      select 1
      from public.outfits
      where outfits.id = outfit_items.outfit_id
        and (outfits.user_id = auth.uid() or outfits.is_public = true)
    )
  );

drop policy if exists "Users can insert outfit items for own outfits" on public.outfit_items;
create policy "Users can insert outfit items for own outfits"
  on public.outfit_items for insert
  with check (
    exists (
      select 1
      from public.outfits
      where outfits.id = outfit_items.outfit_id
        and outfits.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.wardrobe_items
      where wardrobe_items.id = outfit_items.wardrobe_item_id
        and wardrobe_items.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete outfit items for own outfits" on public.outfit_items;
create policy "Users can delete outfit items for own outfits"
  on public.outfit_items for delete
  using (
    exists (
      select 1
      from public.outfits
      where outfits.id = outfit_items.outfit_id
        and outfits.user_id = auth.uid()
    )
  );

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, outfit_id)
);

create index if not exists bookmarks_user_created_idx
  on public.bookmarks (user_id, created_at desc);

alter table public.bookmarks enable row level security;

drop policy if exists "Users can read own bookmarks" on public.bookmarks;
create policy "Users can read own bookmarks"
  on public.bookmarks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own bookmarks for public outfits" on public.bookmarks;
create policy "Users can insert own bookmarks for public outfits"
  on public.bookmarks for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.outfits
      where outfits.id = bookmarks.outfit_id
        and outfits.is_public = true
    )
  );

drop policy if exists "Users can delete own bookmarks" on public.bookmarks;
create policy "Users can delete own bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);

drop policy if exists "Public can read wardrobe items used by public outfits" on public.wardrobe_items;
create policy "Public can read wardrobe items used by public outfits"
  on public.wardrobe_items for select
  using (
    exists (
      select 1
      from public.outfit_items
      join public.outfits on outfits.id = outfit_items.outfit_id
      where outfit_items.wardrobe_item_id = wardrobe_items.id
        and outfits.is_public = true
    )
  );

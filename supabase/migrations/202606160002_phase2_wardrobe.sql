insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe-items',
  'wardrobe-items',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type text[] not null,
  color text[] not null,
  pattern text[] not null,
  formality text[] not null,
  season text[] not null,
  image_url text not null,
  storage_path text not null,
  original_filename text,
  ai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wardrobe_items_type_values check (
    type <@ array['top','bottom','shoes','outerwear','dress','activewear','accessory','swimwear','bag','hat','jewelry']::text[]
  ),
  constraint wardrobe_items_color_values check (
    color <@ array['black','white','navy','beige','red','olive','grey','brown','pink','blue','off-white','green','yellow','purple','orange','cream','tan','burgundy']::text[]
  ),
  constraint wardrobe_items_pattern_values check (
    pattern <@ array['solid','graphic']::text[]
  ),
  constraint wardrobe_items_formality_values check (
    formality <@ array['very casual','casual','formal']::text[]
  ),
  constraint wardrobe_items_season_values check (
    season <@ array['spring','summer','fall','winter']::text[]
  )
);

create index if not exists wardrobe_items_user_created_idx
  on public.wardrobe_items (user_id, created_at desc);

alter table public.wardrobe_items enable row level security;

drop policy if exists "Users can read own wardrobe items" on public.wardrobe_items;
create policy "Users can read own wardrobe items"
  on public.wardrobe_items for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own wardrobe items" on public.wardrobe_items;
create policy "Users can insert own wardrobe items"
  on public.wardrobe_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own wardrobe items" on public.wardrobe_items;
create policy "Users can update own wardrobe items"
  on public.wardrobe_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own wardrobe items" on public.wardrobe_items;
create policy "Users can delete own wardrobe items"
  on public.wardrobe_items for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can upload own wardrobe images" on storage.objects;
create policy "Users can upload own wardrobe images"
  on storage.objects for insert
  with check (
    bucket_id = 'wardrobe-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own wardrobe images" on storage.objects;
create policy "Users can update own wardrobe images"
  on storage.objects for update
  using (
    bucket_id = 'wardrobe-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'wardrobe-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own wardrobe images" on storage.objects;
create policy "Users can delete own wardrobe images"
  on storage.objects for delete
  using (
    bucket_id = 'wardrobe-items'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Public can read wardrobe image bucket" on storage.objects;
create policy "Public can read wardrobe image bucket"
  on storage.objects for select
  using (bucket_id = 'wardrobe-items');

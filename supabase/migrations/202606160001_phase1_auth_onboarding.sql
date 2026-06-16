create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  username text unique,
  bio text default '',
  membership_tier text not null default 'free'
    check (membership_tier in ('free', 'pro', 'elite')),
  is_public boolean not null default false,
  show_outfits boolean not null default true,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.style_dna (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  style_aesthetic text not null
    check (style_aesthetic in ('minimalist', 'streetwear', 'classic', 'bohemian', 'preppy')),
  body_type text not null
    check (body_type in ('petite', 'tall', 'curvy', 'athletic', 'straight')),
  lifestyle text not null
    check (lifestyle in ('student', 'professional', 'creative', 'active', 'homebody')),
  budget_per_item text not null
    check (budget_per_item in ('under_30', '30_80', '80_200', '200_plus')),
  color_preference text not null
    check (color_preference in ('pastels', 'neutrals', 'bold', 'earth_tones', 'monochrome')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.style_dna enable row level security;

drop policy if exists "Profiles are visible to owner or public" on public.profiles;
create policy "Profiles are visible to owner or public"
  on public.profiles for select
  using (auth.uid() = id or is_public = true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can read own style dna" on public.style_dna;
create policy "Users can read own style dna"
  on public.style_dna for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own style dna" on public.style_dna;
create policy "Users can insert own style dna"
  on public.style_dna for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own style dna" on public.style_dna;
create policy "Users can update own style dna"
  on public.style_dna for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

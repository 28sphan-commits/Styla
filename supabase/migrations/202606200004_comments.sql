-- Allow-comments control on outfits ----------------------------------------
alter table public.outfits
  add column if not exists allow_comments boolean not null default true;

-- Comments table -------------------------------------------------------------
create table if not exists public.comments (
  id         uuid        primary key default gen_random_uuid(),
  outfit_id  uuid        not null references public.outfits(id) on delete cascade,
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  body       text        not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_outfit_created_idx
  on public.comments (outfit_id, created_at asc);

alter table public.comments enable row level security;

-- Anyone who can see the outfit can read its comments.
drop policy if exists "Comments on visible outfits are readable" on public.comments;
create policy "Comments on visible outfits are readable"
  on public.comments for select
  using (
    exists (
      select 1 from public.outfits
      where outfits.id = comments.outfit_id
        and (outfits.user_id = auth.uid() or outfits.is_public = true)
    )
  );

-- Authenticated users can comment on public outfits that allow comments.
drop policy if exists "Users can comment on public outfits" on public.comments;
create policy "Users can comment on public outfits"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.outfits
      where outfits.id = comments.outfit_id
        and outfits.is_public    = true
        and outfits.allow_comments = true
    )
  );

-- Users can delete their own comments; outfit owners can delete any comment.
drop policy if exists "Users can delete own comments or comments on own outfits" on public.comments;
create policy "Users can delete own comments or comments on own outfits"
  on public.comments for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.outfits
      where outfits.id = comments.outfit_id
        and outfits.user_id = auth.uid()
    )
  );

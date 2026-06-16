create or replace function public.can_view_outfit(target_outfit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outfits
    where outfits.id = target_outfit_id
      and (outfits.user_id = auth.uid() or outfits.is_public = true)
  );
$$;

create or replace function public.owns_outfit(target_outfit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outfits
    where outfits.id = target_outfit_id
      and outfits.user_id = auth.uid()
  );
$$;

create or replace function public.owns_wardrobe_item(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wardrobe_items
    where wardrobe_items.id = target_item_id
      and wardrobe_items.user_id = auth.uid()
  );
$$;

create or replace function public.wardrobe_item_is_in_public_outfit(target_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outfit_items
    join public.outfits on outfits.id = outfit_items.outfit_id
    where outfit_items.wardrobe_item_id = target_item_id
      and outfits.is_public = true
  );
$$;

drop policy if exists "Users can read outfit items for visible outfits" on public.outfit_items;
create policy "Users can read outfit items for visible outfits"
  on public.outfit_items for select
  using (public.can_view_outfit(outfit_id));

drop policy if exists "Users can insert outfit items for own outfits" on public.outfit_items;
create policy "Users can insert outfit items for own outfits"
  on public.outfit_items for insert
  with check (
    public.owns_outfit(outfit_id)
    and public.owns_wardrobe_item(wardrobe_item_id)
  );

drop policy if exists "Users can delete outfit items for own outfits" on public.outfit_items;
create policy "Users can delete outfit items for own outfits"
  on public.outfit_items for delete
  using (public.owns_outfit(outfit_id));

drop policy if exists "Public can read wardrobe items used by public outfits" on public.wardrobe_items;
create policy "Public can read wardrobe items used by public outfits"
  on public.wardrobe_items for select
  using (public.wardrobe_item_is_in_public_outfit(id));

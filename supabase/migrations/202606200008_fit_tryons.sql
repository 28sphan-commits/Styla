-- Virtual fitting room — VTON (Step 2).
-- Caches one try-on result per (user, wardrobe item) so we never re-run the
-- ~30s IDM-VTON generation for an item that's already been tried on.

create table if not exists public.fit_tryons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wardrobe_item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  job_id text,
  -- which base body this result was generated against (for staleness checks).
  base_model_key text,
  result_storage_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, wardrobe_item_id)
);

alter table public.fit_tryons enable row level security;

drop policy if exists "Users manage own try-ons" on public.fit_tryons;
create policy "Users manage own try-ons"
  on public.fit_tryons for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

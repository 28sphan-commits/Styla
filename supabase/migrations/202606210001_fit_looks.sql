-- Virtual fitting room — full-body LAYERED composition (multi-garment looks).
-- Replaces the single-item fit_tryons flow: a "look" is an ordered set of
-- garments composited one layer at a time onto the user's full-body canvas
-- (their personalized digital twin, or the resolved base mannequin).
--
-- The row doubles as the pipeline's state machine: each poll advances one layer
-- (current_job_id -> composite_path) until every garment is applied, so no
-- single request has to hold the whole multi-minute chain open.

create table if not exists public.fit_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Garments in processing (layer) order: lower_body -> upper_body -> dresses.
  item_ids uuid[] not null,
  -- Sorted item ids joined by ',' — the cache key (order-independent), so the
  -- same outfit picked in any order reuses one result.
  item_signature text not null,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  -- Which garment layer is currently being applied (0-based).
  layer_index integer not null default 0,
  -- The in-flight Replicate prediction for the current layer.
  current_job_id text,
  -- Running intermediate composite in the private fit-models bucket.
  composite_path text,
  -- Final composed image (private fit-models bucket).
  result_storage_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_signature)
);

create index if not exists fit_looks_user_idx on public.fit_looks (user_id);

alter table public.fit_looks enable row level security;

drop policy if exists "Users manage own looks" on public.fit_looks;
create policy "Users manage own looks"
  on public.fit_looks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

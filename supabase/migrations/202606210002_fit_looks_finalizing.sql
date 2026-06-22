-- Add the 'finalizing' status to fit_looks. After the last VTON layer renders,
-- the look enters 'finalizing' while the server composites the authentic garment
-- pixels (warp-first mask-back) and the user's real face+hair (identity lock)
-- back onto the figure, before flipping to 'ready'. The intermediate state blocks
-- concurrent polls from re-running the finalize work.

alter table public.fit_looks drop constraint if exists fit_looks_status_check;

alter table public.fit_looks
  add constraint fit_looks_status_check
  check (status in ('processing', 'finalizing', 'ready', 'failed'));

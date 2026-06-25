-- Multi-select onboarding: store the full set of chosen options per category
-- alongside the existing scalar columns. The scalar columns stay authoritative
-- for stylist matching + checks; these arrays hold the complete selection.
-- Additive and non-breaking: existing rows default to empty arrays.

alter table public.style_dna
  add column if not exists style_aesthetic_tags  text[] not null default '{}',
  add column if not exists body_type_tags        text[] not null default '{}',
  add column if not exists lifestyle_tags         text[] not null default '{}',
  add column if not exists budget_per_item_tags   text[] not null default '{}',
  add column if not exists color_preference_tags  text[] not null default '{}';

-- Backfill existing rows so the arrays line up with the scalar each row already
-- has (no-op for rows onboarded after this migration).
update public.style_dna
set
  style_aesthetic_tags = array[style_aesthetic],
  body_type_tags       = array[body_type],
  lifestyle_tags       = array[lifestyle],
  budget_per_item_tags = array[budget_per_item],
  color_preference_tags = array[color_preference]
where style_aesthetic_tags = '{}';

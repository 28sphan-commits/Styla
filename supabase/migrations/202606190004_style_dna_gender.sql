-- Add a free-form gender / identity field to style_dna.
-- Captured as step 1 of onboarding to establish initial styling context, and
-- fed to Gemini as part of the Style DNA baseline. Nullable — users may skip it.

alter table public.style_dna
  add column if not exists gender text;

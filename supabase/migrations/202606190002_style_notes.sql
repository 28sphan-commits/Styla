-- Add a free-form style notes field to style_dna.
-- This captures the user's self-described style situation at onboarding and
-- is fed to Gemini as long-term context when generating outfits or recommendations.
-- Nullable — users may skip the freewrite step.

alter table public.style_dna
  add column if not exists style_notes text;

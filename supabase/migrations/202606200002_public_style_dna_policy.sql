-- Allow authenticated users to read style_dna for public profiles.
-- The aesthetic and style_notes fields are intentionally public: they power
-- the stylist discovery feature and are no more sensitive than a bio.
-- Users whose profiles are private remain protected by the existing policy.

drop policy if exists "style_dna of public profiles is readable" on public.style_dna;
create policy "style_dna of public profiles is readable"
  on public.style_dna for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where profiles.id = style_dna.user_id
        and profiles.is_public = true
    )
  );

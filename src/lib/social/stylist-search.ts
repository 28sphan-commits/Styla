import type { StylistProfile } from "@/lib/social/schema";

// Aesthetic values that map 1-to-1 to style_dna.style_aesthetic.
// A pill search for one of these gets an exact-match bonus so "streetwear"
// always surfaces people who chose Streetwear in onboarding, even if the word
// never appears in their bio.
const AESTHETIC_VALUES = new Set([
  "minimalist",
  "streetwear",
  "classic",
  "bohemian",
  "preppy"
]);

const FIELD_WEIGHTS = {
  username: 5,
  aesthetic: 4, // exact match on style_aesthetic
  displayName: 3,
  bio: 2,
  styleNotes: 2
} as const;

type ScoredStylist = { profile: StylistProfile; score: number };

function scoreStylist(profile: StylistProfile, terms: string[]): number {
  const username = (profile.username ?? "").toLowerCase();
  const displayName = (profile.full_name ?? "").toLowerCase();
  const bio = (profile.bio ?? "").toLowerCase();
  const aesthetic = (profile.style_aesthetic ?? "").toLowerCase();
  const styleNotes = (profile.style_notes ?? "").toLowerCase();

  let score = 0;

  for (const term of terms) {
    if (username.includes(term)) score += FIELD_WEIGHTS.username;
    // Exact aesthetic match is a strong signal
    if (AESTHETIC_VALUES.has(term) && aesthetic === term) score += FIELD_WEIGHTS.aesthetic;
    if (displayName.includes(term)) score += FIELD_WEIGHTS.displayName;
    if (bio.includes(term)) score += FIELD_WEIGHTS.bio;
    if (styleNotes.includes(term)) score += FIELD_WEIGHTS.styleNotes;
    // Partial aesthetic text match (e.g. "street" matches "streetwear")
    if (!AESTHETIC_VALUES.has(term) && aesthetic.includes(term)) score += 1;
  }

  return score;
}

/**
 * Filters and ranks stylists by how well they match a free-text query.
 * Handles pill clicks (preset aesthetics) and typed searches uniformly.
 * Returns the list unchanged when query is empty.
 */
export function searchStylistProfiles(
  profiles: StylistProfile[],
  rawQuery: string
): StylistProfile[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return profiles;

  const terms = Array.from(new Set(query.split(/\s+/).filter(Boolean)));

  return profiles
    .map<ScoredStylist>((profile) => ({ profile, score: scoreStylist(profile, terms) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((scored) => scored.profile);
}

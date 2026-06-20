import {
  moodLabels,
  occasionLabels,
  weatherLabels
} from "@/lib/outfits/schema";
import type { PublicOutfit } from "@/lib/social/schema";

// Relevance-weighted search across an outfit's text + clothing metadata. This is
// the single search path shared by the browse page's search box AND its category
// pills (a pill is just a preset query like "casual"), so both stay in sync.
//
// Fields scanned, by weight:
//   title (5) > occasion/mood/weather + style tags (3) > description (2) > creator (1)
const FIELD_WEIGHTS = {
  title: 5,
  category: 3,
  styleTags: 3,
  description: 2,
  creator: 1
} as const;

type ScoredOutfit = { outfit: PublicOutfit; score: number };

function buildHaystacks(outfit: PublicOutfit) {
  const category = [
    outfit.occasion,
    outfit.mood,
    outfit.weather,
    occasionLabels[outfit.occasion],
    moodLabels[outfit.mood],
    weatherLabels[outfit.weather]
  ]
    .join(" ")
    .toLowerCase();

  // "Style tags" = the clothing metadata of every item in the look.
  const styleTags = outfit.items
    .flatMap((item) => [
      ...(item.type ?? []),
      ...(item.color ?? []),
      ...(item.pattern ?? []),
      ...(item.formality ?? []),
      ...(item.season ?? []),
      item.name
    ])
    .join(" ")
    .toLowerCase();

  return {
    title: (outfit.title ?? "").toLowerCase(),
    description: (outfit.description ?? "").toLowerCase(),
    category,
    styleTags,
    creator: `${outfit.creator?.username ?? ""} ${outfit.creator?.full_name ?? ""}`.toLowerCase()
  };
}

function scoreOutfit(outfit: PublicOutfit, terms: string[]): number {
  const fields = buildHaystacks(outfit);
  let score = 0;

  for (const term of terms) {
    if (fields.title.includes(term)) score += FIELD_WEIGHTS.title;
    if (fields.category.includes(term)) score += FIELD_WEIGHTS.category;
    if (fields.styleTags.includes(term)) score += FIELD_WEIGHTS.styleTags;
    if (fields.description.includes(term)) score += FIELD_WEIGHTS.description;
    if (fields.creator.includes(term)) score += FIELD_WEIGHTS.creator;
  }

  return score;
}

/**
 * Filters + ranks public outfits by how well they match a free-text query.
 * Empty query returns the list unchanged. Multi-word queries sum per-term
 * scores, so an outfit matching more of the words ranks higher.
 */
export function searchPublicOutfits(
  outfits: PublicOutfit[],
  rawQuery: string
): PublicOutfit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return outfits;

  const terms = Array.from(new Set(query.split(/\s+/).filter(Boolean)));

  return outfits
    .map<ScoredOutfit>((outfit) => ({ outfit, score: scoreOutfit(outfit, terms) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((scored) => scored.outfit);
}

// Shared wardrobe → prompt-context shaping for the Gemini routes.
//
// The model only needs an item's descriptive fields to reason about it; sending
// the full DB row (timestamps, storage paths, image URLs) just burns input
// tokens. We deliberately send the user's ENTIRE wardrobe (no cap) so the AI can
// reason over every owned piece — token-usage logging (see usage.ts) tracks the
// real cost as closets grow, and minified JSON keeps each item lean.

import type { WardrobeItem } from "@/lib/wardrobe/schema";

type CompactItem = Pick<
  WardrobeItem,
  "id" | "name" | "type" | "color" | "pattern" | "formality" | "season"
>;

export function compactWardrobe(items: WardrobeItem[]): CompactItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    color: item.color,
    pattern: item.pattern,
    formality: item.formality,
    season: item.season
  }));
}

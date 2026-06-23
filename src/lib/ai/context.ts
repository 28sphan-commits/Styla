// Shared wardrobe → prompt-context shaping for the Gemini routes.
//
// The model only needs an item's descriptive fields to reason about it; sending
// the full DB row (timestamps, storage paths, image URLs) just burns input
// tokens. We also cap how many items go into a single prompt so a large closet
// can't inflate every call without bound — the queries order by `created_at`
// desc, so the cap keeps the most recently added pieces. Outfit generation still
// validates returned ids against the *full* wardrobe, so a cap only limits what
// the model can reference, never what counts as a valid item.

import type { WardrobeItem } from "@/lib/wardrobe/schema";

export const WARDROBE_CONTEXT_LIMIT = 60;

type CompactItem = Pick<
  WardrobeItem,
  "id" | "name" | "type" | "color" | "pattern" | "formality" | "season"
>;

export function compactWardrobe(
  items: WardrobeItem[],
  limit: number = WARDROBE_CONTEXT_LIMIT
): CompactItem[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    color: item.color,
    pattern: item.pattern,
    formality: item.formality,
    season: item.season
  }));
}

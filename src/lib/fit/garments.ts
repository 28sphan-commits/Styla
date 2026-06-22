// Maps wardrobe items to IDM-VTON garment inputs.

export type GarmentCategory = "upper_body" | "lower_body" | "dresses";

// IDM-VTON only handles upper-body, lower-body, and dresses. Types not listed
// here (shoes, bag, hat, accessory, jewelry) can't be tried on with this model.
const TYPE_TO_CATEGORY: Record<string, GarmentCategory | undefined> = {
  top: "upper_body",
  outerwear: "upper_body",
  activewear: "upper_body",
  swimwear: "upper_body",
  bottom: "lower_body",
  dress: "dresses"
};

/** First try-on-able category among the item's types, or null if none qualify. */
export function garmentCategory(types: string[]): GarmentCategory | null {
  for (const type of types) {
    const category = TYPE_TO_CATEGORY[type];
    if (category) return category;
  }
  return null;
}

// Layer order for sequential composition: bottoms first so tops overlap the
// waistband, then upper-body, then dresses last (a dress covers the whole torso
// and legs, so it should sit on top if combined).
const LAYER_RANK: Record<GarmentCategory, number> = {
  lower_body: 0,
  upper_body: 1,
  dresses: 2
};

/** Sort rank used to order garments when layering them onto the body canvas. */
export function categoryLayerRank(category: GarmentCategory): number {
  return LAYER_RANK[category];
}

/** Short natural-language description the model uses to guide the try-on. */
export function garmentDescription(item: {
  name: string;
  color: string[];
  pattern: string[];
}): string {
  const colors = item.color.join(" ");
  const patterns = item.pattern.filter((p) => p !== "solid").join(" ");
  return [colors, patterns, item.name].filter(Boolean).join(" ").trim() || "garment";
}

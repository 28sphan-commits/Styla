import { z } from "zod";

export const clothingTypes = [
  "top",
  "bottom",
  "shoes",
  "outerwear",
  "dress",
  "activewear",
  "accessory",
  "swimwear",
  "bag",
  "hat",
  "jewelry"
] as const;

export const clothingColors = [
  "black",
  "white",
  "navy",
  "beige",
  "red",
  "olive",
  "grey",
  "brown",
  "pink",
  "blue",
  "off-white",
  "green",
  "yellow",
  "purple",
  "orange",
  "cream",
  "tan",
  "burgundy"
] as const;

export const clothingPatterns = ["solid", "graphic"] as const;
export const clothingFormalities = ["very casual", "casual", "formal"] as const;
export const clothingSeasons = ["spring", "summer", "fall", "winter"] as const;

export const wardrobeItemAiSchema = z.object({
  name: z.string().min(2).max(80),
  type: z.array(z.enum(clothingTypes)).min(1).max(1),
  color: z.array(z.enum(clothingColors)).min(1).max(4),
  pattern: z.array(z.enum(clothingPatterns)).min(1).max(1),
  formality: z.array(z.enum(clothingFormalities)).min(1).max(1),
  season: z.array(z.enum(clothingSeasons)).min(1).max(4)
});

export type WardrobeItemAi = z.infer<typeof wardrobeItemAiSchema>;

export type WardrobeItem = {
  id: string;
  user_id: string;
  name: string;
  type: (typeof clothingTypes)[number][];
  color: (typeof clothingColors)[number][];
  pattern: (typeof clothingPatterns)[number][];
  formality: (typeof clothingFormalities)[number][];
  season: (typeof clothingSeasons)[number][];
  image_url: string;
  storage_path: string;
  original_filename: string | null;
  created_at: string;
};

export const typeLabels: Record<(typeof clothingTypes)[number], string> = {
  top: "Tops",
  bottom: "Bottoms",
  shoes: "Shoes",
  outerwear: "Outerwear",
  dress: "Dresses",
  activewear: "Activewear",
  accessory: "Accessories",
  swimwear: "Swimwear",
  bag: "Bags",
  hat: "Hats",
  jewelry: "Jewelry"
};

export function titleCase(value: string) {
  return value
    .split(/[\s-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(value.includes("-") ? "-" : " ");
}

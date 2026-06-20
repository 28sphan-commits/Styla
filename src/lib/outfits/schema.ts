import { z } from "zod";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

export const outfitOccasions = [
  "casual",
  "work",
  "date",
  "formal",
  "workout",
  "travel"
] as const;

export const outfitMoods = [
  "confident",
  "relaxed",
  "bold",
  "minimal",
  "creative",
  "classic"
] as const;

export const outfitWeather = ["hot", "cold", "rainy", "mild"] as const;

export const outfitInputSchema = z.object({
  occasion: z.enum(outfitOccasions),
  mood: z.enum(outfitMoods),
  weather: z.enum(outfitWeather)
});

export const generatedLookSchema = z.object({
  title: z.string().min(2).max(40),
  itemIds: z.array(z.string().uuid()).min(1).max(6),
  pieceCount: z.number().int().min(1).max(6),
  description: z.string().min(40).max(900)
});

export const generatedOutfitsSchema = z.object({
  looks: z.array(generatedLookSchema).min(3).max(3)
});

export type OutfitInput = z.infer<typeof outfitInputSchema>;
export type GeneratedLook = z.infer<typeof generatedLookSchema>;
export type GeneratedOutfits = z.infer<typeof generatedOutfitsSchema>;

export type GeneratedLookWithItems = GeneratedLook & {
  items: WardrobeItem[];
};

export const occasionLabels: Record<(typeof outfitOccasions)[number], string> = {
  casual: "Casual",
  work: "Work",
  date: "Date",
  formal: "Formal",
  workout: "Workout",
  travel: "Travel"
};

export const moodLabels: Record<(typeof outfitMoods)[number], string> = {
  confident: "Confident",
  relaxed: "Relaxed",
  bold: "Bold",
  minimal: "Minimal",
  creative: "Creative",
  classic: "Classic"
};

export const weatherLabels: Record<(typeof outfitWeather)[number], string> = {
  hot: "Hot",
  cold: "Cold",
  rainy: "Rainy",
  mild: "Mild"
};

export type SavedOutfit = {
  id: string;
  user_id: string;
  occasion: (typeof outfitOccasions)[number];
  mood: (typeof outfitMoods)[number];
  weather: (typeof outfitWeather)[number];
  title: string;
  description: string;
  piece_count: number;
  is_public: boolean;
  allow_saves: boolean;
  visibility: "public" | "friends";
  share_slug: string;
  created_at: string;
};

export type OutfitItemView = WardrobeItem & {
  position: number;
};

export type OutfitLibraryItem = SavedOutfit & {
  items: OutfitItemView[];
  source?: "mine" | "saved";
};

// Conversation-driven generation: the /generate workspace sends an ephemeral
// message thread and a mode (refine chat vs. final generation).
export const generateChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200)
});

export const generateRequestSchema = z.object({
  messages: z.array(generateChatMessageSchema).min(1).max(24),
  mode: z.enum(["chat", "generate"]),
  fillGaps: z.boolean().optional()
});

export type GenerateChatMessage = z.infer<typeof generateChatMessageSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

import { z } from "zod";

export const styleGoals = [
  "casual",
  "business",
  "streetwear",
  "formal",
  "date night",
  "athleisure",
  "minimalist",
  "bohemian"
] as const;

export const outfitCheckInputSchema = z.object({
  styleGoal: z.enum(styleGoals)
});

// Clamp AI free-text to a hard character budget so an over-long Gemini response
// is trimmed (at a word boundary, with an ellipsis) instead of throwing Zod's
// "too_big" error and crashing the Outfit Check route.
function clampText(value: string, max: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s.,;:!?-]+$/, "")}…`;
}

// Enforces the minimum (genuinely empty/garbage still fails) but truncates
// anything over the maximum rather than rejecting it with a "too_big" error.
const boundedString = (min: number, max: number) =>
  z.string().min(min).transform((value) => clampText(value, max));

export const outfitCheckResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: boundedString(20, 500),
  strengths: z.array(boundedString(6, 180)).min(1).transform((items) => items.slice(0, 4)),
  fixes: z.array(boundedString(6, 220)).min(1).transform((items) => items.slice(0, 4)),
  missingPieces: z.array(boundedString(4, 120)).transform((items) => items.slice(0, 4)),
  colorNotes: boundedString(10, 260),
  fitNotes: boundedString(10, 260)
});

export type StyleGoal = (typeof styleGoals)[number];
export type OutfitCheckResult = z.infer<typeof outfitCheckResultSchema>;

export const styleGoalLabels: Record<StyleGoal, string> = {
  casual: "Casual",
  business: "Business",
  streetwear: "Streetwear",
  formal: "Formal",
  "date night": "Date Night",
  athleisure: "Athleisure",
  minimalist: "Minimalist",
  bohemian: "Bohemian"
};

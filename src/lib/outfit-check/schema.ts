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

export const outfitCheckResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string().min(20).max(500),
  strengths: z.array(z.string().min(6).max(180)).min(1).max(4),
  fixes: z.array(z.string().min(6).max(220)).min(1).max(4),
  missingPieces: z.array(z.string().min(4).max(120)).max(4),
  colorNotes: z.string().min(10).max(260),
  fitNotes: z.string().min(10).max(260)
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

import { z } from "zod";

export const styleAestheticOptions = [
  {
    value: "minimalist",
    label: "Minimalist",
    detail: "Clean lines, neutral palette",
    mark: "M"
  },
  {
    value: "streetwear",
    label: "Streetwear",
    detail: "Bold, urban, trend-driven",
    mark: "S"
  },
  {
    value: "classic",
    label: "Classic",
    detail: "Timeless, polished, refined",
    mark: "C"
  },
  {
    value: "bohemian",
    label: "Bohemian",
    detail: "Free-spirited, layered, artistic",
    mark: "B"
  },
  {
    value: "preppy",
    label: "Preppy",
    detail: "Neat, collegiate, put-together",
    mark: "P"
  }
] as const;

export const bodyTypeOptions = [
  { value: "petite", label: "Petite", detail: "Smaller frame", mark: "P" },
  { value: "tall", label: "Tall", detail: "Longer proportions", mark: "T" },
  { value: "curvy", label: "Curvy", detail: "Fuller figure", mark: "C" },
  {
    value: "athletic",
    label: "Athletic",
    detail: "Toned, muscular build",
    mark: "A"
  },
  {
    value: "straight",
    label: "Straight",
    detail: "Even proportions",
    mark: "S"
  }
] as const;

export const lifestyleOptions = [
  { value: "student", label: "Student", detail: "Campus life, casual comfort", mark: "S" },
  {
    value: "professional",
    label: "Professional",
    detail: "Office-ready, smart style",
    mark: "P"
  },
  {
    value: "creative",
    label: "Creative",
    detail: "Expressive, eclectic mix",
    mark: "C"
  },
  { value: "active", label: "Active", detail: "On the go, sporty comfort", mark: "A" },
  {
    value: "homebody",
    label: "Homebody",
    detail: "Cozy, relaxed, low-key",
    mark: "H"
  }
] as const;

export const budgetOptions = [
  { value: "under_30", label: "Under $30", detail: "Budget-friendly finds", mark: "$" },
  { value: "30_80", label: "$30 - $80", detail: "Mid-range staples", mark: "$$" },
  {
    value: "80_200",
    label: "$80 - $200",
    detail: "Quality investment pieces",
    mark: "$$$"
  },
  { value: "200_plus", label: "$200+", detail: "Premium and designer", mark: "$$$$" }
] as const;

export const colorPreferenceOptions = [
  { value: "pastels", label: "Pastels", detail: "Soft, light, airy color", mark: "P" },
  { value: "neutrals", label: "Neutrals", detail: "Black, white, cream, grey", mark: "N" },
  { value: "bold", label: "Bold", detail: "Strong, saturated color", mark: "B" },
  { value: "earth_tones", label: "Earth Tones", detail: "Olive, tan, brown, rust", mark: "E" },
  { value: "monochrome", label: "Monochrome", detail: "One-color, tonal dressing", mark: "M" }
] as const;

type ChoiceOption = { value: string; label: string; detail: string; mark: string };

export type ChoiceStep = {
  type: "choice";
  key: string;
  eyebrow: string;
  question: string;
  options: readonly ChoiceOption[];
};

// Free-text onboarding fields. These live outside styleDnaSchema (no fixed enum)
// and are saved/moderated individually by the onboarding action.
export const freewriteKeys = ["gender", "style_notes"] as const;
export type FreewriteKey = (typeof freewriteKeys)[number];

export type FreetextStep = {
  type: "freewrite";
  key: FreewriteKey;
  eyebrow: string;
  question: string;
  placeholder: string;
  maxLength: number;
  hint: string;
};

// Numeric body measurements with a live silhouette preview. Optional — feeds the
// virtual fitting room. Canonical values are metric; the UI offers an imperial
// toggle. Submitted via hidden inputs (height_cm, weight_kg, measurement_unit).
export type MeasureStep = {
  type: "measure";
  key: "measurements";
  eyebrow: string;
  question: string;
  hint: string;
};

export type OnboardingStep = ChoiceStep | FreetextStep | MeasureStep;

export const onboardingSteps: readonly OnboardingStep[] = [
  {
    type: "freewrite",
    key: "gender",
    eyebrow: "Style Discovery - Chapter 01",
    question: "How do you identify?",
    placeholder:
      "E.g. woman, man, non-binary — or however you describe yourself. This helps us tailor fits and silhouettes.",
    maxLength: 80,
    hint: "Optional — helps us tailor fits. You can change this anytime."
  },
  {
    type: "choice",
    key: "style_aesthetic",
    eyebrow: "Style Discovery - Chapter 02",
    question: "What's your style aesthetic?",
    options: styleAestheticOptions
  },
  {
    type: "choice",
    key: "body_type",
    eyebrow: "Style Discovery - Chapter 03",
    question: "How would you describe your body type?",
    options: bodyTypeOptions
  },
  {
    type: "measure",
    key: "measurements",
    eyebrow: "Style Discovery - Chapter 04",
    question: "What are your measurements?",
    hint: "Optional — powers your personal fitting room. You can add this later."
  },
  {
    type: "choice",
    key: "lifestyle",
    eyebrow: "Style Discovery - Chapter 05",
    question: "What best describes your lifestyle?",
    options: lifestyleOptions
  },
  {
    type: "choice",
    key: "budget_per_item",
    eyebrow: "Style Discovery - Chapter 06",
    question: "What's your typical budget per item?",
    options: budgetOptions
  },
  {
    type: "choice",
    key: "color_preference",
    eyebrow: "Style Discovery - Chapter 07",
    question: "Which colors do you gravitate toward?",
    options: colorPreferenceOptions
  },
  {
    type: "freewrite",
    key: "style_notes",
    eyebrow: "Style Discovery - Chapter 08",
    question: "Tell us about your style in your own words.",
    placeholder:
      "Describe your current style situation — what you love wearing, what you struggle to pull off, specific pieces you want to build around, or any look you're chasing...",
    maxLength: 1200,
    hint: "Optional — you can skip this and come back later."
  }
] as const;

export const styleDnaSchema = z.object({
  style_aesthetic: z.enum([
    "minimalist",
    "streetwear",
    "classic",
    "bohemian",
    "preppy"
  ]),
  body_type: z.enum(["petite", "tall", "curvy", "athletic", "straight"]),
  lifestyle: z.enum(["student", "professional", "creative", "active", "homebody"]),
  budget_per_item: z.enum(["under_30", "30_80", "80_200", "200_plus"]),
  color_preference: z.enum(["pastels", "neutrals", "bold", "earth_tones", "monochrome"])
});

export type StyleDna = z.infer<typeof styleDnaSchema>;

// Validated server-side before upserting fit_profiles. Both numbers are required
// together; the whole step is skippable, so the action only runs this when the
// user actually entered measurements.
export const measurementsSchema = z.object({
  height_cm: z.coerce.number().min(90).max(250),
  weight_kg: z.coerce.number().min(25).max(350),
  measurement_unit: z.enum(["imperial", "metric"]).default("imperial")
});

export type Measurements = z.infer<typeof measurementsSchema>;

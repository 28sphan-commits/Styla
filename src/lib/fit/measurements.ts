// Shared measurement helpers for the virtual fitting room.
// Canonical storage is always metric (cm / kg); imperial is a display concern.

export type BodyType = "petite" | "tall" | "curvy" | "athletic" | "straight";

export type MeasurementUnit = "imperial" | "metric";

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.453592;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  // Rounding can push inches to 12 — roll it over into a foot.
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

// Per-body-type silhouette presets — biases shoulder / waist / hip ratios and
// overall height when explicit numbers aren't enough on their own.
const PRESETS: Record<BodyType, { sh: number; wa: number; hi: number; scale: number }> = {
  petite: { sh: 0.92, wa: 0.92, hi: 0.98, scale: 0.92 },
  tall: { sh: 1.0, wa: 0.92, hi: 0.98, scale: 1.08 },
  curvy: { sh: 0.98, wa: 0.84, hi: 1.2, scale: 1.0 },
  athletic: { sh: 1.13, wa: 0.9, hi: 1.0, scale: 1.02 },
  straight: { sh: 1.0, wa: 0.98, hi: 1.0, scale: 1.0 }
};

const NEUTRAL_PRESET = { sh: 1, wa: 1, hi: 1, scale: 1 };

export type BodyShape = {
  shoulderHalf: number;
  waistHalf: number;
  hipHalf: number;
  neckHalf: number;
  ankleHalf: number;
  heightScale: number;
  bmi: number | null;
};

// Translates raw stats into the half-widths (px from center) and vertical scale
// that drive the silhouette SVG. Falls back to an average build when stats are
// missing so the figure is never empty.
export function computeBodyShape({
  heightCm,
  weightKg,
  bodyType
}: {
  heightCm?: number | null;
  weightKg?: number | null;
  bodyType?: BodyType | null;
}): BodyShape {
  const preset = (bodyType && PRESETS[bodyType]) || NEUTRAL_PRESET;
  const hasStats = Boolean(heightCm && weightKg);
  const bmi = hasStats ? weightKg! / Math.pow(heightCm! / 100, 2) : null;

  // Girth grows/shrinks the whole torso around an average BMI of ~21.5.
  const girth = clamp(0.82 + ((bmi ?? 21.5) - 21.5) * 0.02, 0.72, 1.4);
  const heightScale = clamp((heightCm ?? 170) / 170, 0.9, 1.12) * preset.scale;

  return {
    shoulderHalf: 22 * preset.sh * girth,
    waistHalf: 16 * preset.wa * girth,
    hipHalf: 20 * preset.hi * girth,
    neckHalf: 5.5 * Math.min(girth, 1.15),
    ankleHalf: 6.5 * Math.min(girth, 1.2),
    heightScale,
    bmi
  };
}

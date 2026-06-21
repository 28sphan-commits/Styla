// Shared measurement helpers for the virtual fitting room.
// Canonical storage is always metric (cm / kg); imperial is a display concern.

export type BodyType = "petite" | "tall" | "curvy" | "athletic" | "straight";

export type MeasurementUnit = "imperial" | "metric";

// Canonical metric values + display-unit preference, as loaded from fit_profiles.
export type InitialMeasurements = {
  heightCm: number | null;
  weightKg: number | null;
  unit: MeasurementUnit;
};

// Display-unit field state shared by the onboarding and profile editors. Both
// unit sets stay populated so toggling units carries values over without a
// round-trip through canonical values.
export type MeasureState = {
  unit: MeasurementUnit;
  feet: string;
  inches: string;
  pounds: string;
  cm: string;
  kg: string;
};

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

// Seeds editable field state from canonical metric values. Populates both unit
// sets up front so switching units never loses what the user typed.
export function buildMeasureState(initial?: InitialMeasurements): MeasureState {
  const unit = initial?.unit ?? "imperial";
  const heightCm = initial?.heightCm ?? null;
  const weightKg = initial?.weightKg ?? null;
  const fi = heightCm != null ? cmToFeetInches(heightCm) : null;
  return {
    unit,
    feet: fi ? String(fi.feet) : "",
    inches: fi ? String(fi.inches) : "",
    pounds: weightKg != null ? String(Math.round(kgToLb(weightKg))) : "",
    cm: heightCm != null ? String(Math.round(heightCm)) : "",
    kg: weightKg != null ? String(Math.round(weightKg)) : ""
  };
}

// Derives canonical metric values from whichever unit is currently active.
export function canonicalFrom(m: MeasureState): {
  heightCm: number | null;
  weightKg: number | null;
} {
  if (m.unit === "imperial") {
    const ft = parseFloat(m.feet);
    const inch = parseFloat(m.inches);
    const lb = parseFloat(m.pounds);
    return {
      heightCm:
        m.feet && !isNaN(ft) ? feetInchesToCm(ft, isNaN(inch) ? 0 : inch) : null,
      weightKg: m.pounds && !isNaN(lb) ? lbToKg(lb) : null
    };
  }
  const cm = parseFloat(m.cm);
  const kg = parseFloat(m.kg);
  return {
    heightCm: m.cm && !isNaN(cm) ? cm : null,
    weightKg: m.kg && !isNaN(kg) ? kg : null
  };
}

// Recomputes the target-unit fields from the current canonical values, so a
// height/weight typed in one system survives the toggle.
export function switchUnitState(m: MeasureState, unit: MeasurementUnit): MeasureState {
  if (m.unit === unit) return m;
  const { heightCm, weightKg } = canonicalFrom(m);
  return { ...buildMeasureState({ heightCm, weightKg, unit }) };
}

// Strips non-digits and caps length for measurement inputs.
export function onlyDigits(value: string): string {
  return value.replace(/[^\d]/g, "").slice(0, 3);
}

// Body-selection logic for the full-body fitting room.
// Maps a user's profile (gender + body type) to a base mannequin in the public
// `fit-base` bucket. The resolved URL is what the VTON/face-swap model uses as
// the person/body image, and is also displayed as the user's base.

import type { BodyType } from "@/lib/fit/measurements";

export type GenderCategory = "masc" | "femme" | "neutral";

const BODY_TYPES: BodyType[] = ["petite", "tall", "curvy", "athletic", "straight"];
const BUCKET = "fit-base";
const FILE_EXT = "png";

// Used when a profile is incomplete or a specific base image hasn't been
// uploaded yet — always keep this one present in the bucket.
export const DEFAULT_BASE_KEY = "neutral-straight";

/** Collapses a free-form gender string into one of three silhouette families. */
export function genderCategory(gender: string | null | undefined): GenderCategory {
  const g = (gender ?? "").toLowerCase();
  if (/(^|\b)(woman|female|she|her|girl)/.test(g)) return "femme";
  if (/(^|\b)(man|male|he|him|boy)/.test(g) && !g.includes("woman")) return "masc";
  return "neutral";
}

/**
 * Deterministic base key from profile signals: gender drives the silhouette,
 * body type the shape. (Height/weight from Phase A are available to refine the
 * pick later, e.g. choosing a heavier/lighter variant within a body type.)
 */
export function resolveBaseModelKey(opts: {
  gender?: string | null;
  bodyType?: BodyType | null;
}): string {
  const gender = genderCategory(opts.gender);
  const bodyType =
    opts.bodyType && BODY_TYPES.includes(opts.bodyType) ? opts.bodyType : "straight";
  return `${gender}-${bodyType}`;
}

/** Public URL of a base mannequin image in the fit-base bucket. */
export function baseModelUrl(key: string): string {
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${root}/storage/v1/object/public/${BUCKET}/${key}.${FILE_EXT}`;
}

export type ResolvedBase = { key: string; url: string };

export function resolveBaseModel(opts: {
  gender?: string | null;
  bodyType?: BodyType | null;
}): ResolvedBase {
  const key = resolveBaseModelKey(opts);
  return { key, url: baseModelUrl(key) };
}

/**
 * The full 15-entry catalog (3 gender families × 5 body types). This is the
 * checklist of images for the fit-base bucket, named `<key>.png` — uploaded
 * manually or auto-generated on demand (see base-generator.ts).
 */
export function baseModelCatalog(): {
  key: string;
  gender: GenderCategory;
  bodyType: BodyType;
}[] {
  const genders: GenderCategory[] = ["femme", "masc", "neutral"];
  return genders.flatMap((gender) =>
    BODY_TYPES.map((bodyType) => ({ key: `${gender}-${bodyType}`, gender, bodyType }))
  );
}

/** Reverses a slot key (`"femme-petite"`) back into its components. */
export function parseBaseKey(
  key: string
): { gender: GenderCategory; bodyType: BodyType } | null {
  const idx = key.indexOf("-");
  if (idx === -1) return null;
  const gender = key.slice(0, idx) as GenderCategory;
  const bodyType = key.slice(idx + 1) as BodyType;
  const validGender = gender === "femme" || gender === "masc" || gender === "neutral";
  if (!validGender || !BODY_TYPES.includes(bodyType)) return null;
  return { gender, bodyType };
}

// --- Text-to-image prompt construction for on-demand base generation ---------

const GENDER_PHRASE: Record<GenderCategory, string> = {
  femme: "a female fashion model",
  masc: "a male fashion model",
  neutral: "an androgynous fashion model"
};

const BUILD_PHRASE: Record<BodyType, string> = {
  petite: "petite and slender with a small, delicate frame",
  tall: "tall with long limbs and a lean frame",
  curvy: "curvy and full-figured with a defined waist and fuller hips",
  athletic: "athletic and toned with a fit, muscular build",
  straight: "with an average, balanced build and straight proportions"
};

// Strong negatives keep the figure full-body, single, anatomically sane, and on
// a clean background. The "*cropped" / "medium shot" terms specifically fight
// SDXL's tendency to frame a 3:4 image as a waist-up shot.
export const BASE_NEGATIVE_PROMPT =
  "waist-up, medium shot, close-up, portrait crop, headshot, " +
  "thighs cropped, knees cropped, legs cropped, feet cropped, feet out of frame, " +
  "cut off, out of frame, multiple people, group, two people, deformed, disfigured, " +
  "mutated, extra limbs, extra fingers, missing limbs, fused fingers, bad anatomy, " +
  "bad hands, blurry, lowres, low quality, jpeg artifacts, text, words, watermark, " +
  "signature, logo, nsfw, nudity, lingerie, cluttered background, props, furniture, " +
  "patterned background";

/**
 * Builds a strictly-formatted full-body mannequin prompt for a slot key. Leads
 * with explicit head-to-toe framing (SDXL otherwise crops at the waist), and
 * dresses the subject in plain grey activewear on a seamless grey backdrop so
 * the VTON model has a clean, consistent body to dress.
 */
export function baseModelPrompt(key: string): string {
  const parsed = parseBaseKey(key);
  const gender = parsed ? GENDER_PHRASE[parsed.gender] : GENDER_PHRASE.neutral;
  const build = parsed ? BUILD_PHRASE[parsed.bodyType] : BUILD_PHRASE.straight;
  return (
    `full body shot, head to toe, full-length photograph of ${gender}, ${build}, ` +
    "the entire figure visible from head to feet including the legs and bare feet, " +
    "standing upright on a seamless light-grey studio floor in a relaxed neutral pose " +
    "facing the camera, arms slightly away from the sides, wearing plain fitted " +
    "light-grey activewear (a tank top and short shorts), small and centered in frame " +
    "with empty space above the head and below the feet, plain seamless light-grey " +
    "studio background, soft even diffused studio lighting, photorealistic, ultra " +
    "detailed, sharp focus, full-length fashion lookbook reference photo"
  );
}

// Output dimensions: a taller 5:8 frame gives SDXL vertical room for the whole
// figure (a flatter 3:4 tends to crop the legs). Still close to what IDM-VTON
// expects, so minimal cropping before try-on.
export const BASE_IMAGE_WIDTH = 640;
export const BASE_IMAGE_HEIGHT = 1024;

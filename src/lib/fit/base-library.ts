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
 * checklist of images to upload to the fit-base bucket, named `<key>.png`.
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

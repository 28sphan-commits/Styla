// On-demand base-mannequin generation. When a slot's image is missing from the
// fit-base bucket, generate it via a Replicate text-to-image model and cache it
// back into the bucket so every future user reuses it. Server-only by
// construction: callers pass a service-role admin client to write to the bucket.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BASE_IMAGE_HEIGHT,
  BASE_IMAGE_WIDTH,
  BASE_NEGATIVE_PROMPT,
  baseModelPrompt,
  baseModelUrl,
  parseBaseKey
} from "@/lib/fit/base-library";
import {
  firstOutputUrl,
  getPrediction,
  isReplicateConfigured,
  startBaseGeneration
} from "@/lib/fit/replicate";

const BUCKET = "fit-base";
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 60; // ~2.5 min ceiling

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Authoritative existence check via the storage API (avoids CDN 404 caching). */
async function objectExists(admin: SupabaseClient, key: string): Promise<boolean> {
  const file = `${key}.png`;
  const { data } = await admin.storage.from(BUCKET).list("", { search: file, limit: 100 });
  return (data ?? []).some((f) => f.name === file);
}

export type EnsureBaseResult = { key: string; url: string; generated: boolean };

/**
 * Returns a public URL for the slot's base mannequin, generating + caching the
 * image first if it doesn't exist yet. Pass `force` to regenerate.
 *
 * Note: concurrent callers for the same missing slot may each generate once
 * (last upload wins). It's a rare, one-time cost — the result is cached after.
 */
export async function ensureBaseImage(
  admin: SupabaseClient,
  key: string,
  opts: { force?: boolean } = {}
): Promise<EnsureBaseResult> {
  if (!parseBaseKey(key)) {
    throw new Error(`Invalid base key "${key}".`);
  }

  const url = baseModelUrl(key);
  if (!opts.force && (await objectExists(admin, key))) {
    return { key, url, generated: false };
  }

  if (!isReplicateConfigured()) {
    throw new Error("Replicate is not configured — cannot generate base image.");
  }

  const prediction = await startBaseGeneration({
    prompt: baseModelPrompt(key),
    negativePrompt: BASE_NEGATIVE_PROMPT,
    width: BASE_IMAGE_WIDTH,
    height: BASE_IMAGE_HEIGHT
  });

  let outputUrl: string | null = null;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const p = await getPrediction(prediction.id);
    if (p.status === "succeeded") {
      outputUrl = firstOutputUrl(p.output);
      break;
    }
    if (p.status === "failed" || p.status === "canceled") {
      throw new Error(p.error ?? "Base image generation failed.");
    }
  }
  if (!outputUrl) throw new Error("Base image generation timed out.");

  const imageRes = await fetch(outputUrl);
  if (!imageRes.ok) throw new Error("Could not download the generated base image.");
  const bytes = new Uint8Array(await imageRes.arrayBuffer());

  const { error } = await admin.storage.from(BUCKET).upload(`${key}.png`, bytes, {
    contentType: "image/png",
    upsert: true
  });
  if (error) throw error;

  return { key, url, generated: true };
}

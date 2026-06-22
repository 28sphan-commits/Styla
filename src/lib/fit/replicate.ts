// Replicate face-swap integration for the personal mannequin (Phase B).
// Async: we start a prediction and poll for completion from /api/fit/status.
// Everything degrades gracefully when REPLICATE_API_TOKEN is unset, so the
// consent + selfie-upload flow still works before generation is switched on.

import { resolveBaseModel } from "@/lib/fit/base-library";
import type { BodyType } from "@/lib/fit/measurements";

const REPLICATE_API = "https://api.replicate.com/v1";

// Model slug (owner/name). codeplugtech/face-swap is a public community model
// (verified runnable on a standard account). Override via env to swap models —
// note that commercial models like easel/advanced-face-swap are gated and 422
// with "no permission" unless your account has been granted access.
const FACESWAP_MODEL = process.env.REPLICATE_FACESWAP_MODEL ?? "codeplugtech/face-swap";

// Virtual try-on model: garment image rendered onto a person/base body.
const VTON_MODEL = process.env.REPLICATE_VTON_MODEL ?? "cuuupid/idm-vton";

// Text-to-image model for auto-generating base mannequins. stability-ai/sdxl is
// a stable public model that works with our version-based predictions flow.
// Override via env (e.g. a Flux model) if your account has access.
// Legacy: only used behind the REPLICATE_BASE_IMAGE_URL dev override now that the
// canvas is the user's own full-body photo (no generated body).
const BASE_GEN_MODEL = process.env.REPLICATE_BASE_GEN_MODEL ?? "stability-ai/sdxl";


export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

/**
 * Resolves the public, cloud-reachable URL of the base body to swap onto.
 * REPLICATE_BASE_IMAGE_URL is a test override (e.g. for local dev); otherwise
 * the base is chosen from the fit-base library by the user's gender + body type.
 */
export function resolveTargetUrl(opts: {
  gender?: string | null;
  bodyType?: BodyType | null;
}): string {
  const override = process.env.REPLICATE_BASE_IMAGE_URL;
  if (override) return override;
  return resolveBaseModel(opts).url;
}

type StartResult = { id: string; status: string };

function requireToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Replicate is not configured.");
  return token;
}

// Up to 3 retries (4 attempts total) with a 1s → 2s → 4s backoff.
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch wrapper that recursively retries on HTTP 429 (rate limit) with
 * exponential backoff, so concurrent generations don't break when Replicate
 * throttles us. Honors a `Retry-After` header when present (capped), otherwise
 * waits 1s, 2s, 4s. After MAX_RETRIES it returns the 429 for the caller to
 * surface. Non-429 responses (including other errors) return immediately.
 */
async function replicateFetch(
  url: string,
  init: RequestInit,
  attempt = 0
): Promise<Response> {
  const response = await fetch(url, init);
  if (response.status !== 429 || attempt >= MAX_RETRIES) {
    return response;
  }
  const retryAfter = Number(response.headers.get("retry-after"));
  const delay =
    Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10_000)
      : RETRY_BASE_MS * 2 ** attempt;
  await sleep(delay);
  return replicateFetch(url, init, attempt + 1);
}

// Resolves a model's latest version hash. The version-based /v1/predictions
// endpoint works for community models, unlike /v1/models/{slug}/predictions
// which is limited to Replicate "official" models.
async function resolveVersion(token: string, model: string): Promise<string> {
  const response = await replicateFetch(`${REPLICATE_API}/models/${model}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(
      `Could not load model ${model} (HTTP ${response.status}) — it may be gated, private, or misspelled.`
    );
  }
  const data = await response.json();
  const version = data?.latest_version?.id;
  if (!version) {
    throw new Error(`Model ${model} has no available version.`);
  }
  return version as string;
}

async function createPrediction(
  token: string,
  version: string,
  input: Record<string, unknown>
): Promise<StartResult> {
  const response = await replicateFetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ version, input })
  });

  if (!response.ok) {
    throw new Error(`Replicate request failed: ${await response.text()}`);
  }

  const data = await response.json();
  return { id: data.id as string, status: data.status as string };
}

/** Kicks off a face-swap prediction. `faceUrl` is the selfie, `targetUrl` the base body. */
export async function startFaceSwap(opts: {
  faceUrl: string;
  targetUrl: string;
}): Promise<StartResult> {
  const token = requireToken();
  const version = await resolveVersion(token, FACESWAP_MODEL);
  // codeplugtech/face-swap inputs: swap_image (the face) + input_image (target).
  return createPrediction(token, version, {
    swap_image: opts.faceUrl,
    input_image: opts.targetUrl
  });
}

/** Kicks off an IDM-VTON try-on: garment rendered onto the person/base body. */
export async function startTryOn(opts: {
  humanUrl: string;
  garmentUrl: string;
  description: string;
  category: "upper_body" | "lower_body" | "dresses";
}): Promise<StartResult> {
  const token = requireToken();
  const version = await resolveVersion(token, VTON_MODEL);
  // cuuupid/idm-vton inputs: human_img + garm_img (required), garment_des,
  // category, crop. crop MUST be false: our canvas is a fixed full-body portrait
  // and crop:true auto-zooms to the garment region, chopping the legs/feet and
  // drifting the framing across layers. This pass only supplies geometry +
  // shading; authentic garment pixels are composited back later (mask-back).
  return createPrediction(token, version, {
    human_img: opts.humanUrl,
    garm_img: opts.garmentUrl,
    garment_des: opts.description,
    category: opts.category,
    crop: false
  });
}

/**
 * Kicks off IDM-VTON in `mask_only` mode: returns the category-aware agnostic
 * mask (white = the region the model would dress) for a person image — the
 * legs/hips for lower_body, the torso for upper_body, etc. We use this clean,
 * pose-aligned mask both to warp authentic garment pixels back over the right
 * region and to confirm a photo is full-body (legs reach the lower frame).
 */
export async function startGarmentMask(opts: {
  humanUrl: string;
  category: "upper_body" | "lower_body" | "dresses";
}): Promise<StartResult> {
  const token = requireToken();
  const version = await resolveVersion(token, VTON_MODEL);
  return createPrediction(token, version, {
    human_img: opts.humanUrl,
    // garm_img is required but ignored when mask_only is set; reuse the person.
    garm_img: opts.humanUrl,
    garment_des: "garment",
    category: opts.category,
    crop: false,
    mask_only: true
  });
}

/** Kicks off a text-to-image prediction to generate a base mannequin image. */
export async function startBaseGeneration(opts: {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}): Promise<StartResult> {
  const token = requireToken();
  const version = await resolveVersion(token, BASE_GEN_MODEL);
  // SDXL inputs: prompt, negative_prompt, width/height, num_outputs.
  // apply_watermark off so the base body is clean for the downstream VTON step.
  return createPrediction(token, version, {
    prompt: opts.prompt,
    negative_prompt: opts.negativePrompt ?? "",
    width: opts.width ?? 768,
    height: opts.height ?? 1024,
    num_outputs: 1,
    apply_watermark: false
  });
}

type Prediction = {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
};

export async function getPrediction(id: string): Promise<Prediction> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Replicate is not configured.");

  const response = await replicateFetch(`${REPLICATE_API}/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Replicate status failed: ${await response.text()}`);
  }

  const data = await response.json();
  return {
    status: data.status,
    output: data.output ?? null,
    error: data.error ?? null
  };
}

/** Face-swap models return either a single URL or an array; normalize to one. */
export function firstOutputUrl(output: string | string[] | null): string | null {
  if (!output) return null;
  return Array.isArray(output) ? output[0] ?? null : output;
}

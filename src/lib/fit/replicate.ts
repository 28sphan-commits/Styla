// Replicate face-swap integration for the personal mannequin (Phase B).
// Async: we start a prediction and poll for completion from /api/fit/status.
// Everything degrades gracefully when REPLICATE_API_TOKEN is unset, so the
// consent + selfie-upload flow still works before generation is switched on.

const REPLICATE_API = "https://api.replicate.com/v1";

// Model slug (owner/name). codeplugtech/face-swap is a public community model
// (verified runnable on a standard account). Override via env to swap models —
// note that commercial models like easel/advanced-face-swap are gated and 422
// with "no permission" unless your account has been granted access.
const FACESWAP_MODEL = process.env.REPLICATE_FACESWAP_MODEL ?? "codeplugtech/face-swap";

// Base mannequin photos the user's face is swapped ONTO. These must be real,
// licensed full-body images placed in /public/fit-models/base/. Until they
// exist, generation will fail at Replicate's fetch step.
const BASE_MODELS = {
  masc: "/fit-models/base/masc.png",
  femme: "/fit-models/base/femme.png",
  neutral: "/fit-models/base/neutral.png"
} as const;

export function isReplicateConfigured(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

/** Picks a base mannequin path from the user's free-form gender, default neutral. */
export function baseModelPath(gender: string | null | undefined): string {
  const g = (gender ?? "").toLowerCase();
  if (/(^|\b)(woman|female|she|her|girl)/.test(g)) return BASE_MODELS.femme;
  if (/(^|\b)(man|male|he|him|boy)/.test(g) && !g.includes("woman")) {
    return BASE_MODELS.masc;
  }
  return BASE_MODELS.neutral;
}

/**
 * Resolves the public, cloud-reachable URL of the base body to swap onto.
 * Replicate runs in the cloud and CANNOT fetch a localhost origin, so a full
 * REPLICATE_BASE_IMAGE_URL override is required for local testing (and is the
 * simplest path until a per-gender base library is hosted publicly).
 */
export function resolveTargetUrl(
  origin: string,
  gender: string | null | undefined
): string {
  const override = process.env.REPLICATE_BASE_IMAGE_URL;
  if (override) return override;
  return `${origin}${baseModelPath(gender)}`;
}

type StartResult = { id: string; status: string };

// Resolves the model's latest version hash. The version-based /v1/predictions
// endpoint works for community models, unlike /v1/models/{slug}/predictions
// which is limited to Replicate "official" models.
async function resolveVersion(token: string): Promise<string> {
  const response = await fetch(`${REPLICATE_API}/models/${FACESWAP_MODEL}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(
      `Could not load model ${FACESWAP_MODEL} (HTTP ${response.status}) — it may be gated, private, or misspelled.`
    );
  }
  const data = await response.json();
  const version = data?.latest_version?.id;
  if (!version) {
    throw new Error(`Model ${FACESWAP_MODEL} has no available version.`);
  }
  return version as string;
}

/** Kicks off a face-swap prediction. `faceUrl` is the selfie, `targetUrl` the base body. */
export async function startFaceSwap(opts: {
  faceUrl: string;
  targetUrl: string;
}): Promise<StartResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Replicate is not configured.");

  const version = await resolveVersion(token);

  const response = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      version,
      // codeplugtech/face-swap inputs: swap_image (the face) + input_image (the
      // body to swap onto). Input keys are model-specific — adjust if you swap
      // REPLICATE_FACESWAP_MODEL for one with a different schema.
      input: {
        swap_image: opts.faceUrl,
        input_image: opts.targetUrl
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Replicate request failed: ${await response.text()}`);
  }

  const data = await response.json();
  return { id: data.id as string, status: data.status as string };
}

type Prediction = {
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
};

export async function getPrediction(id: string): Promise<Prediction> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("Replicate is not configured.");

  const response = await fetch(`${REPLICATE_API}/predictions/${id}`, {
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

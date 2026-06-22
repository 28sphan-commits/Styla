// Category-aware garment region masks via IDM-VTON's `mask_only` mode. This
// returns the exact agnostic region the VTON pass dresses (legs/hips for
// lower_body, torso for upper_body, full for dresses) as a clean binary mask,
// pose-aligned to the person image. We use it to (a) warp authentic garment
// pixels back over the right region (mask-back) and (b) confirm a photo is
// full-body. Far more reliable than text-prompted segmentation, which can't
// discriminate upper vs lower on low-contrast garments.

import { type GarmentCategory } from "@/lib/fit/garments";
import { firstOutputUrl, getPrediction, startGarmentMask } from "@/lib/fit/replicate";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 40; // ~80s ceiling

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns the binary agnostic-region mask (white = region) for a person image
 * and garment category, or null on failure. Dresses fall back through the model.
 */
export async function garmentRegionMaskUrl(
  humanUrl: string,
  category: GarmentCategory
): Promise<string | null> {
  const { id } = await startGarmentMask({ humanUrl, category });
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const p = await getPrediction(id);
    if (p.status === "succeeded") return firstOutputUrl(p.output);
    if (p.status === "failed" || p.status === "canceled") {
      throw new Error(p.error ?? "Mask generation failed.");
    }
  }
  throw new Error("Mask generation timed out.");
}

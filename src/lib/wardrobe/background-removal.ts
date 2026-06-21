// Client-side AI background removal via @imgly/background-removal.
// A segmentation model runs entirely in the browser (WASM + Web Worker), so
// there's no external API, no per-image cost, and the photo is turned into a
// clean transparent cut-out before it ever leaves the device. Model + WASM
// assets are fetched (and browser-cached) from the imgly CDN on first use.

import type { Config } from "@imgly/background-removal";

export type RemovalProgress = (ratio: number) => void;

const MAX_DIMENSION = 1600;

/**
 * Caps the image dimensions before segmentation. This keeps the resulting
 * transparent PNG comfortably under our 10 MB upload limit and speeds up
 * inference (the model operates at ~1024px internally anyway). Returns the
 * original file untouched if it's already small enough.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  if (scale === 1) {
    bitmap.close?.();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close?.();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.95)
  );
  return blob ?? file;
}

/**
 * Removes the background from a clothing photo, returning a transparent PNG
 * File ready to upload. `onProgress` reports 0–1 (model download + inference);
 * the first run downloads the model (~22 MB) before it's cached.
 */
export async function removeImageBackground(
  file: File,
  onProgress?: RemovalProgress
): Promise<File> {
  const source = await downscale(file);

  // Lazy-loaded so the heavy model runtime never lands in the initial bundle.
  const { removeBackground } = await import("@imgly/background-removal");

  const config: Config = {
    model: "isnet_fp16", // strong quality at roughly half the full model's size
    // WebP keeps the alpha channel (so the cut-out stays transparent) while
    // being far smaller than PNG — much less to upload over the network.
    output: { format: "image/webp", quality: 0.85 },
    progress: (_key, current, total) => {
      if (onProgress && total > 0) onProgress(current / total);
    }
  };

  const blob = await removeBackground(source, config);
  const cleanName = file.name.replace(/\.[^.]+$/, "") + "-clean.webp";

  return new File([blob], cleanName, { type: "image/webp" });
}

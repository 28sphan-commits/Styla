// Server-side image compositing for the asset-preservation try-on pipeline.
// The VTON model only supplies geometry + shading; these helpers composite the
// AUTHENTIC pixels back: the real product garment (warp-first mask-back) and the
// user's real face/hair (identity lock). Pure sharp — no model calls here.
//
// Everything is normalized to a fixed full-body portrait canvas so masks,
// garments, and the base always align, and the frame is never cropped.

import sharp from "sharp";

// Fixed full-body canvas. 3:4 matches IDM-VTON's native human-image ratio, so the
// VTON pass re-frames as little as possible. Tall enough for head-to-toe.
export const CANVAS_WIDTH = 768;
export const CANVAS_HEIGHT = 1024;

// Neutral studio-grey pad used when letterboxing a photo to the canvas ratio.
const PAD = { r: 236, g: 236, b: 238 };

export type Box = { left: number; top: number; width: number; height: number };

type Bytes = Buffer | Uint8Array;

/** Pads (never crops) an image to the fixed canvas ratio. Returns PNG bytes. */
export async function letterboxToCanvas(
  input: Bytes,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: "contain", background: PAD })
    .png()
    .toBuffer();
}

/** Single-channel raw luminance on the canvas grid (1 byte per pixel). */
async function toCanvasGrey(
  input: Bytes,
  width: number,
  height: number
): Promise<Buffer> {
  return sharp(input)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .toColourspace("b-w")
    .raw()
    .toBuffer();
}

/**
 * Analyzes a binary mask (white = region) on the canvas grid: the tight bounding
 * box of the masked area, the white-pixel count, and the vertical band it spans.
 * Returns null when the mask is effectively empty.
 */
export async function maskStats(
  maskBytes: Bytes,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Promise<{ box: Box; count: number; minY: number; maxY: number } | null> {
  const data = await toCanvasGrey(maskBytes, width, height);
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1,
    count = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[row + x] > 127) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    box: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    count,
    minY,
    maxY
  };
}

/**
 * Builds a full-canvas RGBA overlay: the garment, stretched to fill the masked
 * region's bounding box (the "warp"), then clipped to the exact mask silhouette
 * with a feathered edge so the VTON pass's shading survives at the boundary.
 */
export async function warpGarmentToMask(
  garmentBytes: Bytes,
  maskBytes: Bytes,
  box: Box,
  opts: { feather?: number } = {},
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Promise<Buffer> {
  const feather = opts.feather ?? 2.5;

  // Garment stretched to the region bbox, placed on a transparent canvas.
  const garmentInBox = await sharp(garmentBytes)
    .resize(box.width, box.height, { fit: "fill" })
    .toBuffer();
  const placed = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: garmentInBox, left: box.left, top: box.top }])
    .png()
    .toBuffer();

  return clipToMask(placed, maskBytes, feather, width, height);
}

/**
 * Clips an overlay image to a mask's silhouette (feathered), yielding an RGBA
 * buffer transparent outside the masked region. Used for both garment mask-back
 * and identity restore.
 */
export async function clipToMask(
  overlayBytes: Bytes,
  maskBytes: Bytes,
  feather = 2.5,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Promise<Buffer> {
  // Feathered, single-channel alpha from the mask luminance.
  const alpha = await sharp(maskBytes)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .blur(feather > 0 ? feather : 0.3)
    .toColourspace("b-w")
    .png()
    .toBuffer();

  const rgb = await sharp(overlayBytes)
    .resize(width, height, { fit: "fill" })
    .removeAlpha()
    .toBuffer();

  return sharp(rgb).joinChannel(alpha).png().toBuffer();
}

/** Composites an RGBA overlay over a base image (both forced to the canvas). */
export async function compositeOver(
  baseBytes: Bytes,
  overlayBytes: Bytes,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT
): Promise<Buffer> {
  const base = await sharp(baseBytes)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  const overlay = await sharp(overlayBytes)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return sharp(base).composite([{ input: overlay }]).png().toBuffer();
}

/**
 * Garment mask-back: paste the authentic product pixels over the figure's
 * garment region (warped to the mask), preserving the VTON shading at the edges.
 */
export async function maskBackGarment(
  baseBytes: Bytes,
  garmentBytes: Bytes,
  maskBytes: Bytes,
  box: Box,
  opts: { feather?: number } = {}
): Promise<Buffer> {
  const overlay = await warpGarmentToMask(garmentBytes, maskBytes, box, opts);
  return compositeOver(baseBytes, overlay);
}

/**
 * Identity lock: paste the user's real face+hair pixels (from the original
 * canvas) back over the composed figure, so no model can drift their features.
 */
export async function restoreIdentity(
  finalBytes: Bytes,
  canvasBytes: Bytes,
  identityMaskBytes: Bytes,
  opts: { feather?: number } = {}
): Promise<Buffer> {
  const overlay = await clipToMask(canvasBytes, identityMaskBytes, opts.feather ?? 3);
  return compositeOver(finalBytes, overlay);
}

/**
 * Best-effort full-body check: true when the mask (e.g. "feet,shoes") has real
 * content in the lower band of the frame, i.e. the feet are actually visible.
 */
export async function maskInLowerBand(
  maskBytes: Bytes,
  fromFraction = 0.62
): Promise<boolean> {
  const stats = await maskStats(maskBytes);
  if (!stats) return false;
  return stats.maxY >= CANVAS_HEIGHT * fromFraction && stats.count > 80;
}

/** Downloads an image URL into a Buffer (model outputs, signed URLs). */
export async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

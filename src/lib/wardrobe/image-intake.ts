// Client-side image intake: validation + HEIC/HEIF → JPEG conversion.
// Runs in the browser only (heic2any depends on the DOM / WebAssembly), so the
// heavy library is loaded lazily and never bundled into the initial page chunk.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Value for the file input's `accept` attribute. Including the HEIC/HEIF types
// (and keeping it image-only) is what makes iOS show the native
// "Photo Library / Take Photo" action sheet when the picker opens.
export const ACCEPTED_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif";

const STANDARD_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);

/**
 * iPhones often hand back HEIC/HEIF files with an empty or non-standard MIME
 * type, so we sniff the extension as well as the reported type.
 */
export function isHeic(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Returns a human-readable error string if the file can't be accepted, or
 * `null` if it's good to process. Checked before any conversion work.
 */
export function validateImageFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That image is over 10 MB. Please choose a smaller photo.";
  }

  const isStandard = STANDARD_IMAGE_TYPES.has(file.type);
  if (!isStandard && !isHeic(file)) {
    // Some browsers report an empty type for valid images; fall back to a
    // loose extension check before rejecting.
    const looksLikeImage = /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name);
    if (!looksLikeImage) {
      return "Unsupported file. Upload a PNG, JPG, WebP, or HEIC image.";
    }
  }

  return null;
}

/**
 * Validates, then transparently converts HEIC/HEIF to JPEG so the rest of the
 * pipeline (background removal, canvas, AI) can treat it like any other image.
 * Non-HEIC files pass through untouched.
 */
export async function prepareImageFile(file: File): Promise<File> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!isHeic(file)) {
    return file;
  }

  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92
  });

  // heic2any returns Blob | Blob[] depending on whether the source had multiple
  // images; we only ever want the first frame.
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const jpegName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

  return new File([blob], jpegName, {
    type: "image/jpeg",
    lastModified: Date.now()
  });
}

type CompressOptions = {
  maxDimension?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
};

/**
 * Downscales + re-encodes an image so the bytes sent over the network stay
 * small. Used for the fallback upload path (when AI background removal can't
 * run); the happy path already emits a compact WebP cut-out. Returns the
 * original file if compression wouldn't actually make it smaller.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1600, quality = 0.82, mimeType = "image/jpeg" }: CompressOptions = {}
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
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
    canvas.toBlob(resolve, mimeType, quality)
  );

  if (!blob || blob.size >= file.size) {
    return file;
  }

  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") + `.${extension}`;
  return new File([blob], name, { type: mimeType });
}

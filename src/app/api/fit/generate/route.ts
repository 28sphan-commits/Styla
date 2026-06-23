import { NextResponse } from "next/server";
import {
  fetchBytes,
  letterboxToCanvas,
  maskInLowerBand
} from "@/lib/fit/compose";
import { CANVAS_LABEL } from "@/lib/fit/capture-steps";
import { garmentRegionMaskUrl } from "@/lib/fit/segmentation";
import { isReplicateConfigured } from "@/lib/fit/replicate";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "fit-models";

// Normalizing the photo and validating full-body framing (one segmentation call)
// happen inline, so allow a long-running request.
export const maxDuration = 300;

// The canvas IS the user's own full-body photo — their real body, face, and hair.
// We no longer generate a body or face-swap; we just normalize the photo to the
// fixed portrait canvas (padded, never cropped) and confirm it's head-to-toe.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  // Pro/Elite only — the mannequin is a paid feature for cost control.
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.membership_tier !== "pro" && profile?.membership_tier !== "elite") {
    return NextResponse.json(
      { error: "The personal mannequin is a Pro feature.", upgrade: true },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { consent?: boolean };
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Please agree to the likeness consent before generating." },
      { status: 400 }
    );
  }

  // Canvas source = the full-body shot from the capture rundown. Photos are
  // captured + labeled via /api/fit/selfies.
  const { data: primary } = await supabase
    .from("fit_selfies")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("label", CANVAS_LABEL)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!primary) {
    return NextResponse.json(
      { error: "Capture a full-body photo (head to toe) first." },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();

  // Pull the original photo and pad it to the fixed full-body canvas.
  const { data: srcSigned, error: srcErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(primary.storage_path, 60 * 60);
  if (srcErr || !srcSigned) {
    return NextResponse.json({ error: "Could not read your photo." }, { status: 500 });
  }

  let canvasBytes: Buffer;
  try {
    canvasBytes = await letterboxToCanvas(await fetchBytes(srcSigned.signedUrl));
  } catch {
    return NextResponse.json({ error: "Could not process your photo." }, { status: 500 });
  }

  // Store the normalized canvas in the private bucket.
  const canvasPath = `${user.id}/canvas/${crypto.randomUUID()}.png`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(canvasPath, canvasBytes, { contentType: "image/png", upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "Could not save your canvas." }, { status: 500 });
  }

  // Confirm the photo is genuinely head-to-toe: the lower-body agnostic mask must
  // reach the lower frame (legs in view). Reuses the same VTON masking the try-on
  // relies on, so a photo that passes here is one the pipeline can actually dress.
  // Requires Replicate; when it isn't configured we accept the photo as-is.
  if (isReplicateConfigured()) {
    try {
      const { data: canvasSigned } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(canvasPath, 60 * 60);
      const maskUrl = canvasSigned
        ? await garmentRegionMaskUrl(canvasSigned.signedUrl, "lower_body")
        : null;
      const fullBody = maskUrl ? await maskInLowerBand(await fetchBytes(maskUrl)) : false;
      if (!fullBody) {
        await supabase.storage.from(BUCKET).remove([canvasPath]);
        return NextResponse.json(
          {
            error:
              "That photo isn't full-body. Upload one head-to-toe shot with your legs and feet in frame."
          },
          { status: 422 }
        );
      }
    } catch {
      // Validation is best-effort — a masking hiccup shouldn't block the user.
    }
  }

  const { error: profErr } = await supabase.from("fit_profiles").upsert({
    user_id: user.id,
    consent_at: nowIso,
    avatar_status: "ready",
    avatar_provider: "photo",
    avatar_storage_path: canvasPath,
    avatar_job_id: null,
    avatar_error: null,
    base_model_key: null,
    updated_at: nowIso
  });
  if (profErr) {
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }

  // A fresh canvas invalidates every previously composed look — they were built
  // on the OLD body image and would otherwise be served from the try-on cache
  // (keyed by item signature only). Scratch them so each look rebuilds on the new
  // canvas. Remove the stored look images first, then the rows; best-effort, so a
  // storage hiccup never blocks finishing setup.
  try {
    const { data: staleLooks } = await supabase
      .from("fit_looks")
      .select("composite_path, result_storage_path")
      .eq("user_id", user.id);
    if (staleLooks?.length) {
      const paths = [
        ...new Set(
          staleLooks
            .flatMap((l) => [l.composite_path, l.result_storage_path])
            .filter((p): p is string => Boolean(p))
        )
      ];
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      await supabase.from("fit_looks").delete().eq("user_id", user.id);
    }
  } catch {
    // Non-fatal — the canvas is saved; a leftover cached look is a minor issue.
  }

  const { data: out } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(canvasPath, 60 * 60);

  return NextResponse.json({
    configured: isReplicateConfigured(),
    status: "ready",
    avatarUrl: out?.signedUrl ?? null
  });
}

import { NextResponse } from "next/server";
import { resolveBaseModelKey } from "@/lib/fit/base-library";
import {
  isReplicateConfigured,
  resolveTargetUrl,
  startFaceSwap
} from "@/lib/fit/replicate";
import { createClient } from "@/lib/supabase/server";

const SELFIE_BUCKET = "fit-models";
const MAX_BYTES = 10 * 1024 * 1024;

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

  const formData = await request.formData();
  const selfie = formData.get("selfie");
  const consent = formData.get("consent") === "true";

  if (!consent) {
    return NextResponse.json(
      { error: "Please agree to the likeness consent before generating." },
      { status: 400 }
    );
  }
  if (!(selfie instanceof File) || selfie.size === 0) {
    return NextResponse.json({ error: "A selfie image is required." }, { status: 400 });
  }
  if (!selfie.type.startsWith("image/")) {
    return NextResponse.json({ error: "Selfie must be an image." }, { status: 400 });
  }
  if (selfie.size > MAX_BYTES) {
    return NextResponse.json({ error: "Selfie must be 10MB or smaller." }, { status: 400 });
  }

  // NOTE (pre-production): selfies should pass an image moderation / NSFW check
  // here before being stored or sent to Replicate. enforceModeration is text
  // only, so an image moderation model still needs to be wired in.

  const extension = selfie.type === "image/jpeg" ? "jpg" : selfie.type === "image/webp" ? "webp" : "png";
  const selfiePath = `${user.id}/selfies/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(selfiePath, selfie, { contentType: selfie.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  await supabase.from("fit_selfies").insert({ user_id: user.id, storage_path: selfiePath });

  const nowIso = new Date().toISOString();

  // Generation not switched on yet — record consent + selfie so the flow is
  // ready, and tell the client it can't run the swap.
  if (!isReplicateConfigured()) {
    await supabase.from("fit_profiles").upsert({
      user_id: user.id,
      consent_at: nowIso,
      avatar_status: "none",
      updated_at: nowIso
    });
    return NextResponse.json({
      configured: false,
      status: "none",
      message: "Selfie saved. Mannequin generation will activate once it's enabled."
    });
  }

  // Replicate fetches both images over HTTP: a short-lived signed URL for the
  // private selfie, and the public base mannequin from /public.
  const { data: signed, error: signError } = await supabase.storage
    .from(SELFIE_BUCKET)
    .createSignedUrl(selfiePath, 60 * 60);
  if (signError || !signed) {
    return NextResponse.json({ error: "Could not prepare the selfie." }, { status: 500 });
  }

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("gender, body_type")
    .eq("user_id", user.id)
    .maybeSingle();

  const baseSelection = { gender: styleDna?.gender, bodyType: styleDna?.body_type };
  const targetUrl = resolveTargetUrl(baseSelection);

  try {
    const prediction = await startFaceSwap({
      faceUrl: signed.signedUrl,
      targetUrl
    });

    await supabase.from("fit_profiles").upsert({
      user_id: user.id,
      consent_at: nowIso,
      avatar_status: "processing",
      avatar_provider: "replicate",
      avatar_job_id: prediction.id,
      avatar_error: null,
      base_model_key: resolveBaseModelKey(baseSelection),
      updated_at: nowIso
    });

    return NextResponse.json({ configured: true, status: "processing" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start generation.";
    await supabase.from("fit_profiles").upsert({
      user_id: user.id,
      consent_at: nowIso,
      avatar_status: "failed",
      avatar_error: message,
      updated_at: nowIso
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

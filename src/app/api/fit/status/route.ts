import { NextResponse } from "next/server";
import { firstOutputUrl, getPrediction, isReplicateConfigured } from "@/lib/fit/replicate";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "fit-models";
const SIGNED_TTL = 60 * 60;

export async function GET() {
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

  const { data: fit } = await supabase
    .from("fit_profiles")
    .select("avatar_status, avatar_job_id, avatar_storage_path, avatar_error")
    .eq("user_id", user.id)
    .maybeSingle();

  const status: string = fit?.avatar_status ?? "none";

  async function signedAvatar(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    const { data } = await supabase!.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? null;
  }

  // Terminal or idle states: just report what's stored.
  if (status !== "processing" || !fit?.avatar_job_id || !isReplicateConfigured()) {
    return NextResponse.json({
      status,
      error: fit?.avatar_error ?? null,
      avatarUrl: status === "ready" ? await signedAvatar(fit?.avatar_storage_path) : null
    });
  }

  // Still processing — poll Replicate.
  let prediction;
  try {
    prediction = await getPrediction(fit.avatar_job_id);
  } catch {
    return NextResponse.json({ status: "processing", error: null, avatarUrl: null });
  }

  if (prediction.status === "succeeded") {
    const outputUrl = firstOutputUrl(prediction.output);
    if (!outputUrl) {
      await supabase
        .from("fit_profiles")
        .update({ avatar_status: "failed", avatar_error: "No image returned." })
        .eq("user_id", user.id);
      return NextResponse.json({ status: "failed", error: "No image returned.", avatarUrl: null });
    }

    // Persist the result into our private bucket (Replicate URLs are temporary).
    const imageRes = await fetch(outputUrl);
    const bytes = new Uint8Array(await imageRes.arrayBuffer());
    const path = `${user.id}/mannequin-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });

    if (uploadError) {
      return NextResponse.json({ status: "processing", error: null, avatarUrl: null });
    }

    await supabase
      .from("fit_profiles")
      .update({
        avatar_status: "ready",
        avatar_storage_path: path,
        avatar_error: null,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id);

    return NextResponse.json({ status: "ready", error: null, avatarUrl: await signedAvatar(path) });
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    const message = prediction.error ?? "Generation failed.";
    await supabase
      .from("fit_profiles")
      .update({ avatar_status: "failed", avatar_error: message })
      .eq("user_id", user.id);
    return NextResponse.json({ status: "failed", error: message, avatarUrl: null });
  }

  return NextResponse.json({ status: "processing", error: null, avatarUrl: null });
}

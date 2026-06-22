import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveBaseModelKey } from "@/lib/fit/base-library";
import { ensureBaseImage } from "@/lib/fit/base-generator";
import { garmentCategory, garmentDescription } from "@/lib/fit/garments";
import {
  firstOutputUrl,
  getPrediction,
  isReplicateConfigured,
  resolveTargetUrl,
  startTryOn
} from "@/lib/fit/replicate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "fit-models";
const SIGNED_TTL = 60 * 60;

// The first try-on for a missing slot generates its base image inline; allow a
// long-running request so that one-time generation can complete.
export const maxDuration = 300;

const startSchema = z.object({
  wardrobeItemId: z.string().uuid(),
  force: z.boolean().optional()
});

async function signed(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

// Resolve the person image for the try-on: the user's personalized mannequin if
// it's ready, otherwise their resolved base from the fit-base library / override.
async function resolveHumanUrl(
  supabase: SupabaseClient,
  userId: string
): Promise<{ url: string; baseKey: string }> {
  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("gender, body_type")
    .eq("user_id", userId)
    .maybeSingle();
  const selection = { gender: styleDna?.gender, bodyType: styleDna?.body_type };
  const baseKey = resolveBaseModelKey(selection);

  const { data: fit } = await supabase
    .from("fit_profiles")
    .select("avatar_status, avatar_storage_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (fit?.avatar_status === "ready" && fit.avatar_storage_path) {
    const url = await signed(supabase, fit.avatar_storage_path);
    if (url) return { url, baseKey };
  }

  // A dev override short-circuits the library entirely.
  if (process.env.REPLICATE_BASE_IMAGE_URL) {
    return { url: resolveTargetUrl(selection), baseKey };
  }

  // Otherwise resolve from the fit-base bucket, generating + caching the image
  // on demand if this slot doesn't exist yet. Requires the service-role key; if
  // it's unavailable, fall back to the (possibly-missing) public URL so the flow
  // still degrades gracefully rather than throwing.
  try {
    const admin = createAdminClient();
    const { url } = await ensureBaseImage(admin, baseKey);
    return { url, baseKey };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Base image unavailable.";
    throw new Error(`Couldn't prepare your base mannequin: ${message}`);
  }
}

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

  // Pro/Elite only.
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.membership_tier !== "pro" && profile?.membership_tier !== "elite") {
    return NextResponse.json(
      { error: "The fitting room is a Pro feature.", upgrade: true },
      { status: 403 }
    );
  }

  const parsed = startSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }
  const { wardrobeItemId, force } = parsed.data;

  // Cache: reuse a ready result for this (user, item) unless a regenerate is forced.
  const { data: existing } = await supabase
    .from("fit_tryons")
    .select("status, result_storage_path")
    .eq("user_id", user.id)
    .eq("wardrobe_item_id", wardrobeItemId)
    .maybeSingle();
  if (existing?.status === "ready" && !force) {
    return NextResponse.json({
      status: "ready",
      cached: true,
      resultUrl: await signed(supabase, existing.result_storage_path)
    });
  }

  const { data: item } = await supabase
    .from("wardrobe_items")
    .select("id, name, type, color, pattern, image_url")
    .eq("id", wardrobeItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const category = garmentCategory(item.type);
  if (!category) {
    return NextResponse.json(
      { error: "This item type can't be tried on yet — only tops, bottoms, and dresses." },
      { status: 400 }
    );
  }

  if (!isReplicateConfigured()) {
    return NextResponse.json(
      { error: "Try-on generation isn't enabled yet." },
      { status: 503 }
    );
  }

  const { url: humanUrl, baseKey } = await resolveHumanUrl(supabase, user.id);

  try {
    const prediction = await startTryOn({
      humanUrl,
      garmentUrl: item.image_url,
      description: garmentDescription(item),
      category
    });

    await supabase.from("fit_tryons").upsert(
      {
        user_id: user.id,
        wardrobe_item_id: wardrobeItemId,
        status: "processing",
        job_id: prediction.id,
        base_model_key: baseKey,
        result_storage_path: null,
        error: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,wardrobe_item_id" }
    );

    return NextResponse.json({ status: "processing" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start try-on.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(request: Request) {
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

  const itemId = new URL(request.url).searchParams.get("wardrobeItemId");
  if (!itemId) {
    return NextResponse.json({ error: "wardrobeItemId required." }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("fit_tryons")
    .select("status, job_id, result_storage_path, error")
    .eq("user_id", user.id)
    .eq("wardrobe_item_id", itemId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ status: "none", resultUrl: null });
  }

  // Terminal/idle states, or generation off: report what's stored.
  if (row.status !== "processing" || !row.job_id || !isReplicateConfigured()) {
    return NextResponse.json({
      status: row.status,
      error: row.error ?? null,
      resultUrl: row.status === "ready" ? await signed(supabase, row.result_storage_path) : null
    });
  }

  let prediction;
  try {
    prediction = await getPrediction(row.job_id);
  } catch {
    return NextResponse.json({ status: "processing", resultUrl: null });
  }

  if (prediction.status === "succeeded") {
    const outputUrl = firstOutputUrl(prediction.output);
    if (!outputUrl) {
      await supabase
        .from("fit_tryons")
        .update({ status: "failed", error: "No image returned." })
        .eq("user_id", user.id)
        .eq("wardrobe_item_id", itemId);
      return NextResponse.json({ status: "failed", error: "No image returned.", resultUrl: null });
    }

    const imageRes = await fetch(outputUrl);
    const bytes = new Uint8Array(await imageRes.arrayBuffer());
    const path = `${user.id}/tryons/${itemId}-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) {
      return NextResponse.json({ status: "processing", resultUrl: null });
    }

    await supabase
      .from("fit_tryons")
      .update({
        status: "ready",
        result_storage_path: path,
        error: null,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("wardrobe_item_id", itemId);

    return NextResponse.json({ status: "ready", resultUrl: await signed(supabase, path) });
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    const message = prediction.error ?? "Try-on failed.";
    await supabase
      .from("fit_tryons")
      .update({ status: "failed", error: message })
      .eq("user_id", user.id)
      .eq("wardrobe_item_id", itemId);
    return NextResponse.json({ status: "failed", error: message, resultUrl: null });
  }

  return NextResponse.json({ status: "processing", resultUrl: null });
}

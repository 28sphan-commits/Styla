import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchBytes, maskBackGarment, maskStats, type Box } from "@/lib/fit/compose";
import {
  categoryLayerRank,
  garmentCategory,
  garmentDescription,
  type GarmentCategory
} from "@/lib/fit/garments";
import {
  firstOutputUrl,
  getPrediction,
  isReplicateConfigured,
  resolveTargetUrl,
  startTryOn
} from "@/lib/fit/replicate";
import { garmentRegionMaskUrl } from "@/lib/fit/segmentation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "fit-models";
const SIGNED_TTL = 60 * 60;
const MAX_ITEMS = 4;

// Resolving/generating the base canvas and starting a layer happen inline; allow
// a long-running request. (Each GET poll only advances ONE layer, so polls stay
// short even though the full chain can take a few minutes.)
export const maxDuration = 300;

const startSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(MAX_ITEMS),
  force: z.boolean().optional()
});

type WardrobeItem = {
  id: string;
  name: string;
  type: string[];
  color: string[];
  pattern: string[];
  image_url: string;
};

async function signed(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

// The full-body person canvas IS the user's normalized photo (real body, face,
// and hair), prepared by /api/fit/generate. No generated body, no face-swap.
async function getCanvasPath(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: fit } = await supabase
    .from("fit_profiles")
    .select("avatar_status, avatar_storage_path")
    .eq("user_id", userId)
    .maybeSingle();
  return fit?.avatar_status === "ready" && fit.avatar_storage_path
    ? fit.avatar_storage_path
    : null;
}

async function resolveHumanUrl(supabase: SupabaseClient, userId: string): Promise<string> {
  // Dev override (a public, cloud-reachable image) short-circuits everything.
  if (process.env.REPLICATE_BASE_IMAGE_URL) return resolveTargetUrl({});

  const canvasPath = await getCanvasPath(supabase, userId);
  if (canvasPath) {
    const url = await signed(supabase, canvasPath);
    if (url) return url;
  }
  throw new Error("Set up your full-body photo in the fitting room first.");
}

async function getItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string
): Promise<WardrobeItem | null> {
  const { data } = await supabase
    .from("wardrobe_items")
    .select("id, name, type, color, pattern, image_url")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as WardrobeItem) ?? null;
}

// Start a single VTON layer: render `item` onto the running person image.
async function startLayer(humanUrl: string, item: WardrobeItem) {
  const category = garmentCategory(item.type);
  if (!category) throw new Error(`${item.name} can't be tried on.`);
  return startTryOn({
    humanUrl,
    garmentUrl: item.image_url,
    description: garmentDescription(item),
    category
  });
}

// Persist a Replicate output image into the private bucket; returns its path.
async function storeOutput(
  supabase: SupabaseClient,
  userId: string,
  lookId: string,
  layer: number,
  outputUrl: string
): Promise<string | null> {
  const res = await fetch(outputUrl);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `${userId}/looks/${lookId}/layer-${layer}-${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  return error ? null : path;
}

// Asset-preservation finalize: the VTON composite has correct garment geometry +
// shading but re-drawn pixels. Here we warp each garment's AUTHENTIC product
// pixels back over its category region (IDM-VTON's own pose-aligned agnostic
// mask) so logos/weave/material stay real, then persist the locked-in image.
//
// Identity needs no restore step: the canvas is the user's real photo and the
// VTON pass only repaints the garment region, so their face/hair survive intact.
async function finalizeLook(
  supabase: SupabaseClient,
  userId: string,
  look: { id: string; item_ids: string[] },
  composedPath: string
): Promise<string> {
  const composedUrl = await signed(supabase, composedPath);
  if (!composedUrl) throw new Error("Could not read the composed look.");
  let image = await fetchBytes(composedUrl);

  // Load the look's items (in layer order) and the distinct categories present.
  const items: WardrobeItem[] = [];
  for (const itemId of look.item_ids) {
    const item = await getItem(supabase, userId, itemId);
    if (item && garmentCategory(item.type)) items.push(item);
  }
  const categories = [...new Set(items.map((i) => garmentCategory(i.type)!))];

  // One agnostic mask per category, detected on the composed figure (pose is
  // identical to the canvas since crop:false preserves framing).
  const maskByCategory = new Map<GarmentCategory, { bytes: Buffer; box: Box }>();
  for (const category of categories) {
    try {
      const maskUrl = await garmentRegionMaskUrl(composedUrl, category);
      if (!maskUrl) continue;
      const bytes = await fetchBytes(maskUrl);
      const stats = await maskStats(bytes);
      if (stats) maskByCategory.set(category, { bytes, box: stats.box });
    } catch {
      // No mask for this category → leave its VTON rendering untouched.
    }
  }

  // Warp authentic garment pixels back, in layer order (bottoms first).
  for (const item of items) {
    const mask = maskByCategory.get(garmentCategory(item.type)!);
    if (!mask) continue;
    try {
      const garmentBytes = await fetchBytes(item.image_url);
      image = await maskBackGarment(image, garmentBytes, mask.bytes, mask.box);
    } catch {
      // A failed mask-back just leaves the VTON rendering for that piece.
    }
  }

  const finalPath = `${userId}/looks/${look.id}/final-${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(finalPath, image, { contentType: "image/png", upsert: false });
  if (error) throw new Error("Could not save the final look.");
  return finalPath;
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
    return NextResponse.json(
      { error: "Pick 1–4 wardrobe pieces to try on." },
      { status: 400 }
    );
  }
  const itemIds = [...new Set(parsed.data.itemIds)];
  const { force } = parsed.data;

  // Load the selected items and verify they belong to the user.
  const { data: rawItems } = await supabase
    .from("wardrobe_items")
    .select("id, name, type, color, pattern, image_url")
    .eq("user_id", user.id)
    .in("id", itemIds);
  const byId = new Map((rawItems ?? []).map((i) => [i.id, i as WardrobeItem]));
  if (byId.size !== itemIds.length) {
    return NextResponse.json({ error: "Some items couldn't be found." }, { status: 404 });
  }

  // All must be try-on-able. Order them into layers (bottoms → tops → dresses),
  // tie-breaking by the order they were selected.
  const selection = itemIds.map((id) => byId.get(id)!);
  for (const item of selection) {
    if (!garmentCategory(item.type)) {
      return NextResponse.json(
        { error: `${item.name} can't be tried on — only tops, bottoms, and dresses.` },
        { status: 400 }
      );
    }
  }
  const ordered = selection
    .map((item, idx) => ({ item, idx, rank: categoryLayerRank(garmentCategory(item.type)!) }))
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map((x) => x.item);

  // Cache key is order-independent so the same outfit always hits one result.
  const signature = [...itemIds].sort().join(",");

  const { data: existing } = await supabase
    .from("fit_looks")
    .select("id, status, result_storage_path")
    .eq("user_id", user.id)
    .eq("item_signature", signature)
    .maybeSingle();
  if (existing?.status === "ready" && !force) {
    return NextResponse.json({
      status: "ready",
      cached: true,
      lookId: existing.id,
      layer: ordered.length,
      total: ordered.length,
      resultUrl: await signed(supabase, existing.result_storage_path)
    });
  }

  if (!isReplicateConfigured()) {
    return NextResponse.json({ error: "Try-on generation isn't enabled yet." }, { status: 503 });
  }

  let humanUrl: string;
  try {
    humanUrl = await resolveHumanUrl(supabase, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not prepare your body canvas.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const prediction = await startLayer(humanUrl, ordered[0]);

    const { data: look, error } = await supabase
      .from("fit_looks")
      .upsert(
        {
          user_id: user.id,
          item_ids: ordered.map((i) => i.id),
          item_signature: signature,
          status: "processing",
          layer_index: 0,
          current_job_id: prediction.id,
          composite_path: null,
          result_storage_path: null,
          error: null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id,item_signature" }
      )
      .select("id")
      .single();
    if (error || !look) {
      return NextResponse.json({ error: "Could not start your look." }, { status: 500 });
    }

    return NextResponse.json({
      status: "processing",
      lookId: look.id,
      layer: 0,
      total: ordered.length
    });
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

  const lookId = new URL(request.url).searchParams.get("lookId");
  if (!lookId) {
    return NextResponse.json({ error: "lookId required." }, { status: 400 });
  }

  const { data: look } = await supabase
    .from("fit_looks")
    .select("id, item_ids, status, layer_index, current_job_id, composite_path, result_storage_path, error")
    .eq("id", lookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!look) {
    return NextResponse.json({ status: "none", resultUrl: null });
  }

  const total = look.item_ids.length;

  // Terminal/idle states, or generation off: report what's stored.
  if (look.status !== "processing" || !look.current_job_id || !isReplicateConfigured()) {
    return NextResponse.json({
      status: look.status,
      error: look.error ?? null,
      layer: look.layer_index,
      total,
      resultUrl: look.status === "ready" ? await signed(supabase, look.result_storage_path) : null
    });
  }

  async function fail(message: string) {
    await supabase!
      .from("fit_looks")
      .update({ status: "failed", error: message, current_job_id: null })
      .eq("id", look!.id);
    return NextResponse.json({ status: "failed", error: message, layer: look!.layer_index, total, resultUrl: null });
  }

  let prediction;
  try {
    prediction = await getPrediction(look.current_job_id);
  } catch {
    return NextResponse.json({ status: "processing", layer: look.layer_index, total, resultUrl: null });
  }

  if (prediction.status === "succeeded") {
    const outputUrl = firstOutputUrl(prediction.output);
    if (!outputUrl) return fail("No image returned.");

    const compositePath = await storeOutput(supabase, user.id, look.id, look.layer_index, outputUrl);
    if (!compositePath) {
      // Upload hiccup — leave processing and retry on the next poll.
      return NextResponse.json({ status: "processing", layer: look.layer_index, total, resultUrl: null });
    }

    const nextIndex = look.layer_index + 1;

    // More garments to layer: feed this composite in as the next person image.
    if (nextIndex < total) {
      const nextItem = await getItem(supabase, user.id, look.item_ids[nextIndex]);
      if (!nextItem) return fail("A selected item is no longer available.");

      const humanUrl = await signed(supabase, compositePath);
      if (!humanUrl) return fail("Could not continue the composition.");

      let next;
      try {
        next = await startLayer(humanUrl, nextItem);
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Could not layer the next garment.");
      }

      await supabase
        .from("fit_looks")
        .update({
          layer_index: nextIndex,
          current_job_id: next.id,
          composite_path: compositePath,
          updated_at: new Date().toISOString()
        })
        .eq("id", look.id);

      return NextResponse.json({ status: "processing", layer: nextIndex, total, resultUrl: null });
    }

    // All garments rendered. Switch to `finalizing` first — this blocks any
    // concurrent poll from re-running (the early-return guard reports it) while
    // we composite the authentic garment + identity pixels back in-process.
    await supabase
      .from("fit_looks")
      .update({
        status: "finalizing",
        composite_path: compositePath,
        current_job_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", look.id);

    let finalPath: string;
    try {
      finalPath = await finalizeLook(
        supabase,
        user.id,
        { id: look.id, item_ids: look.item_ids },
        compositePath
      );
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not finalize your look.");
    }

    await supabase
      .from("fit_looks")
      .update({
        status: "ready",
        result_storage_path: finalPath,
        composite_path: finalPath,
        current_job_id: null,
        error: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", look.id);

    return NextResponse.json({
      status: "ready",
      layer: total,
      total,
      resultUrl: await signed(supabase, finalPath)
    });
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return fail(prediction.error ?? "Try-on failed.");
  }

  return NextResponse.json({ status: "processing", layer: look.layer_index, total, resultUrl: null });
}

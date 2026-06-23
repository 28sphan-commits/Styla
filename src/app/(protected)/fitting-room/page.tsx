import { redirect } from "next/navigation";
import { FittingRoom } from "@/components/fit/fitting-room";
import { WardrobeTryOn } from "@/components/fit/wardrobe-tryon";
import { isSetupComplete } from "@/lib/fit/capture-steps";
import { createClient } from "@/lib/supabase/server";

type Shot = { label: string; url: string | null };

type InitialLook = { id: string; resultUrl: string | null; itemIds: string[] } | null;

export default async function FittingRoomPage() {
  const supabase = await createClient();
  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();

  const { data: fit } = await supabase
    .from("fit_profiles")
    .select("avatar_status, avatar_storage_path, consent_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const isPro =
    profile?.membership_tier === "pro" || profile?.membership_tier === "elite";

  // Sign the stored mannequin (private bucket) for the initial render.
  let avatarUrl: string | null = null;
  if (fit?.avatar_status === "ready" && fit.avatar_storage_path) {
    const { data } = await supabase.storage
      .from("fit-models")
      .createSignedUrl(fit.avatar_storage_path, 60 * 60);
    avatarUrl = data?.signedUrl ?? null;
  }

  // Pro users also get the wardrobe look-builder + their most recent composed
  // look, plus the photos captured in the guided rundown.
  let items: { id: string; name: string; type: string[]; image_url: string }[] = [];
  let initialLook: InitialLook = null;
  const initialShots: Shot[] = [];
  let setupComplete = false;
  if (isPro) {
    const { data: selfieRows } = await supabase
      .from("fit_selfies")
      .select("storage_path, label, sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });
    for (const row of selfieRows ?? []) {
      if (!row.label) continue;
      const { data } = await supabase.storage
        .from("fit-models")
        .createSignedUrl(row.storage_path, 60 * 60);
      initialShots.push({ label: row.label, url: data?.signedUrl ?? null });
    }
    setupComplete = isSetupComplete(initialShots.map((s) => s.label));

    const { data: wardrobe } = await supabase
      .from("wardrobe_items")
      .select("id, name, type, image_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    items = wardrobe ?? [];

    // Surface the user's most recent ready look so the stage isn't empty.
    const { data: lastLook } = await supabase
      .from("fit_looks")
      .select("id, item_ids, result_storage_path")
      .eq("user_id", user.id)
      .eq("status", "ready")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastLook) {
      let resultUrl: string | null = null;
      if (lastLook.result_storage_path) {
        const { data } = await supabase.storage
          .from("fit-models")
          .createSignedUrl(lastLook.result_storage_path, 60 * 60);
        resultUrl = data?.signedUrl ?? null;
      }
      initialLook = { id: lastLook.id, resultUrl, itemIds: lastLook.item_ids ?? [] };
    }
  }

  return (
    <>
      <FittingRoom
        isPro={isPro}
        initialStatus={(fit?.avatar_status as "none" | "processing" | "ready" | "failed") ?? "none"}
        initialAvatarUrl={avatarUrl}
        hasConsented={Boolean(fit?.consent_at)}
        initialShots={initialShots}
        initialSetupComplete={setupComplete}
      />
      {isPro ? <WardrobeTryOn items={items} initialLook={initialLook} /> : null}
    </>
  );
}

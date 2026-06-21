import { redirect } from "next/navigation";
import { FittingRoom } from "@/components/fit/fitting-room";
import { WardrobeTryOn } from "@/components/fit/wardrobe-tryon";
import { createClient } from "@/lib/supabase/server";

type TryOnState = {
  status: "none" | "processing" | "ready" | "failed";
  resultUrl: string | null;
  error?: string | null;
};

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

  // Pro users also get the wardrobe try-on grid + their cached results.
  let items: { id: string; name: string; type: string[]; image_url: string }[] = [];
  const initialTryons: Record<string, TryOnState> = {};
  if (isPro) {
    const { data: wardrobe } = await supabase
      .from("wardrobe_items")
      .select("id, name, type, image_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    items = wardrobe ?? [];

    const { data: tryons } = await supabase
      .from("fit_tryons")
      .select("wardrobe_item_id, status, result_storage_path, error")
      .eq("user_id", user.id);

    for (const tryon of tryons ?? []) {
      let resultUrl: string | null = null;
      if (tryon.status === "ready" && tryon.result_storage_path) {
        const { data } = await supabase.storage
          .from("fit-models")
          .createSignedUrl(tryon.result_storage_path, 60 * 60);
        resultUrl = data?.signedUrl ?? null;
      }
      initialTryons[tryon.wardrobe_item_id] = {
        status: tryon.status,
        resultUrl,
        error: tryon.error
      };
    }
  }

  return (
    <>
      <FittingRoom
        isPro={isPro}
        initialStatus={(fit?.avatar_status as "none" | "processing" | "ready" | "failed") ?? "none"}
        initialAvatarUrl={avatarUrl}
        hasConsented={Boolean(fit?.consent_at)}
      />
      {isPro ? <WardrobeTryOn items={items} initialTryons={initialTryons} /> : null}
    </>
  );
}

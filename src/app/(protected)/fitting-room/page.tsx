import { redirect } from "next/navigation";
import { FittingRoom } from "@/components/fit/fitting-room";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <FittingRoom
      isPro={isPro}
      initialStatus={(fit?.avatar_status as "none" | "processing" | "ready" | "failed") ?? "none"}
      initialAvatarUrl={avatarUrl}
      hasConsented={Boolean(fit?.consent_at)}
    />
  );
}

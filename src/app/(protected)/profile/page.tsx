import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/profile/profile-editor";
import type { StyleDna } from "@/lib/onboarding";
import type { ProfileRecord } from "@/lib/profile/schema";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
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
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!styleDna) {
    redirect("/onboarding");
  }

  return (
    <ProfileEditor
      initialProfile={
        {
          id: user.id,
          email: user.email ?? null,
          full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
          username: profile?.username ?? null,
          bio: profile?.bio ?? "",
          membership_tier: profile?.membership_tier ?? "free",
          is_public: profile?.is_public ?? false,
          show_outfits: profile?.show_outfits ?? true
        } as ProfileRecord
      }
      initialStyleDna={styleDna as StyleDna}
    />
  );
}

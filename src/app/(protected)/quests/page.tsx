import { redirect } from "next/navigation";
import { QuestsBoard } from "@/components/quests/quests-board";
import { loadQuestState } from "@/lib/quests/loader";
import { createClient } from "@/lib/supabase/server";

export default async function QuestsPage() {
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

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!styleDna) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_tier")
    .eq("id", user.id)
    .maybeSingle();

  const tier = (profile?.membership_tier as string) ?? "free";
  const state = await loadQuestState(supabase, user.id, tier);

  return <QuestsBoard state={state} tier={tier} />;
}

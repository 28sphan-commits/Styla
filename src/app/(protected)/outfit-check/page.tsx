import { redirect } from "next/navigation";
import { OutfitChecker } from "@/components/outfit-check/outfit-checker";
import { createClient } from "@/lib/supabase/server";

export default async function OutfitCheckPage() {
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

  return <OutfitChecker />;
}

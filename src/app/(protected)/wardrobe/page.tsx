import { redirect } from "next/navigation";
import { WardrobeManager } from "@/components/wardrobe/wardrobe-manager";
import { createClient } from "@/lib/supabase/server";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

export default async function WardrobePage() {
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

  const { data: items } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return <WardrobeManager initialItems={(items ?? []) as WardrobeItem[]} />;
}

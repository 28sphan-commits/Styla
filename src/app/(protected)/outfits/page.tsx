import { redirect } from "next/navigation";
import { OutfitLibrary } from "@/components/outfits/outfit-library";
import { loadBookmarkedOutfits, loadOwnOutfits } from "@/lib/outfits/loaders";
import type { OutfitLibraryItem } from "@/lib/outfits/schema";
import { createClient } from "@/lib/supabase/server";

export default async function OutfitsPage() {
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

  const [mine, saved] = await Promise.all([
    loadOwnOutfits(supabase, user.id),
    loadBookmarkedOutfits(supabase, user.id)
  ]);

  return (
    <OutfitLibrary
      mine={mine.map((outfit) => ({ ...outfit, source: "mine" }) as OutfitLibraryItem)}
      saved={saved.map((outfit) => ({ ...outfit, source: "saved" }) as OutfitLibraryItem)}
    />
  );
}

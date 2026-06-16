import { redirect } from "next/navigation";
import { OutfitLibrary } from "@/components/outfits/outfit-library";
import {
  attachItemsToOutfits,
  loadBookmarkedOutfits
} from "@/lib/outfits/loaders";
import type { OutfitLibraryItem, SavedOutfit } from "@/lib/outfits/schema";
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

  const { data: mineRows } = await supabase
    .from("outfits")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const bookmarkedRows = await loadBookmarkedOutfits(supabase, user.id);
  const mine = await attachItemsToOutfits(supabase, (mineRows ?? []) as SavedOutfit[]);
  const saved = await attachItemsToOutfits(supabase, bookmarkedRows);

  return (
    <OutfitLibrary
      mine={mine.map((outfit) => ({ ...outfit, source: "mine" }) as OutfitLibraryItem)}
      saved={saved.map((outfit) => ({ ...outfit, source: "saved" }) as OutfitLibraryItem)}
    />
  );
}

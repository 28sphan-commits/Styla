import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicOutfits } from "@/lib/outfits/loaders";
import type { PublicOutfit } from "@/lib/social/schema";

export type AuraLeaderboardEntry = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  membership_tier: string;
  aura_points: number;
};

// Popularity score shared with the Trending sort: weighted engagement. Saves and
// views are 0 until the engagement migration is applied, so it degrades to a
// like-based ranking gracefully.
export function popularityScore(outfit: {
  like_count: number;
  save_count: number;
  view_count: number;
}): number {
  return outfit.like_count * 3 + outfit.save_count * 2 + outfit.view_count;
}

// Top public profiles by aura points. `available` is false until the quests
// migration adds the aura_points column, so the UI can show a setup notice.
export async function loadAuraLeaderboard(
  supabase: SupabaseClient,
  limit = 10
): Promise<{ available: boolean; entries: AuraLeaderboardEntry[] }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, membership_tier, aura_points")
    .eq("is_public", true)
    .order("aura_points", { ascending: false })
    .limit(limit);

  if (error) {
    return { available: false, entries: [] };
  }

  return {
    available: true,
    entries: ((data ?? []) as AuraLeaderboardEntry[]).filter(
      (entry) => entry.username
    )
  };
}

// Top public looks by popularity (engagement).
export async function loadPopularPosts(
  supabase: SupabaseClient,
  userId: string,
  limit = 10
): Promise<PublicOutfit[]> {
  const outfits = await loadPublicOutfits(supabase, userId, { feed: "all" }, 96);
  return [...outfits]
    .sort((a, b) => popularityScore(b) - popularityScore(a))
    .slice(0, limit);
}

import type { OutfitLibraryItem } from "@/lib/outfits/schema";
import type { ProfileRecord } from "@/lib/profile/schema";

export type PublicProfile = Pick<
  ProfileRecord,
  "id" | "username" | "full_name" | "avatar_url" | "bio" | "membership_tier"
> & {
  outfit_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  style_aesthetic: string | null;
  body_type: string | null;
  lifestyle: string | null;
  budget_per_item: string | null;
  color_preference: string | null;
  gender: string | null;
};

export type PublicOutfit = OutfitLibraryItem & {
  creator: PublicProfile | null;
  like_count: number;
  comment_count: number;
  save_count: number;
  view_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
};

// Extends PublicProfile with onboarding survey fields used by stylist discovery.
export type StylistProfile = PublicProfile & {
  style_aesthetic: string | null;
  style_notes: string | null;
};

export type ExploreFilter = {
  feed?: "all" | "following";
  occasion?: string;
  mood?: string;
  weather?: string;
};

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
};

export type PublicOutfit = OutfitLibraryItem & {
  creator: PublicProfile | null;
  like_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
};

export type ExploreFilter = {
  feed?: "all" | "following";
  occasion?: string;
  mood?: string;
  weather?: string;
};

import type {
  OutfitItemView,
  OutfitLibraryItem,
  SavedOutfit
} from "@/lib/outfits/schema";
import type {
  ExploreFilter,
  PublicOutfit,
  PublicProfile,
  StylistProfile
} from "@/lib/social/schema";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => unknown;
  };
};

// Extended variant used only by functions that call RPC endpoints.
// PromiseLike (not Promise) because PostgrestFilterBuilder is thenable but
// not a full Promise.
type SupabaseLikeWithRpc = SupabaseLike & {
  rpc: (
    fn: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function asQuery(value: unknown) {
  return value as QueryBuilder;
}

function countBy<T extends string>(
  rows: Record<T, string>[],
  key: T
): Map<string, number> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  });
  return counts;
}

// Outfit rows fetched with their items + each item's wardrobe row embedded in a
// single PostgREST query, instead of three sequential round-trips.
const OUTFIT_WITH_ITEMS = "*, outfit_items(position, wardrobe_items(*))";

type OutfitRowWithItems = SavedOutfit & {
  outfit_items?: { position: number; wardrobe_items: WardrobeItem | null }[] | null;
};

// Reshapes embedded outfit rows into OutfitLibraryItem. Pure — no DB round-trips.
function mapOutfitItems(rows: OutfitRowWithItems[]): OutfitLibraryItem[] {
  return rows.map(({ outfit_items, ...outfit }) => ({
    ...(outfit as SavedOutfit),
    items: (outfit_items ?? [])
      .filter(
        (join): join is { position: number; wardrobe_items: WardrobeItem } =>
          Boolean(join.wardrobe_items)
      )
      .sort((a, b) => a.position - b.position)
      .map(
        (join) =>
          ({ ...join.wardrobe_items, position: join.position }) as OutfitItemView
      )
  }));
}

export async function loadSharedOutfit(
  supabase: SupabaseLike,
  shareSlug: string
): Promise<OutfitLibraryItem | null> {
  const { data: outfit } = await asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  )
    .eq("share_slug", shareSlug)
    .eq("is_public", true)
    .maybeSingle();

  return outfit ? mapOutfitItems([outfit as OutfitRowWithItems])[0] ?? null : null;
}

export async function loadOwnOutfits(
  supabase: SupabaseLike,
  userId: string
): Promise<OutfitLibraryItem[]> {
  const { data: outfitRows } = await asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return mapOutfitItems((outfitRows ?? []) as OutfitRowWithItems[]);
}

export async function loadOutfitsByIds(
  supabase: SupabaseLike,
  ids: string[]
): Promise<OutfitLibraryItem[]> {
  if (!ids.length) return [];

  const { data: outfitRows } = await asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  ).in("id", ids);

  return mapOutfitItems((outfitRows ?? []) as OutfitRowWithItems[]);
}

export async function loadBookmarkedOutfits(
  supabase: SupabaseLike,
  userId: string
) {
  const { data: bookmarkRows } = await asQuery(
    supabase.from("bookmarks").select("outfit_id, created_at")
  )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const outfitIds = ((bookmarkRows ?? []) as { outfit_id: string }[]).map(
    (bookmark) => bookmark.outfit_id
  );

  if (!outfitIds.length) {
    return [];
  }

  const { data: outfits } = await asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  ).in("id", outfitIds);
  const order = new Map(outfitIds.map((id, index) => [id, index]));

  return mapOutfitItems((outfits ?? []) as OutfitRowWithItems[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

export async function loadPublicOutfits(
  supabase: SupabaseLike,
  userId: string,
  filter: ExploreFilter = {},
  limit = 24
): Promise<PublicOutfit[]> {
  const followingIds =
    filter.feed === "following" ? await loadFollowingIds(supabase, userId) : [];

  if (filter.feed === "following" && !followingIds.length) {
    return [];
  }

  let outfitQuery = asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  )
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filter.occasion) outfitQuery = outfitQuery.eq("occasion", filter.occasion);
  if (filter.mood) outfitQuery = outfitQuery.eq("mood", filter.mood);
  if (filter.weather) outfitQuery = outfitQuery.eq("weather", filter.weather);
  if (followingIds.length) outfitQuery = outfitQuery.in("user_id", followingIds);

  const { data: outfitRows } = await outfitQuery;
  const outfits = mapOutfitItems((outfitRows ?? []) as OutfitRowWithItems[]);

  return attachSocialData(supabase, userId, outfits);
}

export async function loadPublicProfileByUsername(
  supabase: SupabaseLike,
  currentUserId: string | null,
  username: string
): Promise<PublicProfile | null> {
  const { data: profile } = await asQuery(
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, membership_tier")
  )
    .eq("username", username)
    .maybeSingle();

  if (!profile) {
    return null;
  }

  const [profileWithStats] = await attachProfileStats(
    supabase,
    currentUserId,
    [profile as PublicProfile]
  );
  return profileWithStats ?? null;
}

export async function loadPublicProfiles(
  supabase: SupabaseLike,
  currentUserId: string,
  query = "",
  limit = 12
): Promise<PublicProfile[]> {
  let profileQuery = asQuery(
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, membership_tier")
  )
    .eq("is_public", true)
    .neq("id", currentUserId)
    .limit(limit);

  const trimmed = query.trim();
  if (trimmed) {
    const escaped = trimmed.replaceAll(",", " ").replaceAll("%", "");
    profileQuery = profileQuery.or(
      `username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`
    );
  }

  const { data: profiles } = await profileQuery;
  return attachProfileStats(
    supabase,
    currentUserId,
    ((profiles ?? []) as PublicProfile[]).filter((profile) => profile.username)
  );
}

export async function loadRecommendedProfiles(
  supabase: SupabaseLikeWithRpc,
  currentUserId: string,
  limit = 6
): Promise<PublicProfile[]> {
  const { data } = await supabase.rpc("get_recommended_stylists", {
    viewer_id: currentUserId,
    limit_n: limit
  });

  const rows = (data ?? []) as Array<PublicProfile & { match_score: number }>;
  const profiles = rows
    .filter((row) => row.username)
    .map(({ match_score: _ms, ...profile }) => profile as PublicProfile);

  // If the viewer has items but none matched any other user's wardrobe yet,
  // fall back to the popular-profiles query so the section is never empty.
  if (!profiles.length) {
    return loadPublicProfiles(supabase, currentUserId, "", limit);
  }

  return profiles;
}

export async function loadPublicOutfitsForProfile(
  supabase: SupabaseLike,
  currentUserId: string | null,
  profileId: string
): Promise<PublicOutfit[]> {
  const { data: outfitRows } = await asQuery(
    supabase.from("outfits").select(OUTFIT_WITH_ITEMS)
  )
    .eq("user_id", profileId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(24);

  const outfits = mapOutfitItems((outfitRows ?? []) as OutfitRowWithItems[]);

  return attachSocialData(supabase, currentUserId, outfits);
}

// Mutual friends = people the user follows who also follow the user back.
// Both directions are readable under the follows RLS policy (the user is a party
// to each row), and since you can only follow public profiles, every mutual
// friend's profile row is readable too.
export async function loadMutualFriends(
  supabase: SupabaseLike,
  userId: string
): Promise<PublicProfile[]> {
  const [{ data: following }, { data: followers }] = await Promise.all([
    asQuery(supabase.from("follows").select("following_id")).eq("follower_id", userId),
    asQuery(supabase.from("follows").select("follower_id")).eq("following_id", userId)
  ]);

  const followingIds = new Set(
    ((following ?? []) as { following_id: string }[]).map((row) => row.following_id)
  );
  const mutualIds = Array.from(
    new Set(
      ((followers ?? []) as { follower_id: string }[])
        .map((row) => row.follower_id)
        .filter((id) => followingIds.has(id))
    )
  );

  if (!mutualIds.length) {
    return [];
  }

  const { data: profiles } = await asQuery(
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, membership_tier")
  ).in("id", mutualIds);

  return attachProfileStats(
    supabase,
    userId,
    ((profiles ?? []) as PublicProfile[]).filter((profile) => profile.username)
  );
}

// Loads all public profiles plus their style_dna aesthetic + notes for
// the stylist discovery page. The style_dna join runs in parallel with the
// profile stats query so there is no extra serial round-trip.
export async function loadStylistProfiles(
  supabase: SupabaseLike,
  currentUserId: string,
  limit = 96
): Promise<StylistProfile[]> {
  const { data: profileRows } = await asQuery(
    supabase
      .from("profiles")
      .select("id, username, full_name, avatar_url, bio, membership_tier")
  )
    .eq("is_public", true)
    .neq("id", currentUserId)
    .limit(limit);

  const profiles = ((profileRows ?? []) as PublicProfile[]).filter(
    (profile) => profile.username
  );

  if (!profiles.length) return [];

  const profileIds = profiles.map((p) => p.id);

  const [profilesWithStats, { data: dnaRows }] = await Promise.all([
    attachProfileStats(supabase, currentUserId, profiles),
    asQuery(
      supabase.from("style_dna").select("user_id, style_aesthetic, style_notes")
    ).in("user_id", profileIds)
  ]);

  type DnaRow = { user_id: string; style_aesthetic: string; style_notes: string | null };
  const dnaMap = new Map(
    ((dnaRows ?? []) as DnaRow[]).map((row) => [row.user_id, row])
  );

  return profilesWithStats.map((profile) => ({
    ...profile,
    style_aesthetic: dnaMap.get(profile.id)?.style_aesthetic ?? null,
    style_notes: dnaMap.get(profile.id)?.style_notes ?? null
  }));
}

export async function loadFollowingIds(supabase: SupabaseLike, userId: string) {
  const { data: followRows } = await asQuery(
    supabase.from("follows").select("following_id")
  ).eq("follower_id", userId);

  return ((followRows ?? []) as { following_id: string }[]).map(
    (row) => row.following_id
  );
}

async function attachSocialData(
  supabase: SupabaseLike,
  userId: string | null,
  outfits: OutfitLibraryItem[]
): Promise<PublicOutfit[]> {
  if (!outfits.length) return [];

  const outfitIds = outfits.map((outfit) => outfit.id);
  const creatorIds = Array.from(new Set(outfits.map((outfit) => outfit.user_id)));

  const [{ data: profiles }, { data: likes }, { data: bookmarks }, { data: commentRows }] =
    await Promise.all([
      asQuery(
        supabase
          .from("profiles")
          .select("id, username, full_name, avatar_url, bio, membership_tier")
      ).in("id", creatorIds),
      asQuery(supabase.from("likes").select("user_id, outfit_id")).in(
        "outfit_id",
        outfitIds
      ),
      userId
        ? asQuery(supabase.from("bookmarks").select("outfit_id"))
            .eq("user_id", userId)
            .in("outfit_id", outfitIds)
        : Promise.resolve({ data: [], error: null }),
      asQuery(supabase.from("comments").select("outfit_id")).in(
        "outfit_id",
        outfitIds
      )
    ]);

  const profilesWithStats = await attachProfileStats(
    supabase,
    userId,
    (profiles ?? []) as PublicProfile[]
  );
  const profileById = new Map(profilesWithStats.map((profile) => [profile.id, profile]));
  const likeRows = (likes ?? []) as { user_id: string; outfit_id: string }[];
  const likeCounts = countBy(likeRows, "outfit_id");
  const likedIds = new Set(
    likeRows.filter((like) => like.user_id === userId).map((like) => like.outfit_id)
  );
  const bookmarkedIds = new Set(
    ((bookmarks ?? []) as { outfit_id: string }[]).map((bookmark) => bookmark.outfit_id)
  );
  const commentCounts = countBy(
    (commentRows ?? []) as { outfit_id: string }[],
    "outfit_id"
  );

  return outfits.map((outfit) => ({
    ...outfit,
    creator: profileById.get(outfit.user_id) ?? null,
    like_count: likeCounts.get(outfit.id) ?? 0,
    comment_count: commentCounts.get(outfit.id) ?? 0,
    is_liked: likedIds.has(outfit.id),
    is_bookmarked: bookmarkedIds.has(outfit.id)
  }));
}

async function attachProfileStats(
  supabase: SupabaseLike,
  currentUserId: string | null,
  profiles: PublicProfile[]
): Promise<PublicProfile[]> {
  if (!profiles.length) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const [{ data: outfits }, { data: followers }, { data: following }, { data: mine }] =
    await Promise.all([
      asQuery(supabase.from("outfits").select("user_id")).in("user_id", profileIds),
      asQuery(supabase.from("follows").select("following_id")).in(
        "following_id",
        profileIds
      ),
      asQuery(supabase.from("follows").select("follower_id")).in(
        "follower_id",
        profileIds
      ),
      currentUserId
        ? asQuery(supabase.from("follows").select("following_id"))
            .eq("follower_id", currentUserId)
            .in("following_id", profileIds)
        : Promise.resolve({ data: [], error: null })
    ]);

  const outfitCounts = countBy((outfits ?? []) as { user_id: string }[], "user_id");
  const followerCounts = countBy(
    (followers ?? []) as { following_id: string }[],
    "following_id"
  );
  const followingCounts = countBy(
    (following ?? []) as { follower_id: string }[],
    "follower_id"
  );
  const followingMine = new Set(
    ((mine ?? []) as { following_id: string }[]).map((row) => row.following_id)
  );

  return profiles.map((profile) => ({
    ...profile,
    outfit_count: outfitCounts.get(profile.id) ?? 0,
    follower_count: followerCounts.get(profile.id) ?? 0,
    following_count: followingCounts.get(profile.id) ?? 0,
    is_following: followingMine.has(profile.id)
  }));
}

import type {
  OutfitItemView,
  OutfitLibraryItem,
  SavedOutfit
} from "@/lib/outfits/schema";
import type { WardrobeItem } from "@/lib/wardrobe/schema";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => unknown;
  };
};

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function asQuery(value: unknown) {
  return value as QueryBuilder;
}

export async function attachItemsToOutfits(
  supabase: SupabaseLike,
  outfits: SavedOutfit[]
): Promise<OutfitLibraryItem[]> {
  if (!outfits.length) {
    return [];
  }

  const outfitIds = outfits.map((outfit) => outfit.id);
  const { data: joinRows } = await asQuery(
    supabase
      .from("outfit_items")
      .select("outfit_id, wardrobe_item_id, position")
  )
    .in("outfit_id", outfitIds)
    .order("position", { ascending: true });

  const rows = (joinRows ?? []) as {
    outfit_id: string;
    wardrobe_item_id: string;
    position: number;
  }[];
  const wardrobeIds = Array.from(new Set(rows.map((row) => row.wardrobe_item_id)));

  if (!wardrobeIds.length) {
    return outfits.map((outfit) => ({ ...outfit, items: [] }));
  }

  const { data: wardrobeItems } = await asQuery(
    supabase.from("wardrobe_items").select("*")
  ).in("id", wardrobeIds);

  const itemById = new Map(
    ((wardrobeItems ?? []) as WardrobeItem[]).map((item) => [item.id, item])
  );

  return outfits.map((outfit) => ({
    ...outfit,
    items: rows
      .filter((row) => row.outfit_id === outfit.id)
      .sort((a, b) => a.position - b.position)
      .map((row) => {
        const item = itemById.get(row.wardrobe_item_id);
        return item ? ({ ...item, position: row.position } as OutfitItemView) : null;
      })
      .filter((item): item is OutfitItemView => Boolean(item))
  }));
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

  const { data: outfits } = await asQuery(supabase.from("outfits").select("*")).in(
    "id",
    outfitIds
  );
  const order = new Map(outfitIds.map((id, index) => [id, index]));

  return ((outfits ?? []) as SavedOutfit[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

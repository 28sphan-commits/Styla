import { NextResponse } from "next/server";
import { z } from "zod";
import { outfitInputSchema } from "@/lib/outfits/schema";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

const saveOutfitSchema = outfitInputSchema.extend({
  title: z.string().min(2).max(40),
  description: z.string().min(20).max(1000),
  itemIds: z.array(z.string().uuid()).min(1).max(6)
});

export async function POST(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = saveOutfitSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Could not save this outfit." },
      { status: 400 }
    );
  }

  // Censor mild language in the user-authored title/description; severe blocks + strikes.
  const moderation = await enforceModeration(supabase, [
    { value: parsed.data.title },
    { value: parsed.data.description }
  ]);
  if (!moderation.ok) {
    return NextResponse.json(
      { error: moderation.error, banned: moderation.banned },
      { status: moderation.status }
    );
  }
  const [cleanTitle, cleanDescription] = moderation.values;

  const { data: ownedItems, error: ownedItemsError } = await supabase
    .from("wardrobe_items")
    .select("id")
    .eq("user_id", user.id)
    .in("id", parsed.data.itemIds);

  if (ownedItemsError) {
    return NextResponse.json({ error: ownedItemsError.message }, { status: 500 });
  }

  if ((ownedItems ?? []).length !== parsed.data.itemIds.length) {
    return NextResponse.json(
      { error: "This outfit includes an item outside your wardrobe." },
      { status: 403 }
    );
  }

  const { data: outfit, error: outfitError } = await supabase
    .from("outfits")
    .insert({
      user_id: user.id,
      occasion: parsed.data.occasion,
      mood: parsed.data.mood,
      weather: parsed.data.weather,
      title: cleanTitle,
      description: cleanDescription,
      piece_count: parsed.data.itemIds.length
    })
    .select("*")
    .single();

  if (outfitError) {
    return NextResponse.json({ error: outfitError.message }, { status: 500 });
  }

  const { error: itemsError } = await supabase.from("outfit_items").insert(
    parsed.data.itemIds.map((itemId, index) => ({
      outfit_id: outfit.id,
      wardrobe_item_id: itemId,
      position: index
    }))
  );

  if (itemsError) {
    await supabase.from("outfits").delete().eq("id", outfit.id).eq("user_id", user.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ outfit });
}

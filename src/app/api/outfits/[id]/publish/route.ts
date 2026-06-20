import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

const publishSchema = z.object({
  title: z.string().min(2).max(40),
  description: z.string().max(1000).default(""),
  allowSaves: z.boolean().default(true),
  visibility: z.enum(["public", "friends"]).default("public")
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;

  const parsed = publishSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }

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

  const { data: outfit, error } = await supabase
    .from("outfits")
    .update({
      is_public: true,
      title: cleanTitle,
      description: cleanDescription,
      allow_saves: parsed.data.allowSaves,
      visibility: parsed.data.visibility,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("share_slug")
    .single();

  if (error || !outfit) {
    return NextResponse.json(
      { error: error?.message ?? "Outfit not found." },
      { status: 404 }
    );
  }

  const origin = new URL(request.url).origin;
  return NextResponse.json({ shareUrl: `${origin}/outfits/${outfit.share_slug}` });
}

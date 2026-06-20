import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

const postSchema = z.object({
  outfitId: z.string().uuid(),
  body: z.string().min(1).max(500)
});

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const outfitId = searchParams.get("outfitId");
  if (!outfitId) return NextResponse.json({ error: "outfitId required." }, { status: 400 });

  const { data, error } = await supabase
    .from("comments")
    .select("id, body, created_at, user_id, profiles(username, avatar_url)")
    .eq("outfit_id", outfitId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid data." }, { status: 400 });

  const moderation = await enforceModeration(supabase, [{ value: parsed.data.body }]);
  if (!moderation.ok) {
    return NextResponse.json(
      { error: moderation.error, banned: moderation.banned },
      { status: moderation.status }
    );
  }
  const [cleanBody] = moderation.values;

  const { data: comment, error } = await supabase
    .from("comments")
    .insert({ outfit_id: parsed.data.outfitId, user_id: user.id, body: cleanBody })
    .select("id, body, created_at, user_id, profiles(username, avatar_url)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment });
}

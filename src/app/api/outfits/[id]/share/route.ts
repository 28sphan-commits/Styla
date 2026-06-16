import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const { data: outfit, error } = await supabase
    .from("outfits")
    .update({
      is_public: true,
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

  return NextResponse.json({
    shareUrl: `${origin}/outfits/${outfit.share_slug}`
  });
}

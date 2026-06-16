import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const socialOutfitSchema = z.object({
  outfitId: z.string().uuid()
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

  const parsed = socialOutfitSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid outfit." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("likes")
    .select("outfit_id")
    .eq("user_id", user.id)
    .eq("outfit_id", parsed.data.outfitId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("user_id", user.id)
      .eq("outfit_id", parsed.data.outfitId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ active: false });
  }

  const { error } = await supabase.from("likes").insert({
    user_id: user.id,
    outfit_id: parsed.data.outfitId
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ active: true });
}

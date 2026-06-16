import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const startConversationSchema = z.object({
  profileId: z.string().uuid()
});

function orderedMembers(userId: string, profileId: string) {
  return [userId, profileId].sort() as [string, string];
}

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

  const parsed = startConversationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile." }, { status: 400 });
  }

  if (parsed.data.profileId === user.id) {
    return NextResponse.json(
      { error: "You cannot message yourself." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, is_public")
    .eq("id", parsed.data.profileId)
    .eq("is_public", true)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "This profile is not available for messaging." },
      { status: 404 }
    );
  }

  const [memberLow, memberHigh] = orderedMembers(user.id, parsed.data.profileId);
  const { data: conversation, error } = await supabase
    .from("dm_conversations")
    .upsert(
      {
        member_low: memberLow,
        member_high: memberHigh,
        updated_at: new Date().toISOString()
      },
      { onConflict: "member_low,member_high" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversationId: conversation.id });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid(),
    body: z.string().trim().max(1200).default(""),
    outfitId: z.string().uuid().nullable().optional()
  })
  .refine((value) => value.body.length > 0 || Boolean(value.outfitId), {
    message: "Write a message or choose an outfit."
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

  const parsed = sendMessageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Could not send message." },
      { status: 400 }
    );
  }

  const { data: conversation } = await supabase
    .from("dm_conversations")
    .select("id, member_low, member_high")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  }

  if (conversation.member_low !== user.id && conversation.member_high !== user.id) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  if (parsed.data.outfitId) {
    const { data: outfit } = await supabase
      .from("outfits")
      .select("id, user_id, is_public")
      .eq("id", parsed.data.outfitId)
      .maybeSingle();

    if (!outfit || (outfit.user_id !== user.id && !outfit.is_public)) {
      return NextResponse.json(
        { error: "This outfit cannot be shared." },
        { status: 403 }
      );
    }
  }

  const now = new Date().toISOString();
  const { data: message, error } = await supabase
    .from("dm_messages")
    .insert({
      conversation_id: parsed.data.conversationId,
      sender_id: user.id,
      body: parsed.data.body,
      outfit_id: parsed.data.outfitId ?? null
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("dm_conversations")
    .update({
      last_message_at: now,
      updated_at: now
    })
    .eq("id", parsed.data.conversationId);

  return NextResponse.json({ message });
}

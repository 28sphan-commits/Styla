import { NextResponse } from "next/server";
import { loadDmThread } from "@/lib/messages/loaders";
import { createClient } from "@/lib/supabase/server";

type ThreadRouteProps = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(_request: Request, { params }: ThreadRouteProps) {
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

  const { conversationId } = await params;
  const thread = await loadDmThread(supabase, user.id, conversationId);

  if (!thread.conversation) {
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    conversation: thread.conversation,
    messages: thread.messages
  });
}

import { redirect } from "next/navigation";
import { MessageCenter } from "@/components/messages/message-center";
import {
  loadDmConversations,
  loadDmThread,
  loadShareableDmOutfits
} from "@/lib/messages/loaders";
import { createClient } from "@/lib/supabase/server";

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: ConversationPageProps) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!styleDna) {
    redirect("/onboarding");
  }

  const { conversationId } = await params;
  const [conversations, thread, shareableOutfits] = await Promise.all([
    loadDmConversations(supabase, user.id),
    loadDmThread(supabase, user.id, conversationId),
    loadShareableDmOutfits(supabase, user.id)
  ]);

  if (!thread.conversation) {
    redirect("/messages");
  }

  return (
    <MessageCenter
      currentUserId={user.id}
      conversations={conversations}
      selectedConversation={thread.conversation}
      initialMessages={thread.messages}
      shareableOutfits={shareableOutfits}
    />
  );
}

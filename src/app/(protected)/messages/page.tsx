import { redirect } from "next/navigation";
import { MessageCenter } from "@/components/messages/message-center";
import {
  loadDmConversations,
  loadDmThread,
  loadShareableDmOutfits
} from "@/lib/messages/loaders";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage() {
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

  const [conversations, shareableOutfits] = await Promise.all([
    loadDmConversations(supabase, user.id),
    loadShareableDmOutfits(supabase, user.id)
  ]);
  const selectedId = conversations[0]?.id ?? null;
  const thread = await loadDmThread(supabase, user.id, selectedId);

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

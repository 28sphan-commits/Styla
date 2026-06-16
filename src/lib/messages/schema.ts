import type { OutfitLibraryItem } from "@/lib/outfits/schema";

export type MessageProfile = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type DmConversation = {
  id: string;
  member_low: string;
  member_high: string;
  last_message_at: string;
  created_at: string;
};

export type DmConversationPreview = DmConversation & {
  otherProfile: MessageProfile | null;
  lastMessage: DmMessage | null;
};

export type DmMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  outfit_id: string | null;
  created_at: string;
  outfit?: OutfitLibraryItem | null;
};

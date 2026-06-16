import {
  attachItemsToOutfits,
  loadBookmarkedOutfits
} from "@/lib/outfits/loaders";
import type { OutfitLibraryItem, SavedOutfit } from "@/lib/outfits/schema";
import type {
  DmConversation,
  DmConversationPreview,
  DmMessage,
  MessageProfile
} from "@/lib/messages/schema";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => unknown;
  };
};

type QueryBuilder = {
  eq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function asQuery(value: unknown) {
  return value as QueryBuilder;
}

export async function loadDmConversations(
  supabase: SupabaseLike,
  userId: string
): Promise<DmConversationPreview[]> {
  const { data: conversations } = await asQuery(
    supabase.from("dm_conversations").select("*")
  )
    .or(`member_low.eq.${userId},member_high.eq.${userId}`)
    .order("last_message_at", { ascending: false });

  const rows = (conversations ?? []) as DmConversation[];
  if (!rows.length) return [];

  const otherIds = rows.map((conversation) =>
    conversation.member_low === userId ? conversation.member_high : conversation.member_low
  );
  const conversationIds = rows.map((conversation) => conversation.id);

  const [{ data: profiles }, { data: messages }] = await Promise.all([
    asQuery(
      supabase.from("profiles").select("id, username, full_name, avatar_url")
    ).in("id", otherIds),
    asQuery(supabase.from("dm_messages").select("*"))
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(120)
  ]);

  const profileById = new Map(
    ((profiles ?? []) as MessageProfile[]).map((profile) => [profile.id, profile])
  );
  const lastMessageByConversation = new Map<string, DmMessage>();
  ((messages ?? []) as DmMessage[]).forEach((message) => {
    if (!lastMessageByConversation.has(message.conversation_id)) {
      lastMessageByConversation.set(message.conversation_id, message);
    }
  });

  return rows.map((conversation) => {
    const otherId =
      conversation.member_low === userId ? conversation.member_high : conversation.member_low;

    return {
      ...conversation,
      otherProfile: profileById.get(otherId) ?? null,
      lastMessage: lastMessageByConversation.get(conversation.id) ?? null
    };
  });
}

export async function loadDmThread(
  supabase: SupabaseLike,
  userId: string,
  conversationId: string | null
): Promise<{
  conversation: DmConversationPreview | null;
  messages: DmMessage[];
}> {
  if (!conversationId) {
    return { conversation: null, messages: [] };
  }

  const { data: conversation } = await asQuery(
    supabase.from("dm_conversations").select("*")
  )
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) {
    return { conversation: null, messages: [] };
  }

  const typedConversation = conversation as DmConversation;
  const otherId =
    typedConversation.member_low === userId
      ? typedConversation.member_high
      : typedConversation.member_low;

  const [{ data: profile }, { data: messageRows }] = await Promise.all([
    asQuery(
      supabase.from("profiles").select("id, username, full_name, avatar_url")
    )
      .eq("id", otherId)
      .maybeSingle(),
    asQuery(supabase.from("dm_messages").select("*"))
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
  ]);

  const messages = await attachOutfitsToMessages(
    supabase,
    (messageRows ?? []) as DmMessage[]
  );

  return {
    conversation: {
      ...typedConversation,
      otherProfile: (profile as MessageProfile | null) ?? null,
      lastMessage: messages[messages.length - 1] ?? null
    },
    messages
  };
}

export async function loadShareableDmOutfits(
  supabase: SupabaseLike,
  userId: string
): Promise<OutfitLibraryItem[]> {
  const { data: mineRows } = await asQuery(
    supabase.from("outfits").select("*")
  )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  const bookmarkedRows = await loadBookmarkedOutfits(supabase, userId);
  const mine = await attachItemsToOutfits(supabase, (mineRows ?? []) as SavedOutfit[]);
  const saved = await attachItemsToOutfits(supabase, bookmarkedRows.slice(0, 12));

  const byId = new Map<string, OutfitLibraryItem>();
  [...mine, ...saved].forEach((outfit) => byId.set(outfit.id, outfit));
  return Array.from(byId.values()).slice(0, 18);
}

async function attachOutfitsToMessages(
  supabase: SupabaseLike,
  messages: DmMessage[]
): Promise<DmMessage[]> {
  const outfitIds = Array.from(
    new Set(messages.map((message) => message.outfit_id).filter(Boolean))
  ) as string[];

  if (!outfitIds.length) return messages;

  const { data: outfitRows } = await asQuery(
    supabase.from("outfits").select("*")
  ).in("id", outfitIds);
  const outfits = await attachItemsToOutfits(
    supabase,
    (outfitRows ?? []) as SavedOutfit[]
  );
  const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]));

  return messages.map((message) => ({
    ...message,
    outfit: message.outfit_id ? outfitById.get(message.outfit_id) ?? null : null
  }));
}

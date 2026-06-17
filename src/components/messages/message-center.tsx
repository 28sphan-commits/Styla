"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, Shirt } from "lucide-react";
import type {
  DmConversationPreview,
  DmMessage
} from "@/lib/messages/schema";
import type { OutfitLibraryItem } from "@/lib/outfits/schema";

type MessageCenterProps = {
  currentUserId: string;
  conversations: DmConversationPreview[];
  selectedConversation: DmConversationPreview | null;
  initialMessages: DmMessage[];
  shareableOutfits: OutfitLibraryItem[];
};

export function MessageCenter({
  currentUserId,
  conversations,
  selectedConversation,
  initialMessages,
  shareableOutfits
}: MessageCenterProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [outfitId, setOutfitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const outfitById = useMemo(
    () => new Map(shareableOutfits.map((outfit) => [outfit.id, outfit])),
    [shareableOutfits]
  );

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, selectedConversation?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation) return;

    let isActive = true;
    const conversationId = selectedConversation.id;

    async function refreshThread() {
      try {
        const response = await fetch(`/api/messages/${conversationId}`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok || !isActive) return;

        const nextMessages = payload.messages as DmMessage[];
        setMessages((current) => {
          const currentSignature = current.map((message) => message.id).join(",");
          const nextSignature = nextMessages.map((message) => message.id).join(",");
          return currentSignature === nextSignature ? current : nextMessages;
        });
      } catch {
        // Keep the current thread visible if a background refresh misses once.
      }
    }

    const interval = window.setInterval(() => void refreshThread(), 2200);
    void refreshThread();

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [selectedConversation]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedConversation || isSending) return;

    const trimmed = body.trim();
    if (!trimmed && !outfitId) return;

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          body: trimmed,
          outfitId: outfitId || null
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send message.");
      }

      const nextMessage = payload.message as DmMessage;
      setMessages((current) => [
        ...current,
        {
          ...nextMessage,
          outfit: nextMessage.outfit_id ? outfitById.get(nextMessage.outfit_id) ?? null : null
        }
      ]);
      setBody("");
      setOutfitId("");
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Could not send message."
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="messages-page page-shell">
      <div className="section-kicker">Direct Messages</div>
      <div className="messages-heading">
        <div>
          <h1>Messages</h1>
          <p>Private conversations for outfit ideas, saved looks, and style notes.</p>
        </div>
        <span>{conversations.length} Threads</span>
      </div>

      <div className="rule" />

      <div className="messages-shell">
        <aside className="conversation-list" aria-label="Conversations">
          {conversations.length ? (
            conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/messages/${conversation.id}`}
                className={
                  selectedConversation?.id === conversation.id
                    ? "conversation-row is-active"
                    : "conversation-row"
                }
              >
                {conversation.otherProfile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={conversation.otherProfile.avatar_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>
                    {conversation.otherProfile?.username?.slice(0, 1).toUpperCase() ?? "S"}
                  </span>
                )}
                <div>
                  <strong>
                    @{conversation.otherProfile?.username ?? "styla_user"}
                  </strong>
                  <small>
                    {conversation.lastMessage?.outfit_id
                      ? "Shared an outfit"
                      : conversation.lastMessage?.body || "Start the conversation"}
                  </small>
                </div>
              </Link>
            ))
          ) : (
            <div className="conversation-empty">
              <MessageCircle size={18} aria-hidden="true" />
              <strong>No messages yet</strong>
              <span>Open a public profile and click Message.</span>
            </div>
          )}
        </aside>

        <section className="thread-panel">
          {selectedConversation ? (
            <>
              <header className="thread-header">
                <div className="creator-chip">
                  {selectedConversation.otherProfile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedConversation.otherProfile.avatar_url} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span>
                      {selectedConversation.otherProfile?.username
                        ?.slice(0, 1)
                        .toUpperCase() ?? "S"}
                    </span>
                  )}
                  <div>
                    <strong>
                      @{selectedConversation.otherProfile?.username ?? "styla_user"}
                    </strong>
                    <small>Private DM</small>
                  </div>
                </div>
              </header>

              <div className="thread-messages">
                {messages.length ? (
                  <>
                    {messages.map((message) => (
                      <article
                        key={message.id}
                        className={
                          message.sender_id === currentUserId
                            ? "dm-bubble is-mine"
                            : "dm-bubble"
                        }
                      >
                        {message.body ? <p>{message.body}</p> : null}
                        {message.outfit ? <MessageOutfitCard outfit={message.outfit} /> : null}
                        <time dateTime={message.created_at}>
                          {new Intl.DateTimeFormat("en", {
                            hour: "numeric",
                            minute: "2-digit"
                          }).format(new Date(message.created_at))}
                        </time>
                      </article>
                    ))}
                    <div ref={bottomRef} />
                  </>
                ) : (
                  <div className="thread-empty">
                    <MessageCircle size={20} aria-hidden="true" />
                    <strong>Start with a fit check-in</strong>
                    <span>Send a note or share one of your saved outfits.</span>
                  </div>
                )}
              </div>

              {error ? <p className="inline-error">{error}</p> : null}

              <form className="dm-composer" onSubmit={sendMessage}>
                <label className="outfit-attach">
                  <ImagePlus size={15} aria-hidden="true" />
                  <select
                    value={outfitId}
                    onChange={(event) => setOutfitId(event.target.value)}
                  >
                    <option value="">Attach outfit</option>
                    {shareableOutfits.map((outfit) => (
                      <option key={outfit.id} value={outfit.id}>
                        {outfit.title}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  rows={2}
                  value={body}
                  placeholder="Write a message..."
                  onChange={(event) => setBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button type="submit" disabled={isSending || (!body.trim() && !outfitId)}>
                  <Send size={15} aria-hidden="true" />
                </button>
              </form>
            </>
          ) : (
            <div className="thread-placeholder">
              <MessageCircle size={24} aria-hidden="true" />
              <strong>Select a conversation</strong>
              <span>Messages with other Styla users will appear here.</span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function MessageOutfitCard({ outfit }: { outfit: OutfitLibraryItem }) {
  return (
    <Link className="message-outfit-card" href={`/outfits/${outfit.share_slug}`}>
      <div>
        {outfit.items.slice(0, 3).map((item) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={item.id} src={item.image_url} alt={item.name} />
        ))}
        {!outfit.items.length ? <Shirt size={18} aria-hidden="true" /> : null}
      </div>
      <strong>{outfit.title}</strong>
      <span>View shared look</span>
    </Link>
  );
}

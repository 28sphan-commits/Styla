"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import type { ChatMessage } from "@/lib/chat/schema";

const starterPrompts = [
  "What should I wear today?",
  "Most versatile pieces in my wardrobe?",
  "Help me build a capsule wardrobe",
  "An outfit for a dinner date"
];

function renderInlineMarkdown(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function renderMessageContent(content: string) {
  return content.split("\n").map((line, index) => {
    const cleanedLine = line.replace(/^\s*\*\s+/, "").trimEnd();

    return (
      <span key={`${cleanedLine}-${index}`} className="message-line">
        {renderInlineMarkdown(cleanedLine)}
      </span>
    );
  });
}

// Sessions are grouped by calendar day (client timezone). No DB session column —
// the day boundary is the "session".
function dayKey(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

type DayGroup = { key: string; label: string; messages: ChatMessage[] };

function groupByDay(messages: ChatMessage[]): DayGroup[] {
  const groups: DayGroup[] = [];

  for (const message of messages) {
    const key = dayKey(message.created_at);
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      last.messages.push(message);
    } else {
      groups.push({ key, label: dayLabel(message.created_at), messages: [message] });
    }
  }

  return groups;
}

export function StylaChatWidget() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshStart, setFreshStart] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Lazy-load chat history the first time the drawer is opened.
  useEffect(() => {
    if (!open || loaded) return;

    let active = true;
    setLoading(true);

    fetch("/api/ai/chat", { method: "GET" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (Array.isArray(payload.messages)) {
          setMessages(payload.messages as ChatMessage[]);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (active) setError("Could not load your chat history.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, loaded]);

  useEffect(() => {
    if (open && !freshStart) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages.length, open, freshStart]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    setDraft("");
    setFreshStart(false);

    const optimisticMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      user_id: "local",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticMessage]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });
      const payload = await response
        .json()
        .catch(() => ({ error: "The chat server returned an unreadable response." }));

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send this message.");
      }

      const savedMessages = payload.messages as ChatMessage[];
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticMessage.id),
        ...savedMessages
      ]);
    } catch (sendError) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimisticMessage.id)
      );
      setDraft(trimmed);
      setError(
        sendError instanceof Error ? sendError.message : "Could not send this message."
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  function startNewChat() {
    setFreshStart(true);
    setDraft("");
    setError(null);
    textareaRef.current?.focus();
  }

  const groups = groupByDay(messages);
  const showStarters = freshStart || (!loading && messages.length === 0);

  return (
    <>
      <button
        type="button"
        className={open ? "styla-fab is-open" : "styla-fab"}
        aria-label={open ? "Close Styla stylist" : "Open Styla stylist"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={22} aria-hidden="true" /> : <span className="styla-fab-mark">S</span>}
      </button>

      {open ? (
        <section className="styla-drawer" role="dialog" aria-label="Styla stylist chat">
          <header className="styla-drawer-head">
            <div className="styla-drawer-id">
              <span className="styla-drawer-mark">S</span>
              <div>
                <strong>Styla</strong>
                <small>AI Fashion Stylist</small>
              </div>
            </div>
            <div className="styla-drawer-actions">
              <button type="button" onClick={startNewChat} aria-label="Start a new chat">
                <Plus size={15} aria-hidden="true" />
                New
              </button>
              <button
                type="button"
                className="styla-drawer-close"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="styla-drawer-body">
            {loading ? (
              <div className="styla-drawer-loading">
                <Loader2 size={18} className="spin" aria-hidden="true" />
                Loading your chats…
              </div>
            ) : showStarters ? (
              <div className="starter-panel">
                <Sparkles size={18} aria-hidden="true" />
                <strong>Ask Styla anything</strong>
                <div>
                  {starterPrompts.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => void sendMessage(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
                {freshStart && messages.length > 0 ? (
                  <button
                    type="button"
                    className="styla-history-link"
                    onClick={() => setFreshStart(false)}
                  >
                    View past chats
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                {groups.map((group) => (
                  <div className="styla-day-group" key={group.key}>
                    <div className="styla-day-divider">
                      <span>{group.label}</span>
                    </div>
                    {group.messages.map((message) => (
                      <article
                        key={message.id}
                        className={
                          message.role === "user" ? "message is-user" : "message is-assistant"
                        }
                      >
                        <p>{renderMessageContent(message.content)}</p>
                      </article>
                    ))}
                  </div>
                ))}
                {sending ? (
                  <article className="message is-assistant">
                    <p className="typing-line">
                      <Loader2 size={13} className="spin" aria-hidden="true" />
                      Thinking through your wardrobe…
                    </p>
                  </article>
                ) : null}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {error ? <p className="styla-drawer-error">{error}</p> : null}

          <form className="styla-drawer-composer" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={1}
              placeholder="Ask Styla anything…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Send message">
              {sending ? (
                <Loader2 size={16} className="spin" aria-hidden="true" />
              ) : (
                <ArrowUp size={16} aria-hidden="true" />
              )}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

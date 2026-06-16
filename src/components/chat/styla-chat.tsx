"use client";

import { FormEvent, KeyboardEvent, useRef, useState } from "react";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/chat/schema";

type StylaChatProps = {
  initialMessages: ChatMessage[];
};

const starterPrompts = [
  "What should I wear today?",
  "Which pieces in my wardrobe are most versatile?",
  "Help me build a capsule wardrobe",
  "Suggest an outfit for a dinner date"
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

export function StylaChat({ initialMessages }: StylaChatProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setError(null);
    setDraft("");

    const optimisticUserMessage: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      user_id: "local",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticUserMessage]);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: trimmed })
      });
      const payload = await response.json().catch(() => ({
        error: "The chat server returned an unreadable response."
      }));

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send this message.");
      }

      const savedMessages = payload.messages as ChatMessage[];
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticUserMessage.id),
        ...savedMessages
      ]);
    } catch (sendError) {
      setMessages((current) =>
        current.filter((item) => item.id !== optimisticUserMessage.id)
      );
      setDraft(trimmed);
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Could not send this message."
      );
    } finally {
      setIsSending(false);
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

  return (
    <section className="chat-page page-shell">
      <div className="section-kicker">The Conversation</div>
      <div className="chat-heading">
        <div>
          <h1>Chat with Styla</h1>
          <p>
            Your AI fashion advisor. Ask about outfits, your wardrobe, or what
            to wear today.
          </p>
        </div>
        <span>Live Context</span>
      </div>

      <div className="rule" />

      <div className="chat-panel">
        {messages.length ? (
          <div className="message-list" aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={
                  message.role === "user" ? "message is-user" : "message is-assistant"
                }
              >
                <p>{renderMessageContent(message.content)}</p>
              </article>
            ))}
            {isSending ? (
              <article className="message is-assistant">
                <p className="typing-line">
                  <Loader2 size={13} className="spin" aria-hidden="true" />
                  Thinking through your wardrobe...
                </p>
              </article>
            ) : null}
          </div>
        ) : (
          <div className="starter-panel">
            <Sparkles size={18} aria-hidden="true" />
            <strong>Ask Styla anything</strong>
            <div>
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          value={draft}
          rows={2}
          placeholder="Ask Styla anything..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" disabled={isSending || !draft.trim()}>
          {isSending ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <ArrowUp size={16} aria-hidden="true" />
          )}
        </button>
        <span>Enter to send. Shift+Enter for newline.</span>
      </form>
    </section>
  );
}

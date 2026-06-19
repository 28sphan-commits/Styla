"use client";

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Loader2, Save, Sparkles, Wand2 } from "lucide-react";
import {
  moodLabels,
  occasionLabels,
  outfitMoods,
  outfitOccasions,
  outfitWeather,
  weatherLabels,
  type GenerateChatMessage,
  type GeneratedLookWithItems,
  type OutfitInput
} from "@/lib/outfits/schema";
import { titleCase, type WardrobeItem } from "@/lib/wardrobe/schema";

type OutfitGeneratorProps = {
  wardrobeItems: WardrobeItem[];
};

const defaultContext: OutfitInput = {
  occasion: "casual",
  mood: "confident",
  weather: "mild"
};

const occasionKeywords = [
  ...outfitOccasions,
  ...Object.values(occasionLabels).map((label) => label.toLowerCase())
];

export function OutfitGenerator({ wardrobeItems }: OutfitGeneratorProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<GenerateChatMessage[]>([]);
  const [looks, setLooks] = useState<GeneratedLookWithItems[]>([]);
  const [context, setContext] = useState<OutfitInput>(defaultContext);
  const [isReplying, setIsReplying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const canGenerate = wardrobeItems.length > 0;
  const busy = isReplying || isGenerating;

  const itemCountLabel = useMemo(
    () => `${wardrobeItems.length} ${wardrobeItems.length === 1 ? "piece" : "pieces"}`,
    [wardrobeItems.length]
  );

  const baselineText = `${draft} ${messages.map((message) => message.content).join(" ")}`.toLowerCase();
  const hasOccasionKeyword = occasionKeywords.some((keyword) => baselineText.includes(keyword));
  const hasContent = draft.trim().length > 0 || messages.length > 0;
  const hasBaseline =
    hasContent &&
    (hasOccasionKeyword ||
      draft.trim().length >= 6 ||
      messages.some((message) => message.role === "user"));

  // The pills are shortcuts only: they inject category-scoped tags into the
  // prompt (e.g. #Weather:Hot) so the context stays unambiguous for the stylist.
  function appendTag(category: string, value: string) {
    const tag = `#${category}:${value.replace(/\s+/g, "")}`;
    setDraft((current) => {
      const base = current.trimEnd();
      return `${base ? `${base} ` : ""}${tag} `;
    });
    promptRef.current?.focus();
  }

  async function sendChat() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;

    const nextMessages: GenerateChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setDraft("");
    setIsReplying(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, mode: "chat" })
      });
      const payload = await response
        .json()
        .catch(() => ({ error: "The stylist returned an unreadable response." }));

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not reach the stylist.");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: String(payload.reply ?? "") }
      ]);
    } catch (chatError) {
      setMessages((current) => current.slice(0, -1));
      setDraft(trimmed);
      setError(chatError instanceof Error ? chatError.message : "Could not reach the stylist.");
    } finally {
      setIsReplying(false);
      promptRef.current?.focus();
    }
  }

  async function runGenerate(fillGaps: boolean) {
    if (!canGenerate || busy) return;

    const trimmed = draft.trim();
    const conversation: GenerateChatMessage[] = trimmed
      ? [...messages, { role: "user", content: trimmed }]
      : messages;

    if (!conversation.length) return;

    if (trimmed) {
      setMessages(conversation);
      setDraft("");
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation, mode: "generate", fillGaps })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate outfits.");
      }

      setLooks(payload.looks);
      if (payload.context) {
        setContext(payload.context as OutfitInput);
      }
      setSavedIds(new Set());
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Could not generate outfits."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveLook(look: GeneratedLookWithItems, index: number) {
    setError(null);
    const response = await fetch("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...context,
        title: look.title,
        description: look.description,
        itemIds: look.items.map((item) => item.id)
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Could not save this outfit.");
      return;
    }

    setSavedIds((current) => new Set([...current, index]));
  }

  function handlePromptSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendChat();
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendChat();
    }
  }

  return (
    <section className="generate-page page-shell">
      <div className="section-kicker">Create</div>
      <div className="generate-heading">
        <div>
          <h1>Generate Outfit</h1>
          <p>
            Describe what you need or chat it out with Styla, then generate three
            wearable looks from your wardrobe, Style DNA, and saved outfits.
          </p>
        </div>
        <span>{itemCountLabel}</span>
      </div>

      <div className="rule" />

      <div className="generate-tags">
        <p className="generate-tags-hint">
          Shortcuts — tap to drop a scoped tag (e.g. <code>#Weather:Hot</code>) into your
          prompt below. They just pre-fill the chat; nothing is locked in.
        </p>
        <div className="generator-panel">
          <TagRow label="Occasion" options={outfitOccasions} labels={occasionLabels} onPick={appendTag} />
          <TagRow label="Mood" options={outfitMoods} labels={moodLabels} onPick={appendTag} />
          <TagRow label="Weather" options={outfitWeather} labels={weatherLabels} onPick={appendTag} />
        </div>
      </div>

      <form className="generate-prompt-bar" onSubmit={handlePromptSubmit}>
        <textarea
          ref={promptRef}
          value={draft}
          rows={2}
          placeholder="Describe your outfit… e.g. #Occasion:Date dinner, warm earth tones, light layers"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handlePromptKeyDown}
        />
        <button
          type="submit"
          className="generate-prompt-send"
          disabled={!draft.trim() || busy}
          aria-label="Send to stylist"
        >
          {isReplying ? (
            <Loader2 size={16} className="spin" aria-hidden="true" />
          ) : (
            <ArrowUp size={16} aria-hidden="true" />
          )}
        </button>
      </form>

      {messages.length ? (
        <div className="generate-chat" aria-live="polite">
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={message.role === "user" ? "message is-user" : "message is-assistant"}
            >
              <p>{message.content}</p>
            </article>
          ))}
          {isReplying ? (
            <article className="message is-assistant">
              <p className="typing-line">
                <Loader2 size={13} className="spin" aria-hidden="true" />
                Styla is thinking…
              </p>
            </article>
          ) : null}
        </div>
      ) : null}

      <div className="generate-actions">
        <button
          className="generate-action"
          type="button"
          disabled={!canGenerate || busy || !hasContent}
          onClick={() => void runGenerate(false)}
        >
          {isGenerating ? (
            <Loader2 size={15} className="spin" aria-hidden="true" />
          ) : (
            <Sparkles size={15} aria-hidden="true" />
          )}
          {isGenerating ? "Generating…" : looks.length ? "Regenerate" : "Generate Outfits"}
        </button>
        <button
          className="generate-skip"
          type="button"
          disabled={!canGenerate || busy || !hasBaseline}
          onClick={() => void runGenerate(true)}
          title="Generate now and let Styla fill in the missing details"
        >
          <Wand2 size={14} aria-hidden="true" />
          Skip Chat &amp; Generate
        </button>
      </div>

      {!canGenerate ? (
        <p className="inline-error">Add at least one item to your wardrobe first.</p>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}

      {looks.length ? (
        <div className="looks-grid">
          {looks.map((look, index) => (
            <article className="look-card" key={`${look.title}-${index}`}>
              <div className="look-card-header">
                <h2>{look.title || `Look 0${index + 1}`}</h2>
                <span>
                  {look.items.length} {look.items.length === 1 ? "piece" : "pieces"}
                </span>
              </div>

              <div className="look-items">
                {look.items.map((item) => (
                  <figure key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name} />
                    <figcaption>{item.name}</figcaption>
                  </figure>
                ))}
              </div>

              <p>{look.description}</p>

              <div className="look-tags">
                <span>{occasionLabels[context.occasion]}</span>
                <span>{moodLabels[context.mood]}</span>
                <span>{weatherLabels[context.weather]}</span>
                {look.items.slice(0, 2).map((item) => (
                  <span key={`${look.title}-${item.id}`}>{titleCase(item.type[0])}</span>
                ))}
              </div>

              <button
                className="save-look"
                type="button"
                disabled={savedIds.has(index)}
                onClick={() => void saveLook(look, index)}
              >
                {savedIds.has(index) ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Save size={13} aria-hidden="true" />
                )}
                {savedIds.has(index) ? "Saved" : "Save Outfit"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TagRow<T extends string>({
  label,
  options,
  labels,
  onPick
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  onPick: (category: string, value: string) => void;
}) {
  return (
    <div className="generator-choice-row">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className="filter-chip"
            onClick={() => onPick(label, labels[option])}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

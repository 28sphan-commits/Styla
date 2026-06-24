"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Heart, MessageCircle, Send, X } from "lucide-react";
import { FollowButton } from "@/components/social/follow-button";
import { moodLabels, occasionLabels, weatherLabels } from "@/lib/outfits/schema";
import type { PublicOutfit } from "@/lib/social/schema";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { username: string | null; avatar_url: string | null } | null;
};

type CommentDrawerProps = {
  outfit: PublicOutfit;
  onClose: () => void;
  onCountChange: (outfitId: string, delta: number) => void;
};

// Head-to-toe order for the item rail: hat first (top), shoes last (bottom).
const TYPE_ORDER: Record<string, number> = {
  hat: 0,
  jewelry: 1,
  accessory: 2,
  bag: 3,
  top: 4,
  outerwear: 5,
  dress: 6,
  activewear: 7,
  swimwear: 8,
  bottom: 9,
  shoes: 10
};

function bodyOrder(item: { type?: string[] }): number {
  return TYPE_ORDER[item.type?.[0] ?? ""] ?? 99;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function CommentDrawer({ outfit, onClose, onCountChange }: CommentDrawerProps) {
  const orderedItems = [...outfit.items].sort((a, b) => bodyOrder(a) - bodyOrder(b));
  const [activeIndex, setActiveIndex] = useState(0);

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [liked, setLiked] = useState(outfit.is_liked);
  const [likeCount, setLikeCount] = useState(outfit.like_count);
  const [saved, setSaved] = useState(outfit.is_bookmarked);
  const [saveCount, setSaveCount] = useState(outfit.save_count);

  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeItem = orderedItems[activeIndex] ?? orderedItems[0];
  const username = outfit.creator?.username ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/social/comments?outfitId=${outfit.id}`)
      .then((r) => r.json())
      .then((d) => setComments((d.comments as CommentRow[]) ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [outfit.id]);

  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length, loading]);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const res = await fetch("/api/social/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id })
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      if (typeof data.active === "boolean" && data.active !== next) {
        setLiked(data.active);
        setLikeCount((c) => Math.max(0, c + (data.active ? 1 : -1)));
      }
    } catch {
      // Revert the optimistic update (e.g. not signed in, network error).
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  }

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    setSaveCount((c) => Math.max(0, c + (next ? 1 : -1)));
    try {
      const res = await fetch("/api/social/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id })
      });
      if (!res.ok) throw new Error("request failed");
      const data = await res.json();
      if (typeof data.active === "boolean" && data.active !== next) {
        setSaved(data.active);
        setSaveCount((c) => Math.max(0, c + (data.active ? 1 : -1)));
      }
    } catch {
      // Revert the optimistic update (e.g. not signed in, network error).
      setSaved(!next);
      setSaveCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId: outfit.id, body: trimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post comment.");
      setComments((c) => [...c, data.comment as CommentRow]);
      onCountChange(outfit.id, 1);
      setBody("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="outfit-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="outfit-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${outfit.title} — details and comments`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="outfit-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} aria-hidden="true" />
        </button>

        {/* Left: stage + vertical head-to-toe item rail */}
        <div className="outfit-modal-media">
          {orderedItems.length > 1 ? (
            <div className="outfit-modal-rail">
              {orderedItems.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`outfit-modal-thumb${index === activeIndex ? " is-active" : ""}`}
                  onClick={() => setActiveIndex(index)}
                  aria-label={item.name}
                  aria-pressed={index === activeIndex}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt={item.name} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="outfit-modal-stage">
            {activeItem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={activeItem.image_url} alt={activeItem.name} />
            ) : null}
          </div>
        </div>

        {/* Right: creator, engagement, tags, description, comments */}
        <div className="outfit-modal-panel">
          <header className="outfit-modal-creator">
            <Link
              href={username ? `/u/${username}` : "#"}
              className="creator-chip"
              onClick={onClose}
            >
              {outfit.creator?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={outfit.creator.avatar_url} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{username?.slice(0, 1).toUpperCase() ?? "S"}</span>
              )}
              <strong>@{username ?? "styla user"}</strong>
            </Link>
            {outfit.creator ? (
              <FollowButton
                profileId={outfit.creator.id}
                initialFollowing={outfit.creator.is_following}
              />
            ) : null}
          </header>

          <div className="outfit-modal-stats">
            <button
              type="button"
              className={`social-icon-button${liked ? " is-active" : ""}`}
              onClick={() => void toggleLike()}
            >
              <Heart size={14} aria-hidden="true" />
              {likeCount}
            </button>
            <button
              type="button"
              className={`social-icon-button${saved ? " is-active" : ""}`}
              onClick={() => void toggleSave()}
            >
              <Bookmark size={14} aria-hidden="true" />
              {saveCount}
            </button>
            <span className="social-icon-button is-static">
              <MessageCircle size={14} aria-hidden="true" />
              {comments.length} {comments.length === 1 ? "comment" : "comments"}
            </span>
          </div>

          <div className="library-card-tags outfit-modal-tags">
            <span>{occasionLabels[outfit.occasion]}</span>
            <span>{moodLabels[outfit.mood]}</span>
            <span>{weatherLabels[outfit.weather]}</span>
          </div>

          {outfit.description ? (
            <p className="outfit-modal-desc">{outfit.description}</p>
          ) : null}

          <div className="outfit-modal-comments">
            <h3>Comments</h3>
            <ul className="comment-list" ref={listRef}>
              {loading && (
                <li className="comment-state">
                  <span className="comment-state-dot" />
                  <span className="comment-state-dot" />
                  <span className="comment-state-dot" />
                </li>
              )}

              {!loading && comments.length === 0 && (
                <li className="comment-empty-state">
                  <MessageCircle size={26} aria-hidden="true" />
                  <strong>No comments yet</strong>
                  <p>Be the first to leave a comment.</p>
                </li>
              )}

              {comments.map((c) => {
                const name = c.profiles?.username ?? "styla user";
                const avatar = c.profiles?.avatar_url;
                return (
                  <li key={c.id} className="comment-item">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatar}
                        alt=""
                        className="comment-avatar-img"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="comment-avatar">{name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <div className="comment-bubble">
                      <div className="comment-bubble-head">
                        <strong>@{name}</strong>
                        <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time>
                      </div>
                      <p>{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <form className="comment-compose" onSubmit={(e) => void submit(e)}>
            {error && <p className="comment-compose-error">{error}</p>}
            <div className="comment-compose-row">
              <textarea
                ref={inputRef}
                className="comment-compose-input"
                value={body}
                maxLength={500}
                rows={1}
                placeholder="Add a comment…"
                onChange={(e) => {
                  setBody(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit(e as unknown as React.FormEvent);
                  }
                }}
              />
              <button
                type="submit"
                className={`comment-compose-btn${body.trim() ? " is-ready" : ""}`}
                disabled={!body.trim() || submitting}
                aria-label="Post comment"
              >
                <Send size={14} aria-hidden="true" />
              </button>
            </div>
            <div className="comment-helper">
              <span>Press Enter to post · Shift+Enter for newline</span>
              <span>{body.length}/500</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

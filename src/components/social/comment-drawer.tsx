"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
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
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="comment-backdrop" onClick={onClose} role="presentation">
      <div
        className="comment-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Comments"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="comment-sheet-handle" aria-hidden="true" />

        {/* Header */}
        <header className="comment-sheet-head">
          <div className="comment-sheet-title">
            <MessageCircle size={15} aria-hidden="true" />
            <h2>Comments</h2>
            {!loading && <span>{comments.length}</span>}
          </div>
          <div className="comment-sheet-subtitle">{outfit.title}</div>
          <button
            type="button"
            className="comment-sheet-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        {/* Scrollable comment list — grows to fill available space */}
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
              <MessageCircle size={28} aria-hidden="true" />
              <strong>No comments yet</strong>
              <p>Be the first to share your thoughts on this look.</p>
            </li>
          )}

          {comments.map((c) => {
            const username = c.profiles?.username ?? "styla user";
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
                  <span className="comment-avatar">
                    {username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="comment-bubble">
                  <div className="comment-bubble-head">
                    <strong>@{username}</strong>
                    <time dateTime={c.created_at}>{timeAgo(c.created_at)}</time>
                  </div>
                  <p>{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Input — always pinned at the bottom, never scrolls away */}
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
                // Auto-grow up to ~3 lines
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
        </form>
      </div>
    </div>
  );
}

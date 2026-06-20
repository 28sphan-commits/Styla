"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Check, Copy, Heart, Shirt, Sparkles } from "lucide-react";
import {
  moodLabels,
  occasionLabels,
  weatherLabels
} from "@/lib/outfits/schema";
import type { PublicOutfit } from "@/lib/social/schema";
import { ClientDate } from "@/components/client-date";

type OutfitFeedProps = {
  outfits: PublicOutfit[];
  emptyTitle?: string;
  emptyText?: string;
  canInteract?: boolean;
};

export function OutfitFeed({
  outfits,
  emptyTitle = "No public outfits yet",
  emptyText = "Shared looks from the community will appear here.",
  canInteract = true
}: OutfitFeedProps) {
  const [items, setItems] = useState(outfits);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function toggleOutfit(outfitId: string, action: "like" | "bookmark") {
    if (!canInteract) return;

    setItems((current) =>
      current.map((outfit) => {
        if (outfit.id !== outfitId) return outfit;
        if (action === "like") {
          const nextLiked = !outfit.is_liked;
          return {
            ...outfit,
            is_liked: nextLiked,
            like_count: outfit.like_count + (nextLiked ? 1 : -1)
          };
        }

        return { ...outfit, is_bookmarked: !outfit.is_bookmarked };
      })
    );

    try {
      const response = await fetch(`/api/social/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfitId })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update outfit.");
      }

      setItems((current) =>
        current.map((outfit) => {
          if (outfit.id !== outfitId) return outfit;
          if (action === "like") {
            const wasLiked = outfit.is_liked;
            return {
              ...outfit,
              is_liked: payload.active,
              like_count: outfit.like_count + (payload.active === wasLiked ? 0 : payload.active ? 1 : -1)
            };
          }

          return { ...outfit, is_bookmarked: payload.active };
        })
      );
    } catch {
      setItems(outfits);
    }
  }

  async function copyShare(outfit: PublicOutfit) {
    const url = `${window.location.origin}/outfits/${outfit.share_slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(outfit.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  if (!items.length) {
    return (
      <div className="empty-wardrobe social-empty">
        <Sparkles size={18} aria-hidden="true" />
        <strong>{emptyTitle}</strong>
        <span>{emptyText}</span>
      </div>
    );
  }

  return (
    <div className="social-feed-grid">
      {items.map((outfit) => (
        <article className="social-outfit-card" key={outfit.id}>
          <div className="social-card-top">
            <Link
              className="creator-chip"
              href={outfit.creator?.username ? `/u/${outfit.creator.username}` : "/explore"}
            >
              {outfit.creator?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={outfit.creator.avatar_url} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span>{outfit.creator?.username?.slice(0, 1).toUpperCase() ?? "S"}</span>
              )}
              <strong>{outfit.creator?.username ?? "Styla user"}</strong>
            </Link>
            <ClientDate value={outfit.created_at} format="date" />
          </div>

          <Link href={`/outfits/${outfit.share_slug}`} className="social-item-mosaic">
            {outfit.items.slice(0, 4).map((item) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.name} key={item.id} />
            ))}
            {!outfit.items.length ? (
              <span>
                <Shirt size={20} aria-hidden="true" />
              </span>
            ) : null}
          </Link>

          <div className="social-card-body">
            <div className="library-card-tags">
              <span>{occasionLabels[outfit.occasion]}</span>
              <span>{moodLabels[outfit.mood]}</span>
              <span>{weatherLabels[outfit.weather]}</span>
            </div>
            <h2>{outfit.title}</h2>
            <p>{outfit.description}</p>
          </div>

          <div className="social-card-actions">
            <button
              type="button"
              className={outfit.is_liked ? "social-icon-button is-active" : "social-icon-button"}
              disabled={!canInteract}
              onClick={() => void toggleOutfit(outfit.id, "like")}
            >
              <Heart size={14} aria-hidden="true" />
              {Math.max(0, outfit.like_count)}
            </button>
            {outfit.allow_saves !== false && (
              <button
                type="button"
                className={outfit.is_bookmarked ? "social-icon-button is-active" : "social-icon-button"}
                disabled={!canInteract}
                onClick={() => void toggleOutfit(outfit.id, "bookmark")}
              >
                <Bookmark size={14} aria-hidden="true" />
                Save
              </button>
            )}
            <button
              type="button"
              className="social-icon-button"
              onClick={() => void copyShare(outfit)}
            >
              {copiedId === outfit.id ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              {copiedId === outfit.id ? "Copied" : "Copy"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

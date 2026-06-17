"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { ClientDate } from "@/components/client-date";
import {
  moodLabels,
  occasionLabels,
  weatherLabels,
  type OutfitLibraryItem
} from "@/lib/outfits/schema";

type OutfitLibraryProps = {
  mine: OutfitLibraryItem[];
  saved: OutfitLibraryItem[];
};

type Tab = "mine" | "saved";

export function OutfitLibrary({ mine, saved }: OutfitLibraryProps) {
  const [activeTab, setActiveTab] = useState<Tab>("mine");
  const [copiedOutfitId, setCopiedOutfitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outfits = activeTab === "mine" ? mine : saved;

  async function shareOutfit(outfit: OutfitLibraryItem) {
    setError(null);

    if (activeTab === "mine") {
      const response = await fetch(`/api/outfits/${outfit.id}/share`, {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? "Could not create a share link.");
        return;
      }

      await navigator.clipboard.writeText(payload.shareUrl);
      setCopiedOutfitId(outfit.id);
      window.setTimeout(() => setCopiedOutfitId(null), 1600);
      return;
    }

    const shareUrl = `${window.location.origin}/outfits/${outfit.share_slug}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopiedOutfitId(outfit.id);
    window.setTimeout(() => setCopiedOutfitId(null), 1600);
  }

  return (
    <section className="outfits-page page-shell">
      <div className="section-kicker">The Library</div>
      <div className="library-heading">
        <div>
          <h1>Outfits</h1>
          <p>Your curated outfit combinations, archived and ready to wear.</p>
        </div>
        <div className="library-tabs" role="tablist" aria-label="Outfit library tabs">
          <button
            type="button"
            className={activeTab === "mine" ? "is-active" : undefined}
            onClick={() => setActiveTab("mine")}
          >
            Mine
          </button>
          <button
            type="button"
            className={activeTab === "saved" ? "is-active" : undefined}
            onClick={() => setActiveTab("saved")}
          >
            Saved
          </button>
        </div>
      </div>

      <div className="rule" />

      {error ? <p className="inline-error">{error}</p> : null}

      {outfits.length ? (
        <div className="outfit-library-grid">
          {outfits.map((outfit) => (
            <article className="library-card" key={outfit.id}>
              <div className="library-card-tags">
                <span>{occasionLabels[outfit.occasion]}</span>
                <span>{moodLabels[outfit.mood]}</span>
                <span>{weatherLabels[outfit.weather]}</span>
                <ClientDate value={outfit.created_at} format="date" />
              </div>

              {outfit.items.length ? (
                <div className="library-item-strip">
                  {outfit.items.slice(0, 4).map((item) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt={item.name} key={item.id} />
                  ))}
                </div>
              ) : null}

              <h2>{outfit.title}</h2>
              <p>{outfit.description}</p>

              <button
                type="button"
                className="share-button"
                onClick={() => void shareOutfit(outfit)}
              >
                {copiedOutfitId === outfit.id ? (
                  <Check size={13} aria-hidden="true" />
                ) : activeTab === "mine" ? (
                  <Share2 size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
                {copiedOutfitId === outfit.id ? "Copied" : "Share"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-wardrobe">
          <Share2 size={18} aria-hidden="true" />
          <strong>
            {activeTab === "mine" ? "No saved outfits yet" : "No bookmarked outfits yet"}
          </strong>
          <span>
            {activeTab === "mine"
              ? "Generate a look and click Save Outfit to archive it here."
              : "Bookmarked community outfits will appear here in Phase 8."}
          </span>
        </div>
      )}
    </section>
  );
}

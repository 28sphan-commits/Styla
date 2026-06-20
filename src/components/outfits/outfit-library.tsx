"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { ClientDate } from "@/components/client-date";
import { PostWizard } from "@/components/outfits/post-wizard";
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
  const [outfits, setOutfits] = useState({ mine, saved });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [wizardOutfit, setWizardOutfit] = useState<OutfitLibraryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = activeTab === "mine" ? outfits.mine : outfits.saved;

  async function copyLink(outfit: OutfitLibraryItem) {
    setError(null);
    const url = `${window.location.origin}/outfits/${outfit.share_slug}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(outfit.id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  function handlePosted(outfitId: string, shareUrl: string) {
    // Mark the outfit as public in local state so the button flips to "Copy Link".
    setOutfits((current) => ({
      ...current,
      mine: current.mine.map((o) =>
        o.id === outfitId ? { ...o, is_public: true } : o
      )
    }));
    setWizardOutfit(null);
    // Immediately copy the new share URL so the user has it.
    navigator.clipboard.writeText(shareUrl).catch(() => undefined);
    setCopiedId(outfitId);
    window.setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <>
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

        {visible.length ? (
          <div className="outfit-library-grid">
            {visible.map((outfit) => (
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

                {activeTab === "mine" ? (
                  // Mine tab — always show wizard, plus copy link if already public
                  <div className="library-card-actions">
                    <button
                      type="button"
                      className="share-button"
                      onClick={() => setWizardOutfit(outfit)}
                    >
                      <Send size={13} aria-hidden="true" />
                      Post
                    </button>
                    {outfit.is_public && (
                      <button
                        type="button"
                        className="share-button secondary"
                        onClick={() => void copyLink(outfit)}
                      >
                        {copiedId === outfit.id ? (
                          <Check size={13} aria-hidden="true" />
                        ) : (
                          <Copy size={13} aria-hidden="true" />
                        )}
                        {copiedId === outfit.id ? "Copied!" : "Copy Link"}
                      </button>
                    )}
                  </div>
                ) : (
                  // Saved tab — just copy the link
                  <button
                    type="button"
                    className="share-button"
                    onClick={() => void copyLink(outfit)}
                  >
                    {copiedId === outfit.id ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <Copy size={13} aria-hidden="true" />
                    )}
                    {copiedId === outfit.id ? "Copied!" : "Copy Link"}
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-wardrobe">
            <Send size={18} aria-hidden="true" />
            <strong>
              {activeTab === "mine" ? "No saved outfits yet" : "No bookmarked outfits yet"}
            </strong>
            <span>
              {activeTab === "mine"
                ? "Generate a look and click Save Outfit to archive it here."
                : "Bookmark community outfits to save them here."}
            </span>
          </div>
        )}
      </section>

      {wizardOutfit && (
        <PostWizard
          outfit={wizardOutfit}
          onClose={() => setWizardOutfit(null)}
          onPosted={handlePosted}
        />
      )}
    </>
  );
}

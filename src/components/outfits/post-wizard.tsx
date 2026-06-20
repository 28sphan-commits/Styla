"use client";

import { useEffect, useState } from "react";
import { Check, Globe, Lock, Users, X } from "lucide-react";
import {
  moodLabels,
  occasionLabels,
  weatherLabels,
  type OutfitLibraryItem
} from "@/lib/outfits/schema";

type Visibility = "public" | "friends";

type PostWizardProps = {
  outfit: OutfitLibraryItem;
  onClose: () => void;
  onPosted: (outfitId: string, shareUrl: string) => void;
};

export function PostWizard({ outfit, onClose, onPosted }: PostWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [title, setTitle] = useState(outfit.title);
  const [description, setDescription] = useState(outfit.description);
  const [allowSaves, setAllowSaves] = useState(true);
  const [allowComments, setAllowComments] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function post() {
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/outfits/${outfit.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, allowSaves, allowComments, visibility })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post outfit.");
      onPosted(outfit.id, data.shareUrl as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post outfit.");
      setPosting(false);
    }
  }

  return (
    <div
      className="post-wizard-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="post-wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Post outfit"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <header className="wizard-header">
          <div className="wizard-step-dots" aria-hidden="true">
            {([1, 2, 3] as const).map((s) => (
              <span
                key={s}
                className={s === step ? "is-active" : s < step ? "is-done" : ""}
              />
            ))}
          </div>
          <h2>
            {step === 1
              ? "Customize Your Look"
              : step === 2
                ? "Privacy & Sharing"
                : "Ready to Post"}
          </h2>
          <button
            type="button"
            className="wizard-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </header>

        {/* ── Step bodies ── */}
        <div className="wizard-body">

          {/* Step 1 — Metadata */}
          {step === 1 && (
            <div className="wizard-step">
              <label className="wizard-label">
                <span>Title</span>
                <input
                  className="wizard-input"
                  value={title}
                  maxLength={40}
                  placeholder="Give your look a creative title…"
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <small>{title.length}/40</small>
              </label>
              <label className="wizard-label">
                <span>
                  Description <em>(optional — edit or rewrite freely)</em>
                </span>
                <textarea
                  className="wizard-textarea"
                  value={description}
                  maxLength={1000}
                  rows={5}
                  placeholder="Describe the vibe, occasion, or styling tips…"
                  onChange={(e) => setDescription(e.target.value)}
                />
                <small>{description.length}/1000</small>
              </label>
            </div>
          )}

          {/* Step 2 — Privacy */}
          {step === 2 && (
            <div className="wizard-step">
              <div className="wizard-toggle-row">
                <div className="wizard-toggle-text">
                  <strong>Allow saves</strong>
                  <p>Let others bookmark this look to their collection.</p>
                </div>
                <label className="wizard-toggle">
                  <input
                    type="checkbox"
                    checked={allowSaves}
                    onChange={(e) => setAllowSaves(e.target.checked)}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              <div className="wizard-toggle-row">
                <div className="wizard-toggle-text">
                  <strong>Allow comments</strong>
                  <p>Let others leave comments on this look.</p>
                </div>
                <label className="wizard-toggle">
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              <div className="wizard-visibility-section">
                <strong>Visibility</strong>
                <div className="wizard-visibility-options">
                  <button
                    type="button"
                    className={visibility === "public" ? "vis-option is-active" : "vis-option"}
                    onClick={() => setVisibility("public")}
                  >
                    <Globe size={18} aria-hidden="true" />
                    <span>Public</span>
                    <small>Everyone on Explore</small>
                  </button>
                  <button
                    type="button"
                    className={visibility === "friends" ? "vis-option is-active" : "vis-option"}
                    onClick={() => setVisibility("friends")}
                  >
                    <Users size={18} aria-hidden="true" />
                    <span>Friends Only</span>
                    <small>Mutual follows only</small>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Preview */}
          {step === 3 && (
            <div className="wizard-step">
              <p className="wizard-preview-label">Here&apos;s how your look will appear:</p>
              <div className="wizard-preview-card">
                {outfit.items.length > 0 && (
                  <div
                    className="wizard-preview-mosaic"
                    data-count={Math.min(outfit.items.length, 4)}
                  >
                    {outfit.items.slice(0, 4).map((item) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={item.id} src={item.image_url} alt={item.name} />
                    ))}
                  </div>
                )}
                <div className="wizard-preview-meta">
                  <div className="wizard-preview-tags">
                    <span>{occasionLabels[outfit.occasion]}</span>
                    <span>{moodLabels[outfit.mood]}</span>
                    <span>{weatherLabels[outfit.weather]}</span>
                  </div>
                  <h3>{title}</h3>
                  {description && <p>{description}</p>}
                  <div className="wizard-preview-badges">
                    {visibility === "public" ? (
                      <span className="badge-public">
                        <Globe size={11} aria-hidden="true" /> Public
                      </span>
                    ) : (
                      <span className="badge-friends">
                        <Users size={11} aria-hidden="true" /> Friends Only
                      </span>
                    )}
                    {!allowSaves && (
                      <span className="badge-nosave">
                        <Lock size={11} aria-hidden="true" /> Saves off
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {error && <p className="inline-error" style={{ marginTop: "12px" }}>{error}</p>}
            </div>
          )}
        </div>

        {/* ── Footer nav ── */}
        <footer className="wizard-foot">
          {step > 1 ? (
            <button
              type="button"
              className="wizard-back"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button
              type="button"
              className="wizard-next"
              disabled={!title.trim()}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="wizard-post"
              disabled={posting}
              onClick={() => void post()}
            >
              {posting ? (
                "Posting…"
              ) : (
                <>
                  <Check size={14} aria-hidden="true" />
                  Post Outfit
                </>
              )}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

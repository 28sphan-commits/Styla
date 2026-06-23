"use client";

import { useState } from "react";
import Link from "next/link";
import { Crown, RefreshCw, Shirt, Sparkles } from "lucide-react";
import { CaptureWizard } from "@/components/fit/capture-wizard";

type FitStatus = "none" | "processing" | "ready" | "failed";

type Shot = { label: string; url: string | null };

type FittingRoomProps = {
  isPro: boolean;
  initialStatus: FitStatus;
  initialAvatarUrl: string | null;
  hasConsented: boolean;
  initialShots: Shot[];
  initialSetupComplete: boolean;
};

export function FittingRoom({
  isPro,
  initialStatus,
  initialAvatarUrl,
  hasConsented,
  initialShots,
  initialSetupComplete
}: FittingRoomProps) {
  const [status, setStatus] = useState<FitStatus>(initialStatus);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  // Show the guided rundown until the required shots are captured AND the canvas
  // has been prepped; otherwise show the prepared canvas with a redo option.
  const [editing, setEditing] = useState(!(initialSetupComplete && initialStatus === "ready"));

  if (!isPro) {
    return (
      <section className="fitting-room page-shell">
        <div className="section-kicker">The Fitting Room</div>
        <h1>Your Personal Canvas</h1>
        <div className="fitting-upgrade">
          <Crown size={20} aria-hidden="true" />
          <strong>A Pro feature</strong>
          <p>
            Take a quick guided photo set and try your wardrobe on the real you —
            your own body, face, and hair, with each garment&apos;s true fabric.
            Upgrade to Pro to unlock it.
          </p>
          <Link className="small-dark-button" href="/profile">
            <Sparkles size={13} aria-hidden="true" />
            View plans
          </Link>
        </div>
      </section>
    );
  }

  function handleComplete(url: string | null) {
    setAvatarUrl(url);
    setStatus("ready");
    setEditing(false);
  }

  return (
    <section className="fitting-room page-shell">
      <div className="section-kicker">The Fitting Room</div>
      <div className="fitting-heading">
        <div>
          <h1>Your Personal Canvas</h1>
          <p>
            {editing
              ? "Follow the quick photo rundown — one head-to-toe shot plus a few face angles. We only finish once your shots are in, and your photos stay private to your account."
              : "This is the canvas we dress, so every look is really you. Pick pieces below to try them on, or redo your photos anytime."}
          </p>
        </div>
      </div>

      <div className="rule" />

      {editing ? (
        <CaptureWizard
          initialShots={initialShots}
          hasConsented={hasConsented}
          onComplete={handleComplete}
        />
      ) : (
        <div className="fitting-grid">
          <div className="fitting-stage">
            {status === "ready" && avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Your try-on canvas" className="fitting-mannequin" />
            ) : (
              <div className="fitting-stage-empty">
                <Shirt size={30} aria-hidden="true" />
                <strong>No canvas yet</strong>
                <span>Redo your photos to set up your try-on canvas.</span>
              </div>
            )}
          </div>

          <div className="fitting-controls">
            <p className="fitting-gallery-hint">
              Your canvas is set. Choose wardrobe pieces below to build a look. Want
              different photos? Redo your rundown anytime.
            </p>
            <button
              type="button"
              className="fitting-generate"
              onClick={() => setEditing(true)}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Redo my photos
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

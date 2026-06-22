"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, Plus, Shirt, Sparkles, Star, X } from "lucide-react";

type FitStatus = "none" | "processing" | "ready" | "failed";

type Selfie = { id: string; url: string | null; label: string | null; primary: boolean };

type FittingRoomProps = {
  isPro: boolean;
  initialStatus: FitStatus;
  initialAvatarUrl: string | null;
  hasConsented: boolean;
  initialSelfies: Selfie[];
};

export function FittingRoom({
  isPro,
  initialStatus,
  initialAvatarUrl,
  hasConsented,
  initialSelfies
}: FittingRoomProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<FitStatus>(initialStatus);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [selfies, setSelfies] = useState<Selfie[]>(initialSelfies);
  const [consent, setConsent] = useState(hasConsented);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Poll while a generation is running.
  useEffect(() => {
    if (status !== "processing") return;
    let active = true;
    async function tick() {
      try {
        const res = await fetch("/api/fit/status");
        const data = await res.json();
        if (!active) return;
        if (data.status === "ready") {
          setStatus("ready");
          setAvatarUrl(data.avatarUrl ?? null);
        } else if (data.status === "failed") {
          setStatus("failed");
          setError(data.error ?? "Generation failed.");
        }
      } catch {
        /* keep polling */
      }
    }
    const id = window.setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [status]);

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setNotice(null);
    setUploading(files.length);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("selfie", file));
      const res = await fetch("/api/fit/selfies", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not upload photos.");
      setSelfies(data.selfies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload photos.");
    } finally {
      setUploading(0);
    }
  }

  async function removePhoto(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fit/selfies?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove photo.");
      setSelfies(data.selfies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove photo.");
    }
  }

  async function makePrimary(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fit/selfies?id=${id}`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update photos.");
      setSelfies(data.selfies ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update photos.");
    }
  }

  async function generate() {
    if (selfies.length === 0 || !consent || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/fit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start generation.");
      if (data.configured === false) {
        setNotice(data.message ?? "Photo saved. Canvas prep isn't enabled yet.");
      } else if (data.status === "ready") {
        setStatus("ready");
        setAvatarUrl(data.avatarUrl ?? null);
      } else if (data.status === "processing") {
        setStatus("processing");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start generation.");
    } finally {
      setBusy(false);
    }
  }

  if (!isPro) {
    return (
      <section className="fitting-room page-shell">
        <div className="section-kicker">The Fitting Room</div>
        <h1>Your Personal Mannequin</h1>
        <div className="fitting-upgrade">
          <Crown size={20} aria-hidden="true" />
          <strong>A Pro feature</strong>
          <p>
            Upload one full-body photo and try your wardrobe on the real you —
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

  return (
    <section className="fitting-room page-shell">
      <div className="section-kicker">The Fitting Room</div>
      <div className="fitting-heading">
        <div>
          <h1>Your Personal Canvas</h1>
          <p>
            Add one full-body photo (head to toe) — your starred photo is the
            canvas we dress, so it&apos;s really you wearing each piece. Your
            photos stay private to your account.
          </p>
        </div>
      </div>

      <div className="rule" />

      <div className="fitting-grid">
        {/* Result / status panel */}
        <div className="fitting-stage">
          {status === "ready" && avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Your generated mannequin" className="fitting-mannequin" />
          ) : status === "processing" ? (
            <div className="fitting-stage-empty">
              <Loader2 size={26} aria-hidden="true" className="spin" />
              <strong>Prepping your canvas…</strong>
              <span>Checking the framing and normalizing your photo. One moment.</span>
            </div>
          ) : (
            <div className="fitting-stage-empty">
              <Shirt size={30} aria-hidden="true" />
              <strong>{status === "failed" ? "That didn't work" : "No canvas yet"}</strong>
              <span>
                {status === "failed"
                  ? error ?? "Use a clear, head-to-toe photo with your feet in frame."
                  : "Add a full-body photo and prep your canvas."}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="fitting-controls">
          <div className="fitting-gallery">
            {selfies.map((s) => (
              <div
                key={s.id}
                className={`fitting-selfie ${s.primary ? "is-primary" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.url ? <img src={s.url} alt={s.label ?? "Reference photo"} /> : null}
                {s.primary ? (
                  <span className="fitting-selfie-badge" title="Canvas photo">
                    <Star size={11} aria-hidden="true" /> Canvas
                  </span>
                ) : (
                  <button
                    type="button"
                    className="fitting-selfie-star"
                    title="Use this photo as your canvas"
                    onClick={() => void makePrimary(s.id)}
                  >
                    <Star size={13} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="fitting-selfie-remove"
                  aria-label="Remove photo"
                  onClick={() => void removePhoto(s.id)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ))}

            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`pending-${i}`} className="fitting-selfie is-pending">
                <Loader2 size={18} aria-hidden="true" className="spin" />
              </div>
            ))}

            <button
              type="button"
              className="fitting-add-selfie"
              onClick={() => inputRef.current?.click()}
            >
              <Plus size={18} aria-hidden="true" />
              <span>Add photos</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          <small className="fitting-gallery-hint">
            One clear, head-to-toe photo works best — stand facing the camera with
            your feet in frame. Star the one to use as your canvas. PNG/JPG up to
            10 MB each.
          </small>

          <label className="fitting-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree to let Styla use my photo as my try-on canvas. I can delete
              it anytime, and it won&apos;t be used to train models.
            </span>
          </label>

          <button
            type="button"
            className="fitting-generate"
            disabled={selfies.length === 0 || !consent || busy || status === "processing"}
            onClick={() => void generate()}
          >
            {busy || status === "processing" ? (
              <>
                <Loader2 size={15} aria-hidden="true" className="spin" />
                Working…
              </>
            ) : (
              <>
                <Sparkles size={15} aria-hidden="true" />
                {status === "ready" ? "Re-prep canvas" : "Prep my canvas"}
              </>
            )}
          </button>

          {notice ? <p className="inline-success">{notice}</p> : null}
          {error && status !== "failed" ? <p className="inline-error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

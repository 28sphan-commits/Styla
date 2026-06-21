"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crown, Loader2, Shirt, Sparkles, Upload, X } from "lucide-react";

type FitStatus = "none" | "processing" | "ready" | "failed";

type FittingRoomProps = {
  isPro: boolean;
  initialStatus: FitStatus;
  initialAvatarUrl: string | null;
  hasConsented: boolean;
};

export function FittingRoom({
  isPro,
  initialStatus,
  initialAvatarUrl,
  hasConsented
}: FittingRoomProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<FitStatus>(initialStatus);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState(hasConsented);
  const [busy, setBusy] = useState(false);
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

  function chooseSelfie(file: File | null) {
    if (!file) return;
    setSelfie(file);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function generate() {
    if (!selfie || !consent || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("selfie", selfie);
      formData.append("consent", "true");
      const res = await fetch("/api/fit/generate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start generation.");
      if (data.configured === false) {
        setNotice(data.message ?? "Selfie saved. Generation isn't enabled yet.");
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
            Upload a few selfies and we&apos;ll generate a styling mannequin that
            looks like you. Upgrade to Pro to unlock it.
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
          <h1>Your Personal Mannequin</h1>
          <p>
            We swap your face onto a styling mannequin so you can picture your
            looks on you. Your selfies stay private to your account.
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
              <strong>Generating your model…</strong>
              <span>This usually takes a minute. You can keep browsing.</span>
            </div>
          ) : (
            <div className="fitting-stage-empty">
              <Shirt size={30} aria-hidden="true" />
              <strong>{status === "failed" ? "That didn't work" : "No mannequin yet"}</strong>
              <span>
                {status === "failed"
                  ? error ?? "Try again with a clearer, front-facing selfie."
                  : "Add a selfie and generate your styling mannequin."}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="fitting-controls">
          <div className="fitting-upload">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => chooseSelfie(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="fitting-upload-btn"
              onClick={() => inputRef.current?.click()}
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" />
              ) : (
                <Upload size={18} aria-hidden="true" />
              )}
            </button>
            <div>
              <strong>{selfie ? selfie.name : "Upload a selfie"}</strong>
              <small>Clear, front-facing, good lighting. PNG/JPG up to 10 MB.</small>
            </div>
            {preview ? (
              <button
                type="button"
                className="fitting-clear"
                aria-label="Remove selfie"
                onClick={() => {
                  setSelfie(null);
                  setPreview((c) => {
                    if (c) URL.revokeObjectURL(c);
                    return null;
                  });
                }}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <label className="fitting-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I agree to let Styla use my photo to generate a personalized
              mannequin. I can delete it anytime, and it won&apos;t be used to
              train models.
            </span>
          </label>

          <button
            type="button"
            className="fitting-generate"
            disabled={!selfie || !consent || busy || status === "processing"}
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
                {status === "ready" ? "Regenerate" : "Generate mannequin"}
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

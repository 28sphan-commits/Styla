"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  Loader2,
  RefreshCw,
  ScanFace,
  Sparkles,
  Upload,
  type LucideIcon
} from "lucide-react";
import {
  CAPTURE_STEPS,
  isSetupComplete,
  REQUIRED_LABELS,
  type CaptureFacing,
  type CaptureStep
} from "@/lib/fit/capture-steps";

type Shot = { label: string; url: string | null };

type CaptureWizardProps = {
  initialShots: Shot[];
  hasConsented: boolean;
  onComplete: (avatarUrl: string | null) => void;
};

// Directional cue per face angle (null = look straight at the camera).
const FACING_ARROW: Record<CaptureFacing, LucideIcon | null> = {
  front: null,
  left: ArrowLeft,
  right: ArrowRight,
  up_left: ArrowUpLeft,
  up_right: ArrowUpRight,
  down_left: ArrowDownLeft,
  down_right: ArrowDownRight
};

// Friendly names for the required shots, used in the "still needed" hint so it
// only ever mentions what's actually missing.
const REQUIRED_NAMES: Record<string, string> = {
  full_body: "a head-to-toe full-body photo",
  front: "a straight-on face shot"
};

// The framing guide drawn over the camera frame: a head-to-toe silhouette for the
// body shot, an oval (+ directional arrow) for face shots.
function GuideOverlay({ step }: { step: CaptureStep }) {
  if (step.guide === "body") {
    return (
      <svg className="capture-guide-svg" viewBox="0 0 120 200" aria-hidden="true">
        <circle cx="60" cy="32" r="17" />
        <path d="M28 68 q32 -16 64 0 l-7 112 q-25 8 -50 0 Z" />
      </svg>
    );
  }
  const Arrow = step.facing ? FACING_ARROW[step.facing] : null;
  return (
    <div className="capture-guide-face">
      <svg className="capture-guide-svg" viewBox="0 0 120 150" aria-hidden="true">
        <ellipse cx="60" cy="74" rx="42" ry="56" />
      </svg>
      <span className="capture-guide-arrow">
        {Arrow ? <Arrow size={26} /> : <ScanFace size={26} />}
      </span>
    </div>
  );
}

// A little line-art figure on the side showing how to strike each pose: a full
// standing person for the body shot, and a bust holding up a phone with the face
// turned the right way for each angle.
function PoseDemo({ step }: { step: CaptureStep }) {
  const Arrow = step.facing ? FACING_ARROW[step.facing] : null;

  if (step.guide === "body") {
    return (
      <div className="capture-demo">
        <svg viewBox="0 0 120 150" aria-hidden="true">
          {/* the framing — stand back so you fit head to toe */}
          <rect className="demo-soft" x="33" y="6" width="54" height="138" rx="9" />
          {/* a person, arms relaxed at their sides */}
          <circle className="demo-stroke" cx="60" cy="28" r="9" />
          <path className="demo-stroke" d="M48 42 H72" />
          <path className="demo-stroke" d="M60 37 V90" />
          <path className="demo-stroke" d="M49 43 L45 78" />
          <path className="demo-stroke" d="M71 43 L75 78" />
          <path className="demo-stroke" d="M60 90 L52 134" />
          <path className="demo-stroke" d="M60 90 L68 134" />
        </svg>
      </div>
    );
  }

  // Face angle: shift the features (and tip the chin) to suggest the head turn.
  const facing = step.facing ?? "front";
  const dx = facing.includes("left") ? -1 : facing.includes("right") ? 1 : 0;
  const dy = facing.includes("up") ? -1 : facing.includes("down") ? 1 : 0;
  const fx = dx * 6;
  const fy = dy * 5;

  return (
    <div className="capture-demo">
      {Arrow ? (
        <span className="capture-demo-arrow">
          <Arrow size={18} aria-hidden="true" />
        </span>
      ) : null}
      <svg viewBox="0 0 120 150" aria-hidden="true">
        {/* shoulders + neck */}
        <path className="demo-stroke" d="M24 142 Q60 106 96 142" />
        <path className="demo-stroke" d="M52 90 V106" />
        <path className="demo-stroke" d="M68 90 V106" />
        {/* head */}
        <circle className="demo-stroke" cx="60" cy="58" r="30" />
        {/* features, shifted toward the turn */}
        <g transform={`translate(${fx} ${fy})`}>
          <circle className="demo-fill" cx="50" cy="54" r="2.6" />
          <circle className="demo-fill" cx="70" cy="54" r="2.6" />
          <path className="demo-stroke" d="M60 58 V66" />
          <path className="demo-stroke" d="M52 74 Q60 79 68 74" />
        </g>
        {/* a phone held up for the selfie */}
        <rect className="demo-stroke" x="92" y="40" width="20" height="36" rx="4" />
        <circle className="demo-fill" cx="102" cy="46" r="1.8" />
      </svg>
    </div>
  );
}

export function CaptureWizard({ initialShots, hasConsented, onComplete }: CaptureWizardProps) {
  const initialCaptured = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const s of initialShots ?? []) m[s.label] = s.url;
    return m;
  }, [initialShots]);

  const [captured, setCaptured] = useState<Record<string, string | null>>(initialCaptured);
  // Resume at the first not-yet-captured step (or the review screen if all done).
  const firstMissing = CAPTURE_STEPS.findIndex((s) => !(s.label in initialCaptured));
  const [step, setStep] = useState(firstMissing === -1 ? CAPTURE_STEPS.length : firstMissing);
  const [consent, setConsent] = useState(hasConsented);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const total = CAPTURE_STEPS.length;
  const onReview = step >= total;
  const current = onReview ? null : CAPTURE_STEPS[step];
  const complete = isSetupComplete(Object.keys(captured));
  // Only the required shots that are still missing — so we never nag about a
  // shot the user has already taken.
  const missingRequired = REQUIRED_LABELS.filter((l) => !(l in captured));

  async function uploadFile(file: File) {
    if (!current) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("selfie", file);
      form.append("label", current.label);
      const res = await fetch("/api/fit/selfies", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that photo.");
      setCaptured((c) => ({ ...c, [current.label]: URL.createObjectURL(file) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that photo.");
    } finally {
      setUploading(false);
    }
  }

  function onFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  // --- Live in-device camera (laptop webcam / phone front camera) ---
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    if (!current) return;
    setCameraError(null);
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setCameraError("This browser can't open the camera here — upload a photo instead.");
      return;
    }
    try {
      const stream = await media.getUserMedia({
        video: {
          facingMode: current.camera === "environment" ? { ideal: "environment" } : "user"
        },
        audio: false
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch {
      setCameraError("Couldn't access the camera. Check permissions, or upload a photo instead.");
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !current) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92)
    );
    stopCamera();
    if (!blob) return;
    await uploadFile(new File([blob], `${current.label}.jpg`, { type: "image/jpeg" }));
  }

  // Attach the live stream once the <video> is mounted.
  useEffect(() => {
    const video = videoRef.current;
    if (cameraOn && video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, [cameraOn]);

  // Release the camera when leaving a step or unmounting.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [step]);

  const goto = (i: number) => {
    setError(null);
    setStep(i);
  };

  async function finish() {
    if (!consent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fit/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not finish setup.");
      onComplete(data.avatarUrl ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Review / finish screen ----
  if (onReview || !current) {
    const missingNames = missingRequired.map((l) => REQUIRED_NAMES[l] ?? l);
    return (
      <div className="capture-wizard">
        <div className="capture-progress">
          <span>Review</span>
          <div className="capture-progress-bar">
            <i style={{ width: "100%" }} />
          </div>
        </div>
        <h2 className="capture-title">Your photos</h2>
        <p className="capture-instruction">
          Tap any shot to retake it. A full-body photo and a straight-on face are
          required; the angles make your face look sharper in your looks.
        </p>

        <div className="capture-review-grid">
          {CAPTURE_STEPS.map((s, i) => {
            const url = captured[s.label];
            const done = s.label in captured;
            return (
              <button
                key={s.label}
                type="button"
                className={`capture-thumb ${done ? "is-done" : "is-missing"}`}
                onClick={() => goto(i)}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={s.title} />
                ) : (
                  <span className="capture-thumb-empty">
                    <Camera size={16} aria-hidden="true" />
                  </span>
                )}
                <span className="capture-thumb-label">
                  {done ? <Check size={11} aria-hidden="true" /> : null} {s.title}
                  {s.required ? " *" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <label className="fitting-consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I agree to let Styla use my photos as my try-on canvas. I can delete them
            anytime, and they won&apos;t be used to train models.
          </span>
        </label>

        {error ? <p className="inline-error">{error}</p> : null}

        <div className="capture-actions">
          <button type="button" className="capture-back" onClick={() => goto(total - 1)}>
            <ChevronLeft size={15} aria-hidden="true" /> Back
          </button>
          <button
            type="button"
            className="capture-finish"
            disabled={!complete || !consent || busy}
            onClick={() => void finish()}
          >
            {busy ? (
              <>
                <Loader2 size={15} aria-hidden="true" className="spin" /> Setting up…
              </>
            ) : (
              <>
                <Sparkles size={15} aria-hidden="true" /> Finish setup
              </>
            )}
          </button>
        </div>
        {missingNames.length > 0 ? (
          <small className="capture-hint">
            Still needed: {missingNames.join(" and ")} to finish.
          </small>
        ) : null}
      </div>
    );
  }

  // ---- Capture step screen ----
  const shot = captured[current.label];
  return (
    <div className="capture-wizard">
      <div className="capture-progress">
        <span>
          Step {step + 1} of {total}
        </span>
        <div className="capture-progress-bar">
          <i style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
      </div>

      <div className="capture-layout">
        <div className="capture-main">
          <h2 className="capture-title">
            {current.title}
            {current.required ? null : <span className="capture-optional"> · optional</span>}
          </h2>
          <p className="capture-instruction">{current.instruction}</p>

          <div className={`capture-frame ${current.guide === "body" ? "is-body" : "is-face"}`}>
            {cameraOn ? (
              <video
                ref={videoRef}
                className={`capture-video ${current.camera === "user" ? "is-mirrored" : ""}`}
                autoPlay
                playsInline
                muted
              />
            ) : shot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot} alt={`${current.title} preview`} className="capture-shot" />
            ) : null}
            <GuideOverlay step={current} />
            {uploading ? (
              <span className="capture-uploading">
                <Loader2 size={22} aria-hidden="true" className="spin" />
              </span>
            ) : null}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files);
              e.target.value = "";
            }}
          />

          {error ? <p className="inline-error">{error}</p> : null}
          {cameraError ? <p className="inline-error">{cameraError}</p> : null}

          <div className="capture-actions">
            {cameraOn ? (
              <>
                <button type="button" className="capture-back" onClick={stopCamera}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="capture-capture"
                  onClick={() => void capturePhoto()}
                  disabled={uploading}
                >
                  <Camera size={15} aria-hidden="true" /> {uploading ? "Saving…" : "Capture"}
                </button>
              </>
            ) : (
              <>
                {step > 0 ? (
                  <button type="button" className="capture-back" onClick={() => goto(step - 1)}>
                    <ChevronLeft size={15} aria-hidden="true" /> Back
                  </button>
                ) : (
                  <span />
                )}

                {shot ? (
                  // A shot exists — let the user redo it either way (live camera or a
                  // fresh upload), then move on.
                  <div className="capture-actions-right">
                    <button
                      type="button"
                      className="capture-upload"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden="true" /> Upload
                    </button>
                    <button type="button" className="capture-retake" onClick={() => void startCamera()}>
                      <RefreshCw size={14} aria-hidden="true" /> Retake
                    </button>
                    <button type="button" className="capture-next" onClick={() => goto(step + 1)}>
                      {step === total - 1 ? "Review" : "Next"}
                    </button>
                  </div>
                ) : (
                  <div className="capture-actions-right">
                    {!current.required ? (
                      <button type="button" className="capture-skip" onClick={() => goto(step + 1)}>
                        Skip
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="capture-upload"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden="true" /> Upload
                    </button>
                    <button
                      type="button"
                      className="capture-capture"
                      onClick={() => void startCamera()}
                      disabled={uploading}
                    >
                      <Camera size={15} aria-hidden="true" /> Take photo
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="capture-side">
          <PoseDemo step={current} />
          <p className="capture-side-title">How to nail this shot</p>
          <ul className="capture-side-tips">
            {current.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="capture-side-required">
            {current.required
              ? "Required to finish setup."
              : "Optional — extra angles sharpen your face."}
          </p>
        </aside>
      </div>
    </div>
  );
}

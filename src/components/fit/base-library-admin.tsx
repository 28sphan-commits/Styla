"use client";

import { useRef, useState } from "react";
import { CheckCircle, ImagePlus, Loader2, Sparkles, XCircle } from "lucide-react";
import { baseModelCatalog, baseModelUrl } from "@/lib/fit/base-library";
import type { GenderCategory } from "@/lib/fit/base-library";

const CATALOG = baseModelCatalog();

type SlotStatus = "unknown" | "present" | "missing";
type Busy = "idle" | "uploading" | "generating";

const GENDER_LABEL: Record<GenderCategory, string> = {
  femme: "Femme",
  masc: "Masc",
  neutral: "Neutral"
};

export function BaseLibraryAdmin({ canGenerate }: { canGenerate: boolean }) {
  // Track which slots have confirmed images (via img onLoad/onError).
  const [slotStatus, setSlotStatus] = useState<Record<string, SlotStatus>>({});
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [error, setError] = useState<Record<string, string>>({});
  // Bump per-slot version to bust the <img> cache after a write.
  const [version, setVersion] = useState<Record<string, number>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function markSlot(key: string, status: SlotStatus) {
    setSlotStatus((s) => ({ ...s, [key]: status }));
  }
  function bust(key: string) {
    setVersion((v) => ({ ...v, [key]: (v[key] ?? 0) + 1 }));
  }

  async function upload(key: string, file: File) {
    setBusy((s) => ({ ...s, [key]: "uploading" }));
    setError((s) => ({ ...s, [key]: "" }));
    const body = new FormData();
    body.set("key", key);
    body.set("file", file);
    try {
      const res = await fetch("/api/fit/base-upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      markSlot(key, "present");
      bust(key);
    } catch (err) {
      setError((s) => ({ ...s, [key]: err instanceof Error ? err.message : "Upload failed." }));
    } finally {
      setBusy((s) => ({ ...s, [key]: "idle" }));
    }
  }

  async function generate(key: string): Promise<boolean> {
    setBusy((s) => ({ ...s, [key]: "generating" }));
    setError((s) => ({ ...s, [key]: "" }));
    try {
      const res = await fetch("/api/fit/base-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, force: true })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      markSlot(key, "present");
      bust(key);
      return true;
    } catch (err) {
      setError((s) => ({ ...s, [key]: err instanceof Error ? err.message : "Generation failed." }));
      return false;
    } finally {
      setBusy((s) => ({ ...s, [key]: "idle" }));
    }
  }

  // Generate every slot that's currently missing, one at a time (each request
  // can take ~30s, so sequential keeps each one within the route timeout).
  async function generateAllMissing() {
    setBulkRunning(true);
    for (const { key } of CATALOG) {
      if ((slotStatus[key] ?? "unknown") === "present") continue;
      await generate(key);
    }
    setBulkRunning(false);
  }

  function handleFile(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    void upload(key, file);
    e.target.value = "";
  }

  const genders: GenderCategory[] = ["femme", "masc", "neutral"];

  return (
    <div className="base-library-admin">
      {canGenerate && (
        <div className="base-admin-toolbar">
          <button
            type="button"
            className="base-generate-all-btn"
            onClick={() => void generateAllMissing()}
            disabled={bulkRunning}
          >
            {bulkRunning ? (
              <><Loader2 size={14} aria-hidden="true" className="spin" /> Generating missing slots…</>
            ) : (
              <><Sparkles size={14} aria-hidden="true" /> Generate all missing</>
            )}
          </button>
          <span className="base-admin-hint">
            Generates a full-body mannequin for any empty slot via Replicate, then caches it.
          </span>
        </div>
      )}

      {genders.map((gender) => (
        <div key={gender} className="base-gender-group">
          <h2 className="base-gender-heading">{GENDER_LABEL[gender]}</h2>
          <div className="base-slots-grid">
            {CATALOG.filter((e) => e.gender === gender).map(({ key, bodyType }) => {
              const v = version[key] ?? 0;
              const url = baseModelUrl(key) + (v > 0 ? `?v=${v}` : "");
              const status = slotStatus[key] ?? "unknown";
              const slotBusy = busy[key] ?? "idle";
              const isBusy = slotBusy !== "idle";
              const slotError = error[key];

              return (
                <div
                  key={key}
                  className={`base-slot ${status === "present" ? "is-present" : status === "missing" ? "is-missing" : ""}`}
                >
                  <div className="base-slot-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={url}
                      src={url}
                      alt={key}
                      className="base-slot-img"
                      onLoad={() => markSlot(key, "present")}
                      onError={() => markSlot(key, "missing")}
                    />
                    {status === "missing" && slotBusy === "idle" && (
                      <div className="base-slot-empty-overlay">
                        <ImagePlus size={22} aria-hidden="true" />
                      </div>
                    )}
                    {isBusy && (
                      <div className="base-slot-uploading-overlay">
                        <Loader2 size={22} aria-hidden="true" className="spin" />
                        <span>{slotBusy === "generating" ? "Generating…" : "Uploading…"}</span>
                      </div>
                    )}
                  </div>

                  <div className="base-slot-meta">
                    <span className="base-slot-key">{bodyType}</span>
                    <span
                      className={`base-slot-badge ${status === "present" ? "is-present" : status === "missing" ? "is-missing" : ""}`}
                    >
                      {status === "present" ? (
                        <><CheckCircle size={11} aria-hidden="true" /> ready</>
                      ) : status === "missing" ? (
                        <><XCircle size={11} aria-hidden="true" /> missing</>
                      ) : null}
                    </span>
                  </div>

                  {slotError ? <p className="base-slot-error">{slotError}</p> : null}

                  <div className="base-slot-actions">
                    {canGenerate && (
                      <button
                        type="button"
                        className="base-slot-gen-btn"
                        disabled={isBusy || bulkRunning}
                        onClick={() => void generate(key)}
                      >
                        <Sparkles size={12} aria-hidden="true" />
                        {status === "present" ? "Regenerate" : "Generate"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="base-slot-upload-btn"
                      disabled={isBusy || bulkRunning}
                      onClick={() => inputRefs.current[key]?.click()}
                    >
                      {status === "present" ? "Replace" : "Upload"}
                    </button>
                  </div>
                  <input
                    ref={(el) => {
                      inputRefs.current[key] = el;
                    }}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => handleFile(key, e)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

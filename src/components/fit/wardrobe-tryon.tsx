"use client";

import { useEffect, useState } from "react";
import { Check, Layers, Loader2, Shirt, Sparkles } from "lucide-react";
import { garmentCategory } from "@/lib/fit/garments";

type TryOnItem = {
  id: string;
  name: string;
  type: string[];
  image_url: string;
};

type InitialLook = { id: string; resultUrl: string | null; itemIds: string[] } | null;

type LookState = {
  id: string | null;
  status: "idle" | "processing" | "finalizing" | "ready" | "failed";
  resultUrl: string | null;
  layer: number;
  total: number;
  error?: string | null;
};

type WardrobeTryOnProps = {
  items: TryOnItem[];
  initialLook: InitialLook;
};

export function WardrobeTryOn({ items, initialLook }: WardrobeTryOnProps) {
  const tryableIds = new Set(items.filter((i) => garmentCategory(i.type)).map((i) => i.id));

  const [selected, setSelected] = useState<string[]>(
    () => (initialLook?.itemIds ?? []).filter((id) => tryableIds.has(id))
  );
  const [look, setLook] = useState<LookState>(() =>
    initialLook
      ? {
          id: initialLook.id,
          status: "ready",
          resultUrl: initialLook.resultUrl,
          layer: initialLook.itemIds.length,
          total: initialLook.itemIds.length
        }
      : { id: null, status: "idle", resultUrl: null, layer: 0, total: 0 }
  );

  // Poll while a look is composing; advances one layer per server poll, then
  // through the `finalizing` stage (mask-back + identity restore) to `ready`.
  useEffect(() => {
    const live = look.status === "processing" || look.status === "finalizing";
    if (!live || !look.id) return;
    const lookId = look.id;
    let active = true;
    async function tick() {
      try {
        const res = await fetch(`/api/fit/tryon?lookId=${lookId}`);
        const data = await res.json();
        if (!active) return;
        if (data.status === "ready") {
          setLook({ id: lookId, status: "ready", resultUrl: data.resultUrl ?? null, layer: data.total, total: data.total });
        } else if (data.status === "failed") {
          setLook((l) => ({ ...l, status: "failed", error: data.error ?? "That didn't work." }));
        } else if (data.status === "finalizing") {
          setLook((l) => ({ ...l, status: "finalizing", layer: data.total ?? l.total, total: data.total ?? l.total }));
        } else if (data.status === "processing") {
          setLook((l) => ({ ...l, layer: data.layer ?? l.layer, total: data.total ?? l.total }));
        }
      } catch {
        /* keep polling */
      }
    }
    const timer = window.setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [look.status, look.id]);

  function toggle(item: TryOnItem) {
    if (!tryableIds.has(item.id)) return;
    setSelected((cur) =>
      cur.includes(item.id) ? cur.filter((id) => id !== item.id) : [...cur, item.id]
    );
  }

  async function generateLook() {
    if (selected.length === 0 || look.status === "processing") return;
    setLook({ id: null, status: "processing", resultUrl: null, layer: 0, total: selected.length });
    try {
      const res = await fetch("/api/fit/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: selected })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start your look.");
      if (data.status === "ready") {
        setLook({ id: data.lookId ?? null, status: "ready", resultUrl: data.resultUrl ?? null, layer: data.total, total: data.total });
      } else {
        setLook({ id: data.lookId ?? null, status: "processing", resultUrl: null, layer: data.layer ?? 0, total: data.total ?? selected.length });
      }
    } catch (err) {
      setLook({ id: null, status: "failed", resultUrl: null, layer: 0, total: selected.length, error: err instanceof Error ? err.message : "Could not start your look." });
    }
  }

  const finalizing = look.status === "finalizing";
  const composing = look.status === "processing" || finalizing;

  return (
    <section className="wardrobe-tryon page-shell">
      <div className="section-kicker">Virtual Try-On</div>
      <div className="fitting-heading">
        <div>
          <h1>Build a Look</h1>
          <p>Select a top, bottom, and more — we layer them onto your real full-body photo, preserving your face and each garment&apos;s actual fabric. Tap to add or remove pieces, then Generate Look.</p>
        </div>
      </div>

      <div className="rule" />

      {items.length === 0 ? (
        <div className="fitting-upgrade">
          <Shirt size={20} aria-hidden="true" />
          <strong>Your wardrobe is empty</strong>
          <p>Add a few clothing items in your Wardrobe, then come back to build a look.</p>
        </div>
      ) : (
        <div className="tryon-layout">
          <div className="fitting-stage tryon-stage">
            {look.status === "ready" && look.resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={look.resultUrl} alt="Your composed look" className="fitting-mannequin" />
            ) : composing ? (
              <div className="fitting-stage-empty">
                <Loader2 size={26} aria-hidden="true" className="spin" />
                <strong>{finalizing ? "Locking in your look…" : "Composing your look…"}</strong>
                <span>
                  {finalizing
                    ? "Restoring your real face and each garment's actual fabric."
                    : look.total > 1
                      ? `Layering piece ${Math.min(look.layer + 1, look.total)} of ${look.total}. This takes ~30s per piece.`
                      : "This takes about 30 seconds."}
                </span>
              </div>
            ) : look.status === "failed" ? (
              <div className="fitting-stage-empty">
                <Shirt size={30} aria-hidden="true" />
                <strong>That didn&apos;t work</strong>
                <span>{look.error ?? "Try a different combination."}</span>
              </div>
            ) : (
              <div className="fitting-stage-empty">
                <Sparkles size={30} aria-hidden="true" />
                <strong>Build your outfit</strong>
                <span>Select pieces from your wardrobe, then Generate Look.</span>
              </div>
            )}
          </div>

          <div className="tryon-picker">
            <div className="tryon-grid">
              {items.map((item) => {
                const tryable = tryableIds.has(item.id);
                const isSelected = selected.includes(item.id);
                const className = [
                  "tryon-item",
                  isSelected ? "is-selected" : "",
                  tryable ? "" : "is-disabled"
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={className}
                    disabled={!tryable || composing}
                    title={tryable ? item.name : `${item.name} — can't be tried on`}
                    onClick={() => toggle(item)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name} />
                    {isSelected ? (
                      <span className="tryon-item-badge is-selected">
                        <Check size={11} aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="tryon-generate-bar">
              <div className="tryon-selected-count">
                <Layers size={14} aria-hidden="true" />
                {selected.length === 0
                  ? "No pieces selected"
                  : `${selected.length} ${selected.length === 1 ? "piece" : "pieces"} selected`}
                {selected.length > 0 && !composing ? (
                  <button type="button" className="tryon-clear" onClick={() => setSelected([])}>
                    Clear
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="tryon-generate-btn"
                disabled={selected.length === 0 || composing}
                onClick={() => void generateLook()}
              >
                {composing ? (
                  <>
                    <Loader2 size={15} aria-hidden="true" className="spin" />
                    {finalizing ? "Finalizing…" : "Composing…"}
                  </>
                ) : (
                  <>
                    <Sparkles size={15} aria-hidden="true" />
                    Generate Look
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

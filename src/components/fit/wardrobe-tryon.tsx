"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Shirt, Sparkles } from "lucide-react";
import { garmentCategory } from "@/lib/fit/garments";

type TryOnItem = {
  id: string;
  name: string;
  type: string[];
  image_url: string;
};

type TryOnState = {
  status: "none" | "processing" | "ready" | "failed";
  resultUrl: string | null;
  error?: string | null;
};

type WardrobeTryOnProps = {
  items: TryOnItem[];
  initialTryons: Record<string, TryOnState>;
};

export function WardrobeTryOn({ items, initialTryons }: WardrobeTryOnProps) {
  const [tryons, setTryons] = useState<Record<string, TryOnState>>(initialTryons);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => items.find((item) => initialTryons[item.id]?.status === "ready")?.id ?? null
  );

  // Stable key of in-flight items; the poller restarts only when this changes
  // (an item starts or finishes), not on every tick.
  const processingKey = useMemo(
    () =>
      items
        .filter((item) => tryons[item.id]?.status === "processing")
        .map((item) => item.id)
        .join(","),
    [items, tryons]
  );

  useEffect(() => {
    if (!processingKey) return;
    const ids = processingKey.split(",");
    let active = true;

    async function poll() {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/fit/tryon?wardrobeItemId=${id}`);
          const data = await res.json();
          if (!active) return;
          if (data.status === "ready" || data.status === "failed") {
            setTryons((current) => ({
              ...current,
              [id]: {
                status: data.status,
                resultUrl: data.resultUrl ?? null,
                error: data.error ?? null
              }
            }));
          }
        } catch {
          /* keep polling */
        }
      }
    }

    const timer = window.setInterval(() => void poll(), 4000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [processingKey]);

  async function tryOn(item: TryOnItem) {
    if (!garmentCategory(item.type)) return; // not try-on-able
    setSelectedId(item.id);

    const current = tryons[item.id];
    if (current?.status === "ready") return; // cached — just show it
    if (current?.status === "processing") return;

    setTryons((c) => ({ ...c, [item.id]: { status: "processing", resultUrl: null } }));
    try {
      const res = await fetch("/api/fit/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardrobeItemId: item.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start try-on.");
      if (data.status === "ready") {
        setTryons((c) => ({
          ...c,
          [item.id]: { status: "ready", resultUrl: data.resultUrl ?? null }
        }));
      }
      // otherwise stays "processing" and the poller takes over
    } catch (err) {
      setTryons((c) => ({
        ...c,
        [item.id]: {
          status: "failed",
          resultUrl: null,
          error: err instanceof Error ? err.message : "Could not start try-on."
        }
      }));
    }
  }

  const selected = selectedId ? tryons[selectedId] : null;
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  return (
    <section className="wardrobe-tryon page-shell">
      <div className="section-kicker">Virtual Try-On</div>
      <div className="fitting-heading">
        <div>
          <h1>Try On Your Wardrobe</h1>
          <p>Tap any top, bottom, or dress to see it on your body. Results are saved, so tapping again is instant.</p>
        </div>
      </div>

      <div className="rule" />

      {items.length === 0 ? (
        <div className="fitting-upgrade">
          <Shirt size={20} aria-hidden="true" />
          <strong>Your wardrobe is empty</strong>
          <p>Add a few clothing items in your Wardrobe, then come back to try them on.</p>
        </div>
      ) : (
        <div className="tryon-layout">
          <div className="fitting-stage tryon-stage">
            {selected?.status === "ready" && selected.resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.resultUrl} alt="Your try-on result" className="fitting-mannequin" />
            ) : selected?.status === "processing" ? (
              <div className="fitting-stage-empty">
                <Loader2 size={26} aria-hidden="true" className="spin" />
                <strong>Trying it on…</strong>
                <span>This takes ~30 seconds. Tap other items meanwhile.</span>
              </div>
            ) : selected?.status === "failed" ? (
              <div className="fitting-stage-empty">
                <Shirt size={30} aria-hidden="true" />
                <strong>That didn&apos;t work</strong>
                <span>{selected.error ?? "Try a different item."}</span>
              </div>
            ) : (
              <div className="fitting-stage-empty">
                <Sparkles size={30} aria-hidden="true" />
                <strong>Pick something to try on</strong>
                <span>Tap a top, bottom, or dress from your wardrobe.</span>
              </div>
            )}
            {selectedItem ? <span className="tryon-stage-label">{selectedItem.name}</span> : null}
          </div>

          <div className="tryon-grid">
            {items.map((item) => {
              const tryable = Boolean(garmentCategory(item.type));
              const state = tryons[item.id];
              const className = [
                "tryon-item",
                item.id === selectedId ? "is-selected" : "",
                tryable ? "" : "is-disabled"
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={item.id}
                  type="button"
                  className={className}
                  disabled={!tryable}
                  title={tryable ? item.name : `${item.name} — can't be tried on`}
                  onClick={() => void tryOn(item)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt={item.name} />
                  {state?.status === "processing" ? (
                    <span className="tryon-item-badge is-loading">
                      <Loader2 size={11} aria-hidden="true" className="spin" />
                    </span>
                  ) : state?.status === "ready" ? (
                    <span className="tryon-item-badge is-ready">
                      <Check size={11} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

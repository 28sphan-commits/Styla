"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, Shirt, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { removeImageBackground } from "@/lib/wardrobe/background-removal";
import {
  ACCEPTED_IMAGE_ACCEPT,
  compressImage,
  isHeic,
  prepareImageFile
} from "@/lib/wardrobe/image-intake";
import {
  clothingColors,
  clothingSeasons,
  clothingTypes,
  titleCase,
  typeLabels,
  type WardrobeItem
} from "@/lib/wardrobe/schema";

type WardrobeManagerProps = {
  initialItems: WardrobeItem[];
};

type FilterKind = "all" | "type" | "color" | "season";

type ActiveFilter = {
  kind: FilterKind;
  value: string;
};

// An in-flight upload shown optimistically as a placeholder card while the
// background remover + AI tagging run in the background.
type PendingUpload = {
  id: string;
  previewUrl: string | null;
  status: string;
  error: string | null;
};

const defaultFilter: ActiveFilter = { kind: "all", value: "all" };

export function WardrobeManager({ initialItems }: WardrobeManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(defaultFilter);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    if (activeFilter.kind === "all") {
      return items;
    }

    return items.filter((item) => {
      if (activeFilter.kind === "type") return item.type.includes(activeFilter.value as never);
      if (activeFilter.kind === "color") return item.color.includes(activeFilter.value as never);
      if (activeFilter.kind === "season") return item.season.includes(activeFilter.value as never);
      return true;
    });
  }, [activeFilter, items]);

  const stats = useMemo(() => {
    const categories = new Set(items.flatMap((item) => item.type));
    const colors = new Set(items.flatMap((item) => item.color));
    const seasons = new Set(items.flatMap((item) => item.season));
    const categoryCounts = clothingTypes.map((type) => ({
      type,
      count: items.filter((item) => item.type.includes(type)).length
    }));
    const mostStocked = categoryCounts.reduce(
      (best, current) => (current.count > best.count ? current : best),
      { type: "top" as (typeof clothingTypes)[number], count: 0 }
    );

    return {
      total: items.length,
      categories: categories.size,
      colors: colors.size,
      seasons: seasons.size,
      mostStocked
    };
  }, [items]);

  const groupedItems = useMemo(
    () =>
      clothingTypes
        .map((type) => ({
          type,
          items: filteredItems.filter((item) => item.type.includes(type))
        }))
        .filter((group) => group.items.length > 0),
    [filteredItems]
  );

  function updatePending(id: string, patch: Partial<PendingUpload>) {
    setPending((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
    );
  }

  function removePending(id: string) {
    setPending((current) => {
      const target = current.find((entry) => entry.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function uploadFile(file: File) {
    // Optimistic UI: drop a placeholder card into the closet immediately so the
    // upload feels instant. Non-HEIC files get a live preview right away; HEIC
    // can't render until it's converted a moment later.
    const id = crypto.randomUUID();
    const instantPreview = isHeic(file) ? null : URL.createObjectURL(file);
    setPending((current) => [
      { id, previewUrl: instantPreview, status: "Preparing photo...", error: null },
      ...current
    ]);

    try {
      // Validate size/type and convert iPhone HEIC/HEIF photos to JPEG first.
      updatePending(id, {
        status: isHeic(file) ? "Converting iPhone photo..." : "Preparing photo..."
      });
      const readyFile = await prepareImageFile(file);

      if (!instantPreview) {
        updatePending(id, { previewUrl: URL.createObjectURL(readyFile) });
      }

      // AI cut-out runs in the browser. If it fails (offline, unsupported
      // device, blocked CDN), fall back to a compressed copy so the upload
      // still succeeds rather than dead-ending the user.
      let cleanedFile: File;
      try {
        updatePending(id, { status: "Removing background..." });
        cleanedFile = await removeImageBackground(readyFile, (ratio) => {
          updatePending(id, { status: `Removing background... ${Math.round(ratio * 100)}%` });
        });
      } catch (removalError) {
        console.warn("Background removal failed, using original image.", removalError);
        try {
          cleanedFile = await compressImage(readyFile);
        } catch {
          cleanedFile = readyFile;
        }
      }

      updatePending(id, { status: "Tagging this piece..." });
      const formData = new FormData();
      formData.append("image", cleanedFile);

      const response = await fetch("/api/ai/categorize-item", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      // Done: smoothly swap the placeholder for the real, tagged item.
      setItems((current) => [payload.item, ...current]);
      removePending(id);
    } catch (uploadError) {
      updatePending(id, {
        status: "",
        error:
          uploadError instanceof Error
            ? uploadError.message
            : "Could not upload this clothing item."
      });
    }
  }

  async function deleteItem(item: WardrobeItem) {
    setError(null);
    const response = await fetch(`/api/wardrobe/items/${item.id}`, {
      method: "DELETE"
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.error ?? "Could not delete this item.");
      return;
    }

    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
  }

  function handleFiles(fileList: FileList | null) {
    const file = fileList?.[0];
    // Reset inputs right away so the same file can be re-picked and so the next
    // item can be added while this one is still processing.
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (!file) return;
    void uploadFile(file);
  }

  function chipClass(kind: FilterKind, value: string) {
    return activeFilter.kind === kind && activeFilter.value === value
      ? "filter-chip is-active"
      : "filter-chip";
  }

  return (
    <section className="wardrobe-page page-shell">
      <div className="section-kicker">The Collection</div>
      <div className="wardrobe-heading">
        <div>
          <h1>My Wardrobe</h1>
          <p>
            Upload clothing photographs. Styla removes simple backgrounds,
            categorizes each piece, and stores everything for outfit generation.
          </p>
        </div>
        <span className="date-stamp">Closet 01</span>
      </div>

      <div className="rule" />

      <div className="wardrobe-stats" aria-label="Wardrobe stats">
        <StatCard label="Total Items" value={stats.total} />
        <StatCard label="Categories" value={stats.categories} />
        <StatCard label="Colors" value={stats.colors} />
        <StatCard label="Seasons" value={stats.seasons} />
      </div>

      <p className="wardrobe-insight">
        Most stocked category:{" "}
        <strong>
          {typeLabels[stats.mostStocked.type]} with {stats.mostStocked.count}{" "}
          {stats.mostStocked.count === 1 ? "piece" : "pieces"}
        </strong>
      </p>

      <div
        className={isDragging ? "upload-zone is-dragging" : "upload-zone"}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        {/* Standard picker. No `capture` attribute, so iOS shows its native
            "Photo Library / Take Photo / Choose File" action sheet. */}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          onChange={(event) => handleFiles(event.target.files)}
        />
        {/* Camera-first input for the dedicated "Take Photo" button. On phones
            `capture="environment"` opens the rear camera straight away. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          capture="environment"
          onChange={(event) => handleFiles(event.target.files)}
        />
        <button
          type="button"
          className="upload-button"
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud size={19} aria-hidden="true" />
        </button>
        <strong>
          {pending.length > 0
            ? "Add another — we'll keep processing"
            : "Drop a clothing photograph here"}
        </strong>
        <span>or click to browse - PNG, JPG, WebP, or HEIC up to 10 MB</span>
        <button
          type="button"
          className="take-photo-btn"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera size={14} aria-hidden="true" />
          Take Photo
        </button>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      <div className="filters-panel">
        <FilterRow label="Type">
          <button
            type="button"
            className={chipClass("all", "all")}
            onClick={() => setActiveFilter(defaultFilter)}
          >
            All
          </button>
          {clothingTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={chipClass("type", type)}
              onClick={() => setActiveFilter({ kind: "type", value: type })}
            >
              {typeLabels[type].replace(/s$/, "")}
            </button>
          ))}
        </FilterRow>

        <FilterRow label="Color">
          {clothingColors.map((color) => (
            <button
              key={color}
              type="button"
              className={chipClass("color", color)}
              onClick={() => setActiveFilter({ kind: "color", value: color })}
            >
              {titleCase(color)}
            </button>
          ))}
        </FilterRow>

        <FilterRow label="Season">
          {clothingSeasons.map((season) => (
            <button
              key={season}
              type="button"
              className={chipClass("season", season)}
              onClick={() => setActiveFilter({ kind: "season", value: season })}
            >
              {titleCase(season)}
            </button>
          ))}
        </FilterRow>
      </div>

      {pending.length || groupedItems.length ? (
        <div className="wardrobe-groups">
          {pending.length ? (
            <section className="wardrobe-group">
              <h2>
                Adding to your closet{" "}
                <span>{pending.length} processing</span>
              </h2>
              <div className="wardrobe-grid">
                {pending.map((entry) => (
                  <PendingCard
                    key={entry.id}
                    pending={entry}
                    onDismiss={() => removePending(entry.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {groupedItems.map((group) => (
            <section className="wardrobe-group" key={group.type}>
              <h2>
                {typeLabels[group.type]}{" "}
                <span>
                  {group.items.length} {group.items.length === 1 ? "piece" : "pieces"}
                </span>
              </h2>
              <div className="wardrobe-grid">
                {group.items.map((item) => (
                  <article className="wardrobe-card" key={item.id}>
                    <button
                      className="delete-item"
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => void deleteItem(item)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                    <div className="item-image-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.image_url} alt={item.name} />
                    </div>
                    <h3>{item.name}</h3>
                    <div className="item-tags">
                      {[...item.color, ...item.pattern, ...item.formality, ...item.season].map(
                        (tag) => (
                          <span key={`${item.id}-${tag}`}>{titleCase(tag)}</span>
                        )
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-wardrobe">
          <Camera size={18} aria-hidden="true" />
          <strong>{items.length ? "No pieces match this filter" : "Start your collection"}</strong>
          <span>
            {items.length
              ? "Try another type, color, or season."
              : "Upload one clear photo of a clothing item to build your wardrobe."}
          </span>
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-card">
      <Sparkles size={14} aria-hidden="true" />
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

function PendingCard({
  pending,
  onDismiss
}: {
  pending: PendingUpload;
  onDismiss: () => void;
}) {
  return (
    <article className={`wardrobe-card pending-card${pending.error ? " has-error" : ""}`}>
      <div className="item-image-wrap pending-image">
        {pending.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pending.previewUrl} alt="" className="pending-preview" />
        ) : null}
        <span className="pending-shirt" aria-hidden="true">
          <Shirt size={30} />
        </span>
      </div>
      {pending.error ? (
        <>
          <p className="pending-error-text">{pending.error}</p>
          <button type="button" className="pending-dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        </>
      ) : (
        <p className="pending-status">
          <Loader2 size={12} aria-hidden="true" className="spin" />
          {pending.status}
        </p>
      )}
    </article>
  );
}

function FilterRow({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

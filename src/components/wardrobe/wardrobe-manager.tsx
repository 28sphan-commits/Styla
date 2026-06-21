"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Loader2, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { removeSimpleBackground } from "@/lib/wardrobe/background-removal";
import {
  ACCEPTED_IMAGE_ACCEPT,
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

const defaultFilter: ActiveFilter = { kind: "all", value: "all" };

export function WardrobeManager({ initialItems }: WardrobeManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initialItems);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(defaultFilter);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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

  async function uploadFile(file: File) {
    setIsUploading(true);
    setError(null);

    try {
      // Validate size/type and convert iPhone HEIC/HEIF photos to JPEG first,
      // so the canvas + AI steps below receive a browser-readable image.
      setStatus(isHeic(file) ? "Converting iPhone photo..." : "Preparing photo...");
      const readyFile = await prepareImageFile(file);

      setStatus("Removing background...");
      const cleanedFile = await removeSimpleBackground(readyFile);
      const formData = new FormData();
      formData.append("image", cleanedFile);

      setStatus("Categorizing this piece...");
      const response = await fetch("/api/ai/categorize-item", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      setItems((current) => [payload.item, ...current]);
      setStatus("Saved to your wardrobe.");
      window.setTimeout(() => setStatus(null), 1800);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload this clothing item."
      );
      setStatus(null);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
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
    if (!file || isUploading) return;
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
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 size={19} aria-hidden="true" className="spin" />
          ) : (
            <UploadCloud size={19} aria-hidden="true" />
          )}
        </button>
        <strong>
          {isUploading ? status ?? "Working..." : "Drop a clothing photograph here"}
        </strong>
        <span>or click to browse - PNG, JPG, WebP, or HEIC up to 10 MB</span>
        <button
          type="button"
          className="take-photo-btn"
          disabled={isUploading}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera size={14} aria-hidden="true" />
          Take Photo
        </button>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}
      {status && !isUploading ? <p className="inline-success">{status}</p> : null}

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

      {groupedItems.length ? (
        <div className="wardrobe-groups">
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

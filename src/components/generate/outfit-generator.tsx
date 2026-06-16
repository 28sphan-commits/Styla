"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Save, Sparkles } from "lucide-react";
import {
  moodLabels,
  occasionLabels,
  outfitMoods,
  outfitOccasions,
  outfitWeather,
  weatherLabels,
  type GeneratedLookWithItems,
  type OutfitInput
} from "@/lib/outfits/schema";
import { titleCase, type WardrobeItem } from "@/lib/wardrobe/schema";

type OutfitGeneratorProps = {
  wardrobeItems: WardrobeItem[];
};

const defaultSelections: OutfitInput = {
  occasion: "casual",
  mood: "confident",
  weather: "mild"
};

export function OutfitGenerator({ wardrobeItems }: OutfitGeneratorProps) {
  const [selections, setSelections] = useState<OutfitInput>(defaultSelections);
  const [looks, setLooks] = useState<GeneratedLookWithItems[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const canGenerate = wardrobeItems.length > 0;

  const itemCountLabel = useMemo(
    () => `${wardrobeItems.length} ${wardrobeItems.length === 1 ? "piece" : "pieces"}`,
    [wardrobeItems.length]
  );

  async function generateOutfits() {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/generate-outfits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(selections)
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not generate outfits.");
      }

      setLooks(payload.looks);
      setSavedIds(new Set());
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Could not generate outfits."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveLook(look: GeneratedLookWithItems, index: number) {
    setError(null);
    const response = await fetch("/api/outfits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...selections,
        title: look.title,
        description: look.description,
        itemIds: look.items.map((item) => item.id)
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Could not save this outfit.");
      return;
    }

    setSavedIds((current) => new Set([...current, index]));
  }

  return (
    <section className="generate-page page-shell">
      <div className="section-kicker">Create</div>
      <div className="generate-heading">
        <div>
          <h1>Generate Outfit</h1>
          <p>
            Pick the vibe. Styla uses your wardrobe, Style DNA, and saved looks
            to create three wearable combinations.
          </p>
        </div>
        <span>{itemCountLabel}</span>
      </div>

      <div className="rule" />

      <div className="generator-panel">
        <ChoiceGroup
          label="Occasion"
          options={outfitOccasions}
          labels={occasionLabels}
          value={selections.occasion}
          onChange={(value) =>
            setSelections((current) => ({ ...current, occasion: value }))
          }
        />
        <ChoiceGroup
          label="Mood"
          options={outfitMoods}
          labels={moodLabels}
          value={selections.mood}
          onChange={(value) =>
            setSelections((current) => ({ ...current, mood: value }))
          }
        />
        <ChoiceGroup
          label="Weather"
          options={outfitWeather}
          labels={weatherLabels}
          value={selections.weather}
          onChange={(value) =>
            setSelections((current) => ({ ...current, weather: value }))
          }
        />
      </div>

      <button
        className="generate-action"
        type="button"
        disabled={!canGenerate || isGenerating}
        onClick={() => void generateOutfits()}
      >
        {isGenerating ? (
          <Loader2 size={15} className="spin" aria-hidden="true" />
        ) : (
          <Sparkles size={15} aria-hidden="true" />
        )}
        {isGenerating ? "Generating..." : looks.length ? "Regenerate" : "Generate Outfits"}
      </button>

      {!canGenerate ? (
        <p className="inline-error">Add at least one item to your wardrobe first.</p>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}

      {looks.length ? (
        <div className="looks-grid">
          {looks.map((look, index) => (
            <article className="look-card" key={`${look.title}-${index}`}>
              <div className="look-card-header">
                <h2>{look.title || `Look 0${index + 1}`}</h2>
                <span>
                  {look.items.length} {look.items.length === 1 ? "piece" : "pieces"}
                </span>
              </div>

              <div className="look-items">
                {look.items.map((item) => (
                  <figure key={item.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.name} />
                    <figcaption>{item.name}</figcaption>
                  </figure>
                ))}
              </div>

              <p>{look.description}</p>

              <div className="look-tags">
                <span>{occasionLabels[selections.occasion]}</span>
                <span>{moodLabels[selections.mood]}</span>
                <span>{weatherLabels[selections.weather]}</span>
                {look.items.slice(0, 2).map((item) => (
                  <span key={`${look.title}-${item.id}`}>{titleCase(item.type[0])}</span>
                ))}
              </div>

              <button
                className="save-look"
                type="button"
                disabled={savedIds.has(index)}
                onClick={() => void saveLook(look, index)}
              >
                {savedIds.has(index) ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Save size={13} aria-hidden="true" />
                )}
                {savedIds.has(index) ? "Saved" : "Save Outfit"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ChoiceGroup<T extends string>({
  label,
  options,
  labels,
  value,
  onChange
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="generator-choice-row">
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "filter-chip is-active" : "filter-chip"}
            onClick={() => onChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { BodySilhouette } from "@/components/fit/body-silhouette";
import {
  canonicalFrom,
  onlyDigits,
  switchUnitState,
  type BodyType,
  type MeasureState,
  type MeasurementUnit
} from "@/lib/fit/measurements";

type MeasurementFieldsProps = {
  value: MeasureState;
  onChange: (next: MeasureState) => void;
  bodyType?: BodyType | null;
  hint?: string;
  // The live silhouette preview is great for onboarding but too large for the
  // compact profile editor — pass false to hide it.
  showPreview?: boolean;
};

// Controlled height/weight editor with an Imperial/Metric toggle and an optional
// live silhouette preview. Shared by onboarding and the profile editor; parents
// own the MeasureState and decide how to submit the canonical values.
export function MeasurementFields({
  value,
  onChange,
  bodyType,
  hint,
  showPreview = true
}: MeasurementFieldsProps) {
  const canonical = useMemo(() => canonicalFrom(value), [value]);

  function setField(field: keyof Omit<MeasureState, "unit">, raw: string) {
    onChange({ ...value, [field]: onlyDigits(raw) });
  }

  function switchUnit(unit: MeasurementUnit) {
    onChange(switchUnitState(value, unit));
  }

  return (
    <div className={showPreview ? "measure-step" : "measure-step measure-compact"}>
      <div className="measure-fields">
        <div className="unit-toggle" role="group" aria-label="Measurement units">
          <button
            type="button"
            className={value.unit === "imperial" ? "is-active" : undefined}
            onClick={() => switchUnit("imperial")}
          >
            Imperial
          </button>
          <button
            type="button"
            className={value.unit === "metric" ? "is-active" : undefined}
            onClick={() => switchUnit("metric")}
          >
            Metric
          </button>
        </div>

        {value.unit === "imperial" ? (
          <>
            <label className="measure-label">
              <span>Height</span>
              <div className="measure-pair">
                <input
                  inputMode="numeric"
                  placeholder="5"
                  value={value.feet}
                  onChange={(e) => setField("feet", e.target.value)}
                />
                <em>ft</em>
                <input
                  inputMode="numeric"
                  placeholder="9"
                  value={value.inches}
                  onChange={(e) => setField("inches", e.target.value)}
                />
                <em>in</em>
              </div>
            </label>
            <label className="measure-label">
              <span>Weight</span>
              <div className="measure-pair">
                <input
                  inputMode="numeric"
                  placeholder="150"
                  value={value.pounds}
                  onChange={(e) => setField("pounds", e.target.value)}
                />
                <em>lb</em>
              </div>
            </label>
          </>
        ) : (
          <>
            <label className="measure-label">
              <span>Height</span>
              <div className="measure-pair">
                <input
                  inputMode="numeric"
                  placeholder="175"
                  value={value.cm}
                  onChange={(e) => setField("cm", e.target.value)}
                />
                <em>cm</em>
              </div>
            </label>
            <label className="measure-label">
              <span>Weight</span>
              <div className="measure-pair">
                <input
                  inputMode="numeric"
                  placeholder="68"
                  value={value.kg}
                  onChange={(e) => setField("kg", e.target.value)}
                />
                <em>kg</em>
              </div>
            </label>
          </>
        )}

        {hint ? <small className="measure-hint">{hint}</small> : null}
      </div>

      {showPreview ? (
        <div className="measure-preview">
          <BodySilhouette
            heightCm={canonical.heightCm}
            weightKg={canonical.weightKg}
            bodyType={bodyType ?? null}
          />
          <span>Live preview</span>
        </div>
      ) : null}
    </div>
  );
}

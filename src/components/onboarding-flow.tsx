"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  onboardingSteps,
  type ChoiceStep,
  type FreetextStep,
  type FreewriteKey,
  type StyleDna
} from "@/lib/onboarding";
import { BodySilhouette } from "@/components/fit/body-silhouette";
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  type BodyType,
  type MeasurementUnit
} from "@/lib/fit/measurements";

export type InitialMeasurements = {
  heightCm: number | null;
  weightKg: number | null;
  unit: MeasurementUnit;
};

type OnboardingFlowProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: Partial<StyleDna>;
  initialFreewrite?: Partial<Record<FreewriteKey, string>>;
  initialMeasurements?: InitialMeasurements;
};

type AnswerKey = keyof StyleDna;

// Display-unit field state. Both unit sets stay populated so toggling units
// carries values over without a round-trip through the form.
type MeasureState = {
  unit: MeasurementUnit;
  feet: string;
  inches: string;
  pounds: string;
  cm: string;
  kg: string;
};

const emptyAnswers: Partial<StyleDna> = {};
const emptyFreewrite: Partial<Record<FreewriteKey, string>> = {};

function buildMeasureState(initial?: InitialMeasurements): MeasureState {
  const unit = initial?.unit ?? "imperial";
  const heightCm = initial?.heightCm ?? null;
  const weightKg = initial?.weightKg ?? null;
  const fi = heightCm != null ? cmToFeetInches(heightCm) : null;
  return {
    unit,
    feet: fi ? String(fi.feet) : "",
    inches: fi ? String(fi.inches) : "",
    pounds: weightKg != null ? String(Math.round(kgToLb(weightKg))) : "",
    cm: heightCm != null ? String(Math.round(heightCm)) : "",
    kg: weightKg != null ? String(Math.round(weightKg)) : ""
  };
}

// Derives canonical metric values from whichever unit is active.
function canonicalFrom(m: MeasureState): {
  heightCm: number | null;
  weightKg: number | null;
} {
  if (m.unit === "imperial") {
    const ft = parseFloat(m.feet);
    const inch = parseFloat(m.inches);
    const lb = parseFloat(m.pounds);
    const heightCm = m.feet && !isNaN(ft)
      ? feetInchesToCm(ft, isNaN(inch) ? 0 : inch)
      : null;
    return {
      heightCm,
      weightKg: m.pounds && !isNaN(lb) ? lbToKg(lb) : null
    };
  }
  const cm = parseFloat(m.cm);
  const kg = parseFloat(m.kg);
  return {
    heightCm: m.cm && !isNaN(cm) ? cm : null,
    weightKg: m.kg && !isNaN(kg) ? kg : null
  };
}

const onlyDigits = (value: string) => value.replace(/[^\d]/g, "").slice(0, 3);

export function OnboardingFlow({
  action,
  initialValues = emptyAnswers,
  initialFreewrite = emptyFreewrite,
  initialMeasurements
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<StyleDna>>(initialValues);
  const [freewrite, setFreewrite] =
    useState<Partial<Record<FreewriteKey, string>>>(initialFreewrite);
  const [measure, setMeasure] = useState<MeasureState>(() =>
    buildMeasureState(initialMeasurements)
  );
  const [isPending, startTransition] = useTransition();

  const currentStep = onboardingSteps[stepIndex];
  const isChoiceStep = currentStep.type === "choice";
  const selectedValue = isChoiceStep
    ? answers[currentStep.key as AnswerKey]
    : undefined;
  // Choice steps require a selection; freewrite and measure steps are skippable.
  const canContinue = isChoiceStep ? Boolean(selectedValue) : true;
  const progress = Math.round(((stepIndex + 1) / onboardingSteps.length) * 100);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const canonical = useMemo(() => canonicalFrom(measure), [measure]);

  // Hidden inputs cover the choice steps so each selection submits with the form.
  const hiddenChoiceFields = useMemo(
    () =>
      onboardingSteps
        .filter((step): step is ChoiceStep => step.type === "choice")
        .map((step) => ({
          key: step.key,
          value: answers[step.key as AnswerKey] ?? ""
        })),
    [answers]
  );

  // Every freewrite step also submits via its own hidden input, so any field is
  // saved no matter which step triggers the final submit.
  const freewriteSteps = useMemo(
    () =>
      onboardingSteps.filter(
        (step): step is FreetextStep => step.type === "freewrite"
      ),
    []
  );

  function chooseAnswer(key: AnswerKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function setFreewriteValue(key: FreewriteKey, value: string) {
    setFreewrite((current) => ({ ...current, [key]: value }));
  }

  function setMeasureField(field: keyof Omit<MeasureState, "unit">, value: string) {
    setMeasure((current) => ({ ...current, [field]: onlyDigits(value) }));
  }

  // Switching units recomputes the target fields from the current canonical
  // values, so a height/weight typed in one system survives the toggle.
  function switchUnit(unit: MeasurementUnit) {
    setMeasure((current) => {
      if (current.unit === unit) return current;
      const { heightCm, weightKg } = canonicalFrom(current);
      const fi = heightCm != null ? cmToFeetInches(heightCm) : null;
      return {
        unit,
        feet: fi ? String(fi.feet) : "",
        inches: fi ? String(fi.inches) : "",
        pounds: weightKg != null ? String(Math.round(kgToLb(weightKg))) : "",
        cm: heightCm != null ? String(Math.round(heightCm)) : "",
        kg: weightKg != null ? String(Math.round(weightKg)) : ""
      };
    });
  }

  function submit(formData: FormData) {
    startTransition(() => {
      void action(formData);
    });
  }

  const currentFreewriteValue =
    currentStep.type === "freewrite" ? freewrite[currentStep.key] ?? "" : "";

  return (
    <form className="onboarding-form" action={submit}>
      {hiddenChoiceFields.map((field) => (
        <input key={field.key} type="hidden" name={field.key} value={field.value} />
      ))}
      {freewriteSteps.map((step) => (
        <input
          key={step.key}
          type="hidden"
          name={step.key}
          value={freewrite[step.key] ?? ""}
        />
      ))}
      <input
        type="hidden"
        name="height_cm"
        value={canonical.heightCm != null ? canonical.heightCm.toFixed(1) : ""}
      />
      <input
        type="hidden"
        name="weight_kg"
        value={canonical.weightKg != null ? canonical.weightKg.toFixed(1) : ""}
      />
      <input type="hidden" name="measurement_unit" value={measure.unit} />

      <div className="onboarding-brand">Styla</div>
      <p className="onboarding-chapter">{currentStep.eyebrow}</p>

      <div className="progress-row">
        <span>Question {stepIndex + 1} of {onboardingSteps.length}</span>
        <div className="progress-track" aria-hidden="true">
          {onboardingSteps.map((step, index) => (
            <span key={step.key} className={index <= stepIndex ? "is-active" : undefined} />
          ))}
        </div>
        <span>{progress}%</span>
      </div>

      <h1>{currentStep.question}</h1>

      {currentStep.type === "choice" ? (
        <div className="option-grid">
          {currentStep.options.map((option) => (
            <button
              className={
                option.value === selectedValue ? "choice-card is-selected" : "choice-card"
              }
              type="button"
              key={option.value}
              onClick={() => chooseAnswer(currentStep.key as AnswerKey, option.value)}
            >
              <span className="choice-mark">{option.mark}</span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.detail}</small>
              </span>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : currentStep.type === "measure" ? (
        <div className="measure-step">
          <div className="measure-fields">
            <div className="unit-toggle" role="group" aria-label="Measurement units">
              <button
                type="button"
                className={measure.unit === "imperial" ? "is-active" : undefined}
                onClick={() => switchUnit("imperial")}
              >
                Imperial
              </button>
              <button
                type="button"
                className={measure.unit === "metric" ? "is-active" : undefined}
                onClick={() => switchUnit("metric")}
              >
                Metric
              </button>
            </div>

            {measure.unit === "imperial" ? (
              <>
                <label className="measure-label">
                  <span>Height</span>
                  <div className="measure-pair">
                    <input
                      inputMode="numeric"
                      placeholder="5"
                      value={measure.feet}
                      onChange={(e) => setMeasureField("feet", e.target.value)}
                    />
                    <em>ft</em>
                    <input
                      inputMode="numeric"
                      placeholder="9"
                      value={measure.inches}
                      onChange={(e) => setMeasureField("inches", e.target.value)}
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
                      value={measure.pounds}
                      onChange={(e) => setMeasureField("pounds", e.target.value)}
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
                      value={measure.cm}
                      onChange={(e) => setMeasureField("cm", e.target.value)}
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
                      value={measure.kg}
                      onChange={(e) => setMeasureField("kg", e.target.value)}
                    />
                    <em>kg</em>
                  </div>
                </label>
              </>
            )}

            <small className="measure-hint">{currentStep.hint}</small>
          </div>

          <div className="measure-preview">
            <BodySilhouette
              heightCm={canonical.heightCm}
              weightKg={canonical.weightKg}
              bodyType={(answers.body_type as BodyType | undefined) ?? null}
            />
            <span>Live preview</span>
          </div>
        </div>
      ) : (
        <div className="freewrite-field">
          <textarea
            placeholder={currentStep.placeholder}
            maxLength={currentStep.maxLength}
            value={currentFreewriteValue}
            onChange={(e) => setFreewriteValue(currentStep.key, e.target.value)}
          />
          <small>
            {currentFreewriteValue.length}/{currentStep.maxLength} · {currentStep.hint}
          </small>
        </div>
      )}

      <div className="onboarding-controls">
        {stepIndex > 0 ? (
          <button
            className="ghost-round"
            type="button"
            onClick={() => setStepIndex((v) => v - 1)}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back
          </button>
        ) : (
          <span />
        )}

        {isLastStep ? (
          <button
            className="next-round"
            type="submit"
            disabled={!canContinue || isPending}
          >
            {isPending ? "Saving" : "Finish"}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        ) : (
          <button
            className="next-round"
            type="button"
            disabled={!canContinue}
            onClick={() => setStepIndex((v) => v + 1)}
          >
            Next
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}

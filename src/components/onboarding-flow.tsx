"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  genderOptions,
  onboardingSteps,
  styleCategoryKeys,
  type FreetextStep,
  type FreewriteKey,
  type StyleDna
} from "@/lib/onboarding";
import { MeasurementFields } from "@/components/fit/measurement-fields";
import {
  buildMeasureState,
  canonicalFrom,
  type BodyType,
  type InitialMeasurements,
  type MeasureState
} from "@/lib/fit/measurements";

type OnboardingFlowProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: Partial<StyleDna>;
  initialFreewrite?: Partial<Record<FreewriteKey, string>>;
  initialMeasurements?: InitialMeasurements;
};

type Selections = Record<string, string[]>;

const emptyAnswers: Partial<StyleDna> = {};
const emptyFreewrite: Partial<Record<FreewriteKey, string>> = {};

// value -> display label, so saved gender reads as "Man, Non-binary/Bi".
const genderLabelByValue = new Map<string, string>(
  genderOptions.map((o) => [o.value, o.label])
);

export function OnboardingFlow({
  action,
  initialValues = emptyAnswers,
  initialFreewrite = emptyFreewrite,
  initialMeasurements
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  // One array of chosen values per category key (multi-select). Seeded from any
  // previously-saved scalar answers.
  const [selections, setSelections] = useState<Selections>(() => {
    const seed: Selections = {};
    for (const key of styleCategoryKeys) {
      const value = initialValues[key];
      if (value) seed[key] = [value];
    }
    return seed;
  });
  const [freewrite, setFreewrite] =
    useState<Partial<Record<FreewriteKey, string>>>(initialFreewrite);
  const [measure, setMeasure] = useState<MeasureState>(() =>
    buildMeasureState(initialMeasurements)
  );
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const currentStep = onboardingSteps[stepIndex];
  const isChoiceStep = currentStep.type === "choice";
  const selectedValues = selections[currentStep.key] ?? [];
  // Choice steps require at least one selection; freewrite and measure are skippable.
  const canContinue = isChoiceStep ? selectedValues.length > 0 : true;
  const progress = Math.round(((stepIndex + 1) / onboardingSteps.length) * 100);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const canonical = useMemo(() => canonicalFrom(measure), [measure]);

  // Gender submits as a comma-joined label string into its free-text column.
  const genderHiddenValue = useMemo(
    () =>
      (selections.gender ?? [])
        .map((value) => genderLabelByValue.get(value) ?? value)
        .join(", "),
    [selections]
  );

  const freewriteSteps = useMemo(
    () =>
      onboardingSteps.filter(
        (step): step is FreetextStep => step.type === "freewrite"
      ),
    []
  );

  function toggleOption(key: string, value: string) {
    setSelections((current) => {
      const chosen = current[key] ?? [];
      const next = chosen.includes(value)
        ? chosen.filter((v) => v !== value)
        : [...chosen, value];
      return { ...current, [key]: next };
    });
  }

  function setFreewriteValue(key: FreewriteKey, value: string) {
    setFreewrite((current) => ({ ...current, [key]: value }));
  }

  // The ONLY path that submits onboarding: an explicit click on Finish. The form
  // never submits implicitly (onSubmit is prevented), so pressing Enter in a
  // field or advancing to the last step can't auto-complete the survey.
  function handleFinish() {
    if (!isLastStep || isPending || !formRef.current) return;
    const formData = new FormData(formRef.current);
    startTransition(() => {
      void action(formData);
    });
  }

  const currentFreewriteValue =
    currentStep.type === "freewrite" ? freewrite[currentStep.key] ?? "" : "";

  return (
    <form
      ref={formRef}
      className="onboarding-form"
      onSubmit={(event) => event.preventDefault()}
    >
      {/* Scalar (first pick) + full multi-select tags for each style category. */}
      {styleCategoryKeys.map((key) => {
        const chosen = selections[key] ?? [];
        return (
          <span key={key}>
            <input type="hidden" name={key} value={chosen[0] ?? ""} />
            <input type="hidden" name={`${key}_tags`} value={chosen.join(",")} />
          </span>
        );
      })}
      <input type="hidden" name="gender" value={genderHiddenValue} />
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
        <>
          <p className="option-hint">Select all that apply.</p>
          <div className="option-grid">
            {currentStep.options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <button
                  className={isSelected ? "choice-card is-selected" : "choice-card"}
                  type="button"
                  aria-pressed={isSelected}
                  key={option.value}
                  onClick={() => toggleOption(currentStep.key, option.value)}
                >
                  <span className="choice-mark">{option.mark}</span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </span>
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </>
      ) : currentStep.type === "measure" ? (
        <MeasurementFields
          value={measure}
          onChange={setMeasure}
          bodyType={(selections.body_type?.[0] as BodyType | undefined) ?? null}
          hint={currentStep.hint}
        />
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
            type="button"
            disabled={!canContinue || isPending}
            onClick={handleFinish}
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

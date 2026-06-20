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

type OnboardingFlowProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: Partial<StyleDna>;
  initialFreewrite?: Partial<Record<FreewriteKey, string>>;
};

type AnswerKey = keyof StyleDna;

const emptyAnswers: Partial<StyleDna> = {};
const emptyFreewrite: Partial<Record<FreewriteKey, string>> = {};

export function OnboardingFlow({
  action,
  initialValues = emptyAnswers,
  initialFreewrite = emptyFreewrite
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<StyleDna>>(initialValues);
  const [freewrite, setFreewrite] =
    useState<Partial<Record<FreewriteKey, string>>>(initialFreewrite);
  const [isPending, startTransition] = useTransition();

  const currentStep = onboardingSteps[stepIndex];
  const isChoiceStep = currentStep.type === "choice";
  const selectedValue = isChoiceStep
    ? answers[currentStep.key as AnswerKey]
    : undefined;
  // Choice steps require a selection; freewrite steps are always skippable.
  const canContinue = isChoiceStep ? Boolean(selectedValue) : true;
  const progress = Math.round(((stepIndex + 1) / onboardingSteps.length) * 100);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

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

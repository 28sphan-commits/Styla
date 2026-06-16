"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { onboardingSteps, type StyleDna } from "@/lib/onboarding";

type OnboardingFlowProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: Partial<StyleDna>;
};

type AnswerKey = keyof StyleDna;

const emptyAnswers: Partial<StyleDna> = {};

export function OnboardingFlow({
  action,
  initialValues = emptyAnswers
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<StyleDna>>(initialValues);
  const [isPending, startTransition] = useTransition();
  const currentStep = onboardingSteps[stepIndex];
  const currentKey = currentStep.key as AnswerKey;
  const selectedValue = answers[currentKey];
  const progress = Math.round(((stepIndex + 1) / onboardingSteps.length) * 100);
  const canContinue = Boolean(selectedValue);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  const hiddenFields = useMemo(
    () =>
      onboardingSteps.map((step) => ({
        key: step.key,
        value: answers[step.key as AnswerKey] ?? ""
      })),
    [answers]
  );

  function chooseAnswer(key: AnswerKey, value: string) {
    setAnswers((current) => ({
      ...current,
      [key]: value
    }));
  }

  function submit(formData: FormData) {
    startTransition(() => {
      void action(formData);
    });
  }

  return (
    <form className="onboarding-form" action={submit}>
      {hiddenFields.map((field) => (
        <input
          key={field.key}
          type="hidden"
          name={field.key}
          value={field.value}
        />
      ))}

      <div className="onboarding-brand">Styla</div>
      <p className="onboarding-chapter">{currentStep.eyebrow}</p>

      <div className="progress-row">
        <span>Question {stepIndex + 1} of {onboardingSteps.length}</span>
        <div className="progress-track" aria-hidden="true">
          {onboardingSteps.map((step, index) => (
            <span
              key={step.key}
              className={index <= stepIndex ? "is-active" : undefined}
            />
          ))}
        </div>
        <span>{progress}%</span>
      </div>

      <h1>{currentStep.question}</h1>

      <div className="option-grid">
        {currentStep.options.map((option) => (
          <button
            className={
              option.value === selectedValue
                ? "choice-card is-selected"
                : "choice-card"
            }
            type="button"
            key={option.value}
            onClick={() => chooseAnswer(currentKey, option.value)}
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

      <div className="onboarding-controls">
        {stepIndex > 0 ? (
          <button
            className="ghost-round"
            type="button"
            onClick={() => setStepIndex((value) => value - 1)}
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
            onClick={() => setStepIndex((value) => value + 1)}
          >
            Next
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}

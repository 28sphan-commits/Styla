"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { onboardingSteps, type ChoiceStep, type StyleDna } from "@/lib/onboarding";

type OnboardingFlowProps = {
  action: (formData: FormData) => void | Promise<void>;
  initialValues?: Partial<StyleDna>;
  initialStyleNotes?: string;
};

type AnswerKey = keyof StyleDna;

const emptyAnswers: Partial<StyleDna> = {};

export function OnboardingFlow({
  action,
  initialValues = emptyAnswers,
  initialStyleNotes = ""
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<StyleDna>>(initialValues);
  const [styleNotes, setStyleNotes] = useState(initialStyleNotes);
  const [isPending, startTransition] = useTransition();

  const currentStep = onboardingSteps[stepIndex];
  const isChoiceStep = currentStep.type === "choice";
  const selectedValue = isChoiceStep
    ? answers[currentStep.key as AnswerKey]
    : undefined;
  const canContinue = isChoiceStep ? Boolean(selectedValue) : true;
  const progress = Math.round(((stepIndex + 1) / onboardingSteps.length) * 100);
  const isLastStep = stepIndex === onboardingSteps.length - 1;

  // Hidden inputs only cover the 5 choice steps — style_notes is the live textarea.
  const hiddenFields = useMemo(
    () =>
      onboardingSteps
        .filter((step): step is ChoiceStep => step.type === "choice")
        .map((step) => ({
          key: step.key,
          value: answers[step.key as AnswerKey] ?? ""
        })),
    [answers]
  );

  function chooseAnswer(key: AnswerKey, value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function submit(formData: FormData) {
    startTransition(() => {
      void action(formData);
    });
  }

  return (
    <form className="onboarding-form" action={submit}>
      {hiddenFields.map((field) => (
        <input key={field.key} type="hidden" name={field.key} value={field.value} />
      ))}
      {/* style_notes is always included so the action can save it on any submit */}
      <input type="hidden" name="style_notes" value={styleNotes} />

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

      {isChoiceStep ? (
        <div className="option-grid">
          {(currentStep as ChoiceStep).options.map((option) => (
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
            placeholder={currentStep.type === "freewrite" ? currentStep.placeholder : ""}
            maxLength={1200}
            value={styleNotes}
            onChange={(e) => setStyleNotes(e.target.value)}
          />
          <small>{styleNotes.length}/1200 · Optional — you can skip this and come back later</small>
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

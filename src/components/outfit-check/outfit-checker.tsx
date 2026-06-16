"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Sparkles, UploadCloud } from "lucide-react";
import {
  styleGoalLabels,
  styleGoals,
  type OutfitCheckResult,
  type StyleGoal
} from "@/lib/outfit-check/schema";

export function OutfitChecker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [styleGoal, setStyleGoal] = useState<StyleGoal>("casual");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OutfitCheckResult | null>(null);

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    setFile(nextFile);
    setResult(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
  }

  async function checkOutfit() {
    if (!file) {
      setError("Upload an outfit photo first.");
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("styleGoal", styleGoal);

      const response = await fetch("/api/ai/outfit-check", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not check this outfit.");
      }

      setResult(payload.result);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Could not check this outfit."
      );
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <section className="outfit-check-page page-shell">
      <div className="section-kicker">The Critique</div>
      <div className="check-heading">
        <div>
          <h1>Outfit Check</h1>
          <p>
            Upload a mirror or full-body photo. Styla scores the look against
            your goal and gives direct styling notes.
          </p>
        </div>
        <span>Max 10MB</span>
      </div>

      <div className="rule" />

      <div className="check-panel">
        <div className="generator-choice-row">
          <span>Style Goal</span>
          <div>
            {styleGoals.map((goal) => (
              <button
                key={goal}
                type="button"
                className={styleGoal === goal ? "filter-chip is-active" : "filter-chip"}
                onClick={() => setStyleGoal(goal)}
              >
                {styleGoalLabels[goal]}
              </button>
            ))}
          </div>
        </div>

        <div
          className={isDragging ? "check-upload is-dragging" : "check-upload"}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            selectFile(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />

          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Uploaded outfit preview" />
          ) : (
            <div className="check-empty-upload">
              <Camera size={22} aria-hidden="true" />
              <strong>Upload your outfit photograph</strong>
              <span>Snap a mirror pic or full-body photo</span>
            </div>
          )}

          <button
            type="button"
            className="upload-button"
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        className="generate-action"
        type="button"
        disabled={isChecking || !file}
        onClick={() => void checkOutfit()}
      >
        {isChecking ? (
          <Loader2 size={15} className="spin" aria-hidden="true" />
        ) : (
          <Sparkles size={15} aria-hidden="true" />
        )}
        {isChecking ? "Checking..." : "Check Outfit"}
      </button>

      {error ? <p className="inline-error">{error}</p> : null}

      {result ? (
        <section className="check-results" aria-labelledby="check-results-title">
          <div className="score-card">
            <span>Score</span>
            <strong>{result.score}</strong>
            <small>/100</small>
          </div>
          <article className="check-summary">
            <h2 id="check-results-title">The read</h2>
            <p>{result.summary}</p>
            <div className="note-grid">
              <NoteList title="Working" notes={result.strengths} />
              <NoteList title="Adjust" notes={result.fixes} />
            </div>
            <div className="detail-notes">
              <p>
                <strong>Color:</strong> {result.colorNotes}
              </p>
              <p>
                <strong>Fit:</strong> {result.fitNotes}
              </p>
            </div>
            {result.missingPieces.length ? (
              <div className="missing-pieces">
                <strong>Could add</strong>
                <div>
                  {result.missingPieces.map((piece) => (
                    <span key={piece}>{piece}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </article>
        </section>
      ) : null}
    </section>
  );
}

function NoteList({ title, notes }: { title: string; notes: string[] }) {
  return (
    <div className="note-list">
      <h3>{title}</h3>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

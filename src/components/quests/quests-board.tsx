"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Shirt, SkipForward, Sparkles, Target, Zap } from "lucide-react";
import { QUESTS, questAura } from "@/lib/quests/catalog";
import type { QuestState } from "@/lib/quests/loader";

type QuestsBoardProps = {
  state: QuestState;
  tier: string;
};

export function QuestsBoard({ state, tier }: QuestsBoardProps) {
  const router = useRouter();
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFree = tier === "free";
  const completedKeys = new Set(state.completed.map((entry) => entry.quest.key));
  const activeKey = state.active?.quest.key ?? null;
  const bonusPct = Math.round((state.bonusSlots / state.totalBonus) * 100);

  async function handleSkip() {
    setSkipping(true);
    setError(null);
    try {
      const res = await fetch("/api/quests/skip", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not skip this quest.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip this quest.");
    } finally {
      setSkipping(false);
    }
  }

  return (
    <section className="page-shell quests-page">
      <div className="section-kicker">Styla Quests</div>
      <div className="quests-heading">
        <div>
          <h1>Quests</h1>
          <p>
            Complete quests to earn extra wardrobe upload slots — free members
            start at {state.baseUploads} and can unlock up to{" "}
            {state.baseUploads + state.totalBonus}.
          </p>
        </div>
      </div>

      {!state.persisted ? (
        <div className="quests-notice">
          <Sparkles size={15} aria-hidden="true" />
          <span>
            Quests aren&apos;t active yet — apply the quests migration to start
            tracking progress and earning slots. This is a preview of the catalog.
          </span>
        </div>
      ) : null}

      <div className="quests-summary">
        <div className="quests-meter-card">
          <div className="quests-meter-top">
            <span className="quests-meter-label">
              <Shirt size={14} aria-hidden="true" />
              Wardrobe slots unlocked
            </span>
            <strong>
              {state.uploadCap}
              {isFree ? <span> / {state.baseUploads + state.totalBonus}</span> : null}
            </strong>
          </div>
          <div className="quests-progress">
            <span style={{ width: `${bonusPct}%` }} />
          </div>
          <small>
            {isFree
              ? `+${state.bonusSlots} of ${state.totalBonus} bonus slots earned`
              : "You're on a paid plan with unlimited uploads — quests are just for fun."}
          </small>
        </div>

        <div className="quests-meter-card">
          <div className="quests-meter-top">
            <span className="quests-meter-label">
              <Zap size={14} aria-hidden="true" />
              Aura points
            </span>
            <strong>{state.auraPoints.toLocaleString()}</strong>
          </div>
          <span className={`aura-rate-badge tier-${tier}`}>
            <Zap size={11} aria-hidden="true" />×{state.auraMultiplier} aura rate
          </span>
          <small>
            {tier === "free"
              ? "Upgrade to Pro (×3) or Elite (×5) to earn aura faster and climb the leaderboard."
              : `Your ${tier} plan earns ${state.auraMultiplier}× the aura of a free member for the same quest.`}
          </small>
        </div>

        <div className="quests-skip-card">
          <div className="quests-meter-top">
            <span className="quests-meter-label">
              <SkipForward size={14} aria-hidden="true" />
              Skips left
            </span>
            <strong>{state.skipsRemaining}</strong>
          </div>
          <button
            type="button"
            className="small-dark-button"
            disabled={!state.canSkip || skipping || !state.persisted}
            onClick={handleSkip}
          >
            <SkipForward size={13} aria-hidden="true" />
            {skipping ? "Skipping…" : "Skip current quest"}
          </button>
          <small>
            {state.skipsRemaining <= 0
              ? "No skips remaining."
              : state.nextSkipAt
                ? `Next skip available ${new Date(state.nextSkipAt).toLocaleDateString()}.`
                : "You can skip a quest once every 2 days. Skipping forfeits its reward."}
          </small>
          {error ? <p className="inline-error">{error}</p> : null}
        </div>
      </div>

      <div className="rule" />

      {state.allComplete ? (
        <div className="quests-notice quests-done">
          <Check size={15} aria-hidden="true" />
          <span>All quests complete — you&apos;ve unlocked every bonus slot. Nice work!</span>
        </div>
      ) : null}

      <div className="quests-list">
        {QUESTS.map((quest) => {
          const isCompleted = completedKeys.has(quest.key);
          const isActive = quest.key === activeKey;
          const progress = isActive ? (state.active?.progress ?? 0) : 0;
          const status = isCompleted ? "completed" : isActive ? "active" : "locked";

          return (
            <article className={`quest-card is-${status}`} key={quest.key}>
              <div className="quest-card-icon">
                {isCompleted ? (
                  <Check size={16} aria-hidden="true" />
                ) : isActive ? (
                  <Target size={16} aria-hidden="true" />
                ) : (
                  <Lock size={16} aria-hidden="true" />
                )}
              </div>
              <div className="quest-card-body">
                <div className="quest-card-top">
                  <h2>{quest.title}</h2>
                  <span className="quest-rewards">
                    {isFree ? (
                      <span className="quest-reward">+{quest.reward} slots</span>
                    ) : null}
                    <span className="quest-reward is-aura">
                      <Zap size={10} aria-hidden="true" />+{questAura(quest.reward, tier)} aura
                    </span>
                  </span>
                </div>
                <p>{quest.description}</p>
                {isActive ? (
                  <div className="quest-card-progress">
                    <div className="quests-progress">
                      <span
                        style={{
                          width: `${Math.min(100, (progress / quest.target) * 100)}%`
                        }}
                      />
                    </div>
                    <small>
                      {Math.min(progress, quest.target)} / {quest.target}
                    </small>
                  </div>
                ) : isCompleted ? (
                  <span className="quest-status-tag">Completed</span>
                ) : (
                  <span className="quest-status-tag is-locked">
                    Complete earlier quests to unlock
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

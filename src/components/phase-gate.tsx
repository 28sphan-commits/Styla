import { LockKeyhole } from "lucide-react";

type PhaseGateProps = {
  kicker: string;
  title: string;
  phase: string;
};

export function PhaseGate({ kicker, title, phase }: PhaseGateProps) {
  return (
    <section className="page-shell">
      <div className="section-kicker">{kicker}</div>
      <div className="phase-gate">
        <LockKeyhole size={18} aria-hidden="true" />
        <span>{phase}</span>
      </div>
      <h1>{title}</h1>
      <div className="rule" />
      <div className="quiet-panel">
        <p>This area opens after the current approval checkpoint.</p>
      </div>
    </section>
  );
}

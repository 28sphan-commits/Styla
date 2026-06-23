// Lightweight token-usage logging for the Gemini routes.
//
// Every Gemini response carries a `usageMetadata` block with the EXACT token
// counts the call was billed on (prompt, output, and cached-input when context
// caching is on). We log one structured line per call so real per-feature costs
// can be read straight from the logs instead of estimated — grep `gemini-usage`.

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

// Per-1M-token USD rates (input / output / cached input). Keep in sync with the
// model rate card; unknown models still log token counts, just without a cost.
const PRICING: Record<string, { in: number; out: number; cachedIn: number }> = {
  "gemini-3.5-flash": { in: 1.5, out: 9.0, cachedIn: 0.15 },
  "gemini-3-flash": { in: 0.5, out: 3.0, cachedIn: 0.05 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5, cachedIn: 0.03 },
  "gemini-2.5-flash-lite": { in: 0.1, out: 0.4, cachedIn: 0.01 }
};

function estimateCostUsd(model: string, usage: GeminiUsage): number | null {
  const rate = PRICING[model];
  if (!rate) return null;
  const cached = usage.cachedContentTokenCount ?? 0;
  // promptTokenCount already includes cached tokens; bill the remainder at full
  // input rate and the cached portion at the (cheaper) cached rate.
  const billedInput = Math.max(0, (usage.promptTokenCount ?? 0) - cached);
  const output = usage.candidatesTokenCount ?? 0;
  return (billedInput * rate.in + cached * rate.cachedIn + output * rate.out) / 1_000_000;
}

/** Logs one `[gemini-usage]` line with the exact billed token counts (+ est. cost). */
export function logGeminiUsage(feature: string, model: string, data: unknown): void {
  const usage = (data as { usageMetadata?: GeminiUsage } | null)?.usageMetadata;
  if (!usage) return;
  const cost = estimateCostUsd(model, usage);
  console.info(
    `[gemini-usage] feature=${feature} model=${model} ` +
      `prompt=${usage.promptTokenCount ?? 0} ` +
      `output=${usage.candidatesTokenCount ?? 0} ` +
      `cached=${usage.cachedContentTokenCount ?? 0} ` +
      `total=${usage.totalTokenCount ?? 0}` +
      (cost != null ? ` est_cost_usd=${cost.toFixed(6)}` : "")
  );
}

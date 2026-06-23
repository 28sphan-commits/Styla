// Per-feature Gemini model selection.
//
// Each task runs on the cheapest model that does its job well, instead of every
// route defaulting to the flagship. Selection stays env-overridable so we can
// retune in prod without a deploy:
//
//   1. a feature-specific var (e.g. GEMINI_MODEL_CHAT) wins, else
//   2. the legacy global GEMINI_MODEL pins every route (back-compat), else
//   3. the tuned per-feature default below.
//
// Rationale for the defaults:
//   • categorize  → flash-lite: a closed-enum vision classifier (pick one type,
//     colors from a fixed list). The lightest model is plenty.
//   • outfitCheck → flash: bounded JSON critique over one image; needs a little
//     more reasoning than lite, far less than the flagship.
//   • generate    → flash: structured multi-look generation from the closet.
//   • chat        → 3-flash: conversational quality matters most here, but it's
//     still ~67% cheaper in/out than 3.5-flash.

function pick(featureEnv: string | undefined, fallback: string): string {
  return featureEnv ?? process.env.GEMINI_MODEL ?? fallback;
}

export const GEMINI_MODELS = {
  categorize: pick(process.env.GEMINI_MODEL_CATEGORIZE, "gemini-2.5-flash-lite"),
  outfitCheck: pick(process.env.GEMINI_MODEL_OUTFIT_CHECK, "gemini-2.5-flash"),
  generate: pick(process.env.GEMINI_MODEL_GENERATE, "gemini-2.5-flash"),
  chat: pick(process.env.GEMINI_MODEL_CHAT, "gemini-3-flash")
} as const;

export function geminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

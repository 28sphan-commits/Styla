// Global Style DNA context rule, injected into EVERY Gemini system prompt across
// the app (outfit generation, styling chat, and outfit check). It frames the
// onboarding survey data as a flexible starting point — not a rigid cage — so the
// AI adapts to the user's current direction ("style evolution").
//
// The user's Style DNA row (gender, aesthetic, body type, budget, lifestyle,
// colors, notes) is already passed alongside this rule as JSON context in each
// route, so this text tells the model how to weigh it.
export const STYLE_EVOLUTION_RULE =
  "You have access to the user's onboarding baseline (Style DNA: gender, aesthetic, body type, budget, lifestyle, colors, and notes). " +
  "Treat this data as their starting profile. However, styles change and evolve. You must prioritize the user's immediate request, recent wardrobe uploads, or current search queries over the baseline data. " +
  "If their current interaction contradicts their onboarding profile, seamlessly adapt to their new direction without rigidly restricting them to their past choices. ";

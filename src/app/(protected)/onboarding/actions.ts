"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  bodyTypeOptions,
  budgetOptions,
  colorPreferenceOptions,
  lifestyleOptions,
  measurementsSchema,
  styleAestheticOptions,
  styleDnaSchema,
  type StyleCategoryKey
} from "@/lib/onboarding";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

// Allowed values per category, used to sanitize the multi-select tag arrays.
const allowedByCategory: Record<StyleCategoryKey, Set<string>> = {
  style_aesthetic: new Set(styleAestheticOptions.map((o) => o.value)),
  body_type: new Set(bodyTypeOptions.map((o) => o.value)),
  lifestyle: new Set(lifestyleOptions.map((o) => o.value)),
  budget_per_item: new Set(budgetOptions.map((o) => o.value)),
  color_preference: new Set(colorPreferenceOptions.map((o) => o.value))
};

// Parse a "a,b,c" tag field into a deduped, allow-listed value array.
function parseTags(formData: FormData, key: StyleCategoryKey): string[] {
  const raw = (formData.get(`${key}_tags`) as string | null) ?? "";
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value && allowedByCategory[key].has(value));
  return [...new Set(values)];
}

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient();

  if (!supabase) {
    redirect("/login");
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const parsed = styleDnaSchema.safeParse({
    style_aesthetic: formData.get("style_aesthetic"),
    body_type: formData.get("body_type"),
    lifestyle: formData.get("lifestyle"),
    budget_per_item: formData.get("budget_per_item"),
    color_preference: formData.get("color_preference")
  });

  if (!parsed.success) {
    redirect("/onboarding?error=missing");
  }

  const metadata = user.user_metadata ?? {};

  await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email,
    full_name: metadata.full_name ?? metadata.name ?? null,
    avatar_url: metadata.avatar_url ?? metadata.picture ?? null,
    onboarding_completed: true,
    updated_at: new Date().toISOString()
  });

  const gender = (formData.get("gender") as string | null)?.trim() ?? "";
  const styleNotes = (formData.get("style_notes") as string | null)?.trim() ?? "";

  // Censor mild language in the freewrite fields; severe content blocks + strikes
  // (and may ban, in which case the layout/banned route takes over).
  const moderation = await enforceModeration(supabase, [
    { value: gender },
    { value: styleNotes }
  ]);
  if (!moderation.ok) {
    redirect(moderation.banned ? "/banned" : "/onboarding?error=language");
  }
  const [cleanGender, cleanNotes] = moderation.values;

  await supabase.from("style_dna").upsert({
    user_id: user.id,
    ...parsed.data,
    gender: cleanGender || null,
    style_notes: cleanNotes || null,
    updated_at: new Date().toISOString()
  });

  // Persist the full multi-select sets to the `${key}_tags` array columns. This
  // is best-effort and intentionally separate from the upsert above: before the
  // 202606240002 migration is applied the columns don't exist, and we don't want
  // a missing column to block the core scalar save. The error is ignored.
  await supabase
    .from("style_dna")
    .update({
      style_aesthetic_tags: parseTags(formData, "style_aesthetic"),
      body_type_tags: parseTags(formData, "body_type"),
      lifestyle_tags: parseTags(formData, "lifestyle"),
      budget_per_item_tags: parseTags(formData, "budget_per_item"),
      color_preference_tags: parseTags(formData, "color_preference")
    })
    .eq("user_id", user.id);

  // Measurements are optional. Only persist when the user actually entered both
  // height and weight (the schema rejects blank / partial input).
  const measurements = measurementsSchema.safeParse({
    height_cm: formData.get("height_cm"),
    weight_kg: formData.get("weight_kg"),
    measurement_unit: formData.get("measurement_unit") ?? "imperial"
  });
  if (measurements.success) {
    await supabase.from("fit_profiles").upsert({
      user_id: user.id,
      height_cm: measurements.data.height_cm,
      weight_kg: measurements.data.weight_kg,
      measurement_unit: measurements.data.measurement_unit,
      updated_at: new Date().toISOString()
    });
  }

  revalidatePath("/", "layout");
  redirect("/explore");
}

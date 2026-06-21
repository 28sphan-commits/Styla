"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { measurementsSchema, styleDnaSchema } from "@/lib/onboarding";
import { enforceModeration } from "@/lib/moderation/enforce";
import { createClient } from "@/lib/supabase/server";

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

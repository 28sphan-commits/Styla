"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { styleDnaSchema } from "@/lib/onboarding";
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

  const styleNotes = (formData.get("style_notes") as string | null)?.trim() ?? null;

  await supabase.from("style_dna").upsert({
    user_id: user.id,
    ...parsed.data,
    style_notes: styleNotes || null,
    updated_at: new Date().toISOString()
  });

  revalidatePath("/", "layout");
  redirect("/explore");
}

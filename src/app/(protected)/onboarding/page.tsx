import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "./actions";

export default async function OnboardingPage() {
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

  const { data: currentStyleDna } = await supabase
    .from("style_dna")
    .select(
      "style_aesthetic, body_type, lifestyle, budget_per_item, color_preference"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="onboarding-page">
      <OnboardingFlow
        action={saveOnboarding}
        initialValues={currentStyleDna ?? undefined}
      />
    </main>
  );
}

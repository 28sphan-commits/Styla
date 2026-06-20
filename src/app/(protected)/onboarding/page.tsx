import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "./actions";

type OnboardingPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const noticeForError: Record<string, string> = {
  missing: "Please answer every question before finishing.",
  language:
    "Your style notes contained language we don't allow. Please reword and try again."
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
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
      "style_aesthetic, body_type, lifestyle, budget_per_item, color_preference, gender, style_notes"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await searchParams;
  const notice = error ? noticeForError[error] ?? null : null;

  const initialFreewrite = {
    gender: currentStyleDna?.gender ?? "",
    style_notes: currentStyleDna?.style_notes ?? ""
  };

  return (
    <main className="onboarding-page">
      {notice ? (
        <p className="onboarding-notice" role="alert">
          {notice}
        </p>
      ) : null}
      <OnboardingFlow
        action={saveOnboarding}
        initialValues={currentStyleDna ?? undefined}
        initialFreewrite={initialFreewrite}
      />
    </main>
  );
}

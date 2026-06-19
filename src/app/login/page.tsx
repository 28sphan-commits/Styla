import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase!.auth.getUser();

    if (user) {
      redirect("/explore");
    }
  }

  const { auth } = await searchParams;

  return (
    <main className="login-page">
      <div className="login-overlay" />
      <LoginForm isConfigured={isSupabaseConfigured} oauthError={auth === "error"} />
    </main>
  );
}

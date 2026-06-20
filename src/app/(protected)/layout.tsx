import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { StylaChatWidget } from "@/components/chat/styla-chat-widget";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, email, status")
    .eq("id", user.id)
    .maybeSingle();

  // Banned users are locked out of every protected page and sent to the
  // suspension screen. (API mutations are gated separately via the moderation
  // helper, since we can't revoke the Supabase JWT without a service-role key.)
  if (profile?.status === "banned") {
    redirect("/banned");
  }

  return (
    <div className="app-frame">
      <AppHeader username={profile?.username} email={profile?.email ?? user.email} />
      <main className="app-main">{children}</main>
      <StylaChatWidget />
    </div>
  );
}

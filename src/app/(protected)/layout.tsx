import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
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
    .select("username, email")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="app-frame">
      <AppHeader username={profile?.username} email={profile?.email ?? user.email} />
      <main className="app-main">{children}</main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const APPEAL_EMAIL = "styla.digitalcloset@gmail.com";

// Top-level route (outside the protected group) so the protected layout's
// "banned → /banned" redirect can't loop back through here.
export default async function BannedPage() {
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
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  // Only banned users belong here — bounce everyone else back to the app.
  if (profile?.status !== "banned") {
    redirect("/explore");
  }

  return (
    <main className="banned-screen">
      <div className="banned-card">
        <span className="banned-icon" aria-hidden="true">
          <ShieldAlert size={26} />
        </span>
        <h1>Account suspended</h1>
        <p>
          Your account has been suspended for community guidelines violations. If
          you believe this was a mistake, you can appeal your strikes by
          contacting us at:
        </p>
        <a className="banned-appeal" href={`mailto:${APPEAL_EMAIL}`}>
          {APPEAL_EMAIL}
        </a>
      </div>
    </main>
  );
}

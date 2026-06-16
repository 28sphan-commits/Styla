import Link from "next/link";
import { redirect } from "next/navigation";
import { Shirt, Sparkles, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function ExplorePage() {
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

  const { data: styleDna } = await supabase
    .from("style_dna")
    .select("style_aesthetic")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!styleDna) {
    redirect("/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const firstName =
    profile?.full_name?.split(" ").filter(Boolean)[0] ??
    user.email?.split("@")[0] ??
    "Styla";

  return (
    <section className="page-shell">
      <div className="section-kicker">Your Style</div>
      <div className="hero-row">
        <div>
          <h1>{firstName}.</h1>
          <div className="quick-actions">
            <Link href="/wardrobe">
              <Shirt size={14} aria-hidden="true" />
              Wardrobe
            </Link>
            <Link href="/generate">
              <Wand2 size={14} aria-hidden="true" />
              Generate
            </Link>
            <Link href="/outfit-check">
              <Sparkles size={14} aria-hidden="true" />
              Check
            </Link>
          </div>
        </div>
        <div className="mini-stats" aria-label="Wardrobe summary">
          <span>
            <strong>0</strong>
            Items
          </span>
          <span>
            <strong>0</strong>
            Looks
          </span>
        </div>
      </div>

      <div className="rule" />

      <section className="feed-preview" aria-labelledby="phase-title">
        <div className="section-kicker">Phase 1</div>
        <h2 id="phase-title">Foundation ready</h2>
        <div className="foundation-grid">
          <article>
            <span>01</span>
            <strong>Google sign-in</strong>
            <p>Supabase auth is wired through the server callback.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Style DNA</strong>
            <p>Your onboarding answers are saved for AI personalization.</p>
          </article>
          <article>
            <span>03</span>
            <strong>App shell</strong>
            <p>The protected layout is ready for the next approved feature.</p>
          </article>
        </div>
      </section>
    </section>
  );
}

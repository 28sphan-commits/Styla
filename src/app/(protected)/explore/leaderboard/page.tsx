import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Leaderboard } from "@/components/social/leaderboard";
import { loadAuraLeaderboard, loadPopularPosts } from "@/lib/social/leaderboard";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
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
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!styleDna) {
    redirect("/onboarding");
  }

  const [aura, posts] = await Promise.all([
    loadAuraLeaderboard(supabase, 10),
    loadPopularPosts(supabase, user.id, 10)
  ]);

  return (
    <section className="page-shell explore-page">
      <div className="browse-toolbar">
        <div>
          <div className="section-kicker">Styla Social</div>
          <h1>Leaderboard</h1>
        </div>
      </div>

      <Leaderboard auraAvailable={aura.available} aura={aura.entries} posts={posts} />

      <div className="browse-back">
        <Link href="/explore">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Explore
        </Link>
      </div>
    </section>
  );
}

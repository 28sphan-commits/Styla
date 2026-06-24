import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Leaf,
  Shirt,
  Sparkles,
  Trophy,
  Wand2,
  Zap
} from "lucide-react";
import { OutfitFeed } from "@/components/social/outfit-feed";
import { ProfileGrid } from "@/components/social/profile-grid";
import { FriendsStat } from "@/components/social/friends-stat";
import {
  loadMutualFriends,
  loadPublicOutfits,
  loadRecommendedProfiles
} from "@/lib/outfits/loaders";
import { createClient } from "@/lib/supabase/server";

// The main Explore page is a curated landing view: a few featured looks plus
// recommended stylists. The full, filterable, searchable feed lives at
// /explore/browse.
const FEATURED_LIMIT = 3;

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
    .select("full_name, username, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const [{ data: wardrobeRows }, { data: outfitRows }] = await Promise.all([
    supabase.from("wardrobe_items").select("id").eq("user_id", user.id),
    supabase.from("outfits").select("id").eq("user_id", user.id)
  ]);

  const [outfits, profiles, friends] = await Promise.all([
    loadPublicOutfits(supabase, user.id, { feed: "all" }, FEATURED_LIMIT),
    loadRecommendedProfiles(supabase, user.id, 6),
    loadMutualFriends(supabase, user.id)
  ]);

  const firstName =
    profile?.full_name?.split(" ").filter(Boolean)[0] ??
    profile?.username ??
    user.email?.split("@")[0] ??
    "there";

  return (
    <section className="page-shell explore-page">
      <div className="section-kicker">Styla Social</div>
      <div className="explore-hero">
        <div className="explore-copy">
          <h1>Welcome back, {firstName}.</h1>
          <p>
            Discover public looks, follow people with a similar eye, and save
            outfit ideas back to your own styling library.
          </p>
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
              <Camera size={14} aria-hidden="true" />
              Check
            </Link>
          </div>
        </div>

        <div className="style-orbit" aria-hidden="true">
          <div>
            <span>{profile?.username?.slice(0, 1).toUpperCase() ?? "S"}</span>
          </div>
          <small>{styleDna.style_aesthetic}</small>
        </div>

        <div className="mini-stats" aria-label="Your Styla summary">
          <span>
            <strong>{wardrobeRows?.length ?? 0}</strong>
            Items
          </span>
          <span>
            <strong>{outfitRows?.length ?? 0}</strong>
            Looks
          </span>
          <FriendsStat friends={friends} />
        </div>
      </div>

      <div className="rule" />

      <Link className="leaderboard-cta" href="/explore/leaderboard">
        <span className="leaderboard-cta-icon">
          <Trophy size={18} aria-hidden="true" />
        </span>
        <span className="leaderboard-cta-text">
          <strong>Leaderboard</strong>
          <small>See the top aura earners and most popular looks</small>
        </span>
        <span className="leaderboard-cta-aura">
          <Zap size={13} aria-hidden="true" />
          Aura
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </Link>

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">Public Feed</div>
            <h2>Explore Looks</h2>
          </div>
        </div>

        <OutfitFeed
          outfits={outfits}
          emptyTitle="No public looks yet"
          emptyText="Share one of your saved outfits to start the public feed."
        />

        <div className="explore-more-row">
          <Link className="explore-more-button" href="/explore/browse">
            Explore More
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">People</div>
            <h2>Stylists to Follow</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <ProfileGrid profiles={profiles} currentUserId={user.id} />
        <div className="explore-more-row">
          <Link className="explore-more-button" href="/explore/stylists">
            Discover Stylists
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>

        <Link className="places-cta" href="/explore/places">
          <span className="places-cta-icon">
            <Leaf size={18} aria-hidden="true" />
          </span>
          <span className="places-cta-text">
            <strong>Discover sustainable places near you</strong>
            <small>
              Thrift, vintage &amp; consignment near you — plus donation and
              textile-recycling drop-offs
            </small>
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </section>
  );
}

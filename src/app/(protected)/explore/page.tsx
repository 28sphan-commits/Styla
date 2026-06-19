import Link from "next/link";
import { redirect } from "next/navigation";
import { Camera, MessageCircle, Search, Shirt, Sparkles, Wand2 } from "lucide-react";
import { OutfitFeed } from "@/components/social/outfit-feed";
import { ProfileGrid } from "@/components/social/profile-grid";
import {
  loadPublicOutfits,
  loadPublicProfiles,
  loadRecommendedProfiles
} from "@/lib/outfits/loaders";
import {
  moodLabels,
  occasionLabels,
  outfitMoods,
  outfitOccasions
} from "@/lib/outfits/schema";
import type { ExploreFilter } from "@/lib/social/schema";
import { createClient } from "@/lib/supabase/server";

type ExplorePageProps = {
  searchParams: Promise<{
    feed?: string;
    occasion?: string;
    mood?: string;
    q?: string;
  }>;
};

function filterHref(filter: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filter).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
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

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const filter: ExploreFilter = {
    feed: params.feed === "following" ? "following" : "all",
    occasion: outfitOccasions.includes(params.occasion as never)
      ? params.occasion
      : undefined,
    mood: outfitMoods.includes(params.mood as never) ? params.mood : undefined
  };

  const [allOutfits, profiles] = await Promise.all([
    loadPublicOutfits(supabase, user.id, filter, query ? 48 : 18),
    query
      ? loadPublicProfiles(supabase, user.id, query, 18)
      : loadRecommendedProfiles(supabase, user.id, 6)
  ]);

  const normalizedQuery = query.toLowerCase();
  const outfits = normalizedQuery
    ? allOutfits.filter((outfit) =>
        [
          outfit.title,
          outfit.description,
          outfit.occasion,
          outfit.mood,
          outfit.weather,
          outfit.creator?.username ?? "",
          outfit.creator?.full_name ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : allOutfits;

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
            <Link href="/chat">
              <MessageCircle size={14} aria-hidden="true" />
              Chat
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
          <span>
            <strong>{profiles.length}</strong>
            People
          </span>
        </div>
      </div>

      <div className="rule" />

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">Public Feed</div>
            <h2>{query ? `Looks matching "${query}"` : "Explore Looks"}</h2>
          </div>
        </div>

        <div className="social-filter-bar">
          <Link
            className={filter.feed !== "following" ? "is-active" : undefined}
            href={filterHref({ occasion: filter.occasion, mood: filter.mood })}
          >
            All
          </Link>
          <Link
            className={filter.feed === "following" ? "is-active" : undefined}
            href={filterHref({
              feed: "following",
              occasion: filter.occasion,
              mood: filter.mood
            })}
          >
            Following
          </Link>
          {outfitOccasions.slice(0, 4).map((occasion) => (
            <Link
              key={occasion}
              className={filter.occasion === occasion ? "is-active" : undefined}
              href={filterHref({
                feed: filter.feed === "following" ? "following" : undefined,
                occasion,
                mood: filter.mood
              })}
            >
              {occasionLabels[occasion]}
            </Link>
          ))}
          {outfitMoods.slice(0, 4).map((mood) => (
            <Link
              key={mood}
              className={filter.mood === mood ? "is-active" : undefined}
              href={filterHref({
                feed: filter.feed === "following" ? "following" : undefined,
                occasion: filter.occasion,
                mood
              })}
            >
              {moodLabels[mood]}
            </Link>
          ))}
        </div>

        <OutfitFeed
          outfits={outfits}
          emptyTitle={
            filter.feed === "following" ? "Your following feed is quiet" : "No public looks yet"
          }
          emptyText={
            filter.feed === "following"
              ? "Follow people from Search to fill this feed."
              : "Share one of your saved outfits to start the public feed."
          }
        />
      </section>

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">People</div>
            <h2>{query ? `Results for "${query}"` : "Stylists to Follow"}</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <form className="search-form" action="/explore">
          <Search size={15} aria-hidden="true" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search people, casual looks, date outfits..."
          />
          {filter.feed === "following" ? (
            <input type="hidden" name="feed" value="following" />
          ) : null}
          {filter.occasion ? (
            <input type="hidden" name="occasion" value={filter.occasion} />
          ) : null}
          {filter.mood ? (
            <input type="hidden" name="mood" value={filter.mood} />
          ) : null}
          <button type="submit">Search</button>
        </form>
        <ProfileGrid profiles={profiles} currentUserId={user.id} />
      </section>
    </section>
  );
}

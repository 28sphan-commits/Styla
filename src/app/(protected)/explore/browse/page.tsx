import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Flame, Search } from "lucide-react";
import { OutfitFeed } from "@/components/social/outfit-feed";
import { loadPublicOutfits } from "@/lib/outfits/loaders";
import { searchPublicOutfits } from "@/lib/outfits/search";
import {
  moodLabels,
  occasionLabels,
  outfitMoods,
  outfitOccasions
} from "@/lib/outfits/schema";
import type { ExploreFilter } from "@/lib/social/schema";
import { createClient } from "@/lib/supabase/server";

type BrowsePageProps = {
  searchParams: Promise<{ q?: string; feed?: string; sort?: string }>;
};

// Browse fetches the full public feed and filters in-memory via the shared
// search ranker, so pills and the search box use one code path.
const FEED_LIMIT = 96;

// Weighted engagement score used by the "Trending" sort. Saves and views read
// as 0 until the engagement-metrics migration is applied, so this gracefully
// degrades to a like-based ranking in the meantime.
function trendingScore(outfit: {
  like_count: number;
  save_count: number;
  view_count: number;
}): number {
  return outfit.like_count * 3 + outfit.save_count * 2 + outfit.view_count;
}

function browseHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/explore/browse?${query}` : "/explore/browse";
}

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
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

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const feed = params.feed === "following" ? "following" : "all";
  const trending = params.sort === "trending";
  const filter: ExploreFilter = { feed };

  const allOutfits = await loadPublicOutfits(supabase, user.id, filter, FEED_LIMIT);
  const filtered = query ? searchPublicOutfits(allOutfits, query) : allOutfits;
  // Trending re-ranks the (already filtered) feed by engagement.
  const outfits = trending
    ? [...filtered].sort((a, b) => trendingScore(b) - trendingScore(a))
    : filtered;

  // A category pill is "a preset search": it's active when the query equals its
  // term, and clicking it again clears the query (toggle off).
  const activeQuery = query.toLowerCase();
  const followingParam = feed === "following" ? "following" : undefined;

  return (
    <section className="page-shell explore-page">
      <div className="browse-toolbar">
        <div>
          <div className="section-kicker">Styla Social</div>
          <h1>
            {query
              ? `Results for “${query}”`
              : trending
                ? "Trending Looks"
                : "Explore Looks"}
          </h1>
        </div>
        <form className="search-form browse-search" action="/explore/browse">
          <Search size={15} aria-hidden="true" />
          <input name="q" defaultValue={query} placeholder="Search for inspiration" />
          {followingParam ? (
            <input type="hidden" name="feed" value="following" />
          ) : null}
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="social-filter-bar">
        <Link
          className={!query && feed !== "following" && !trending ? "is-active" : undefined}
          href="/explore/browse"
        >
          All
        </Link>
        <Link
          className={trending ? "is-active" : undefined}
          href={browseHref({ sort: "trending", q: query || undefined })}
        >
          <Flame size={12} aria-hidden="true" />
          Trending
        </Link>
        <Link
          className={feed === "following" ? "is-active" : undefined}
          href={browseHref(
            feed === "following"
              ? { q: query || undefined }
              : { feed: "following", q: query || undefined }
          )}
        >
          Following
        </Link>
        {outfitOccasions.slice(0, 4).map((occasion) => (
          <Link
            key={occasion}
            className={activeQuery === occasion ? "is-active" : undefined}
            href={browseHref({
              feed: followingParam,
              q: activeQuery === occasion ? undefined : occasion
            })}
          >
            {occasionLabels[occasion]}
          </Link>
        ))}
        {outfitMoods.slice(0, 4).map((mood) => (
          <Link
            key={mood}
            className={activeQuery === mood ? "is-active" : undefined}
            href={browseHref({
              feed: followingParam,
              q: activeQuery === mood ? undefined : mood
            })}
          >
            {moodLabels[mood]}
          </Link>
        ))}
      </div>

      {/* Re-key on feed+query so OutfitFeed remounts with fresh state on soft
          navigation (pills/search), instead of keeping its stale initial copy. */}
      <OutfitFeed
        key={`${feed}:${query}:${trending ? "trending" : ""}`}
        outfits={outfits}
        emptyTitle={
          query
            ? "No looks match your search"
            : feed === "following"
              ? "Your following feed is quiet"
              : "No public looks yet"
        }
        emptyText={
          query
            ? "Try a different search or category."
            : feed === "following"
              ? "Follow people to fill this feed."
              : "Share one of your saved outfits to start the public feed."
        }
      />

      <div className="browse-back">
        <Link href="/explore">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Explore
        </Link>
      </div>
    </section>
  );
}

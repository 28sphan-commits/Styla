import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Flame, Search } from "lucide-react";
import { ProfileGrid } from "@/components/social/profile-grid";
import { loadStylistProfiles } from "@/lib/outfits/loaders";
import { searchStylistProfiles } from "@/lib/social/stylist-search";
import { createClient } from "@/lib/supabase/server";

type StylistsPageProps = {
  searchParams: Promise<{ q?: string; sort?: string }>;
};

const STYLIST_LIMIT = 96;

// Pills: the first 5 map to exact style_dna.style_aesthetic values.
// The rest are keyword searches against bio + style_notes.
const PILLS = [
  { label: "All", q: "" },
  { label: "Streetwear", q: "streetwear" },
  { label: "Minimalist", q: "minimalist" },
  { label: "Classic", q: "classic" },
  { label: "Bohemian", q: "bohemian" },
  { label: "Preppy", q: "preppy" },
  { label: "Vintage", q: "vintage" },
  { label: "Outerwear", q: "outerwear" },
  { label: "Sneakerhead", q: "sneakerhead" }
] as const;

function stylistsHref(q: string | undefined) {
  if (!q) return "/explore/stylists";
  return `/explore/stylists?q=${encodeURIComponent(q)}`;
}

export default async function StylistsPage({ searchParams }: StylistsPageProps) {
  const supabase = await createClient();

  if (!supabase) redirect("/login");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const trending = params.sort === "trending";

  const allStylists = await loadStylistProfiles(supabase, user.id, STYLIST_LIMIT);
  const matched = query ? searchStylistProfiles(allStylists, query) : allStylists;
  // "Top Trending" ranks users by reach: followers first, then how many looks
  // they've shared.
  const stylists = trending
    ? [...matched].sort(
        (a, b) =>
          b.follower_count - a.follower_count || b.outfit_count - a.outfit_count
      )
    : matched;

  const activeQ = query.toLowerCase();

  return (
    <section className="page-shell explore-page">
      <div className="browse-toolbar">
        <div>
          <div className="section-kicker">Styla Social</div>
          <h1>
            {query ? `"${query}"` : trending ? "Top Trending Stylists" : "Browse Stylists"}
          </h1>
        </div>
        <form className="search-form browse-search" action="/explore/stylists">
          <Search size={15} aria-hidden="true" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search stylists by name or niche..."
            autoComplete="off"
          />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="social-filter-bar">
        <Link
          className={trending ? "is-active" : undefined}
          href="/explore/stylists?sort=trending"
        >
          <Flame size={12} aria-hidden="true" />
          Top Trending
        </Link>
        {PILLS.map((pill) => (
          <Link
            key={pill.label}
            className={!trending && activeQ === pill.q ? "is-active" : undefined}
            href={stylistsHref(pill.q || undefined)}
          >
            {pill.label}
          </Link>
        ))}
      </div>

      <ProfileGrid
        key={`${query}:${trending ? "trending" : ""}`}
        profiles={stylists}
        currentUserId={user.id}
        emptyTitle={query ? `No stylists match "${query}"` : "No stylists yet"}
        emptyText={
          query
            ? "Try a different keyword or pick a category above."
            : "Once people make their profiles public they'll appear here."
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

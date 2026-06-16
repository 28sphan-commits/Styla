import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { OutfitFeed } from "@/components/social/outfit-feed";
import { ProfileGrid } from "@/components/social/profile-grid";
import {
  loadPublicOutfits,
  loadPublicProfiles
} from "@/lib/outfits/loaders";
import { createClient } from "@/lib/supabase/server";

type SearchPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
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

  const query = (await searchParams).q?.trim() ?? "";
  const [profiles, allOutfits] = await Promise.all([
    loadPublicProfiles(supabase, user.id, query, 18),
    loadPublicOutfits(supabase, user.id, {}, 36)
  ]);

  const normalized = query.toLowerCase();
  const outfits = normalized
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
          .includes(normalized)
      )
    : allOutfits.slice(0, 12);

  return (
    <section className="page-shell search-page">
      <div className="section-kicker">The Directory</div>
      <div className="search-hero">
        <div>
          <h1>Search Styla</h1>
          <p>Find public profiles, outfit ideas, aesthetics, occasions, and moods.</p>
        </div>
        <form className="search-form" action="/search">
          <Search size={15} aria-hidden="true" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search people, casual looks, date outfits..."
          />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="rule" />

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">People</div>
            <h2>{query ? `Profiles matching "${query}"` : "Suggested Profiles"}</h2>
          </div>
        </div>
        <ProfileGrid profiles={profiles} currentUserId={user.id} />
      </section>

      <section className="social-section">
        <div className="social-section-heading">
          <div>
            <div className="section-kicker">Looks</div>
            <h2>{query ? `Outfits matching "${query}"` : "Popular Public Looks"}</h2>
          </div>
        </div>
        <OutfitFeed
          outfits={outfits}
          emptyTitle="No matching looks"
          emptyText="Try searching by occasion, mood, weather, or creator."
        />
      </section>
    </section>
  );
}

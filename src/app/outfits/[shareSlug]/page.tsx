import Link from "next/link";
import { notFound } from "next/navigation";
import { attachItemsToOutfits } from "@/lib/outfits/loaders";
import {
  moodLabels,
  occasionLabels,
  weatherLabels,
  type SavedOutfit
} from "@/lib/outfits/schema";
import { createClient } from "@/lib/supabase/server";

export default async function SharedOutfitPage({
  params
}: {
  params: Promise<{ shareSlug: string }>;
}) {
  const supabase = await createClient();

  if (!supabase) {
    notFound();
  }

  const { shareSlug } = await params;
  const { data: outfit } = await supabase
    .from("outfits")
    .select("*")
    .eq("share_slug", shareSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (!outfit) {
    notFound();
  }

  const [outfitWithItems] = await attachItemsToOutfits(supabase, [
    outfit as SavedOutfit
  ]);

  return (
    <main className="shared-outfit-page">
      <header className="shared-outfit-header">
        <Link className="brand-lockup" href="/login">
          <span className="brand-icon">S</span>
          <span>Styla</span>
        </Link>
        <Link href="/explore">Back to Explore</Link>
      </header>

      <section className="shared-outfit-shell">
        <div className="section-kicker">Shared Look</div>
        <h1>{outfitWithItems.title}</h1>
        <div className="library-card-tags">
          <span>{occasionLabels[outfitWithItems.occasion]}</span>
          <span>{moodLabels[outfitWithItems.mood]}</span>
          <span>{weatherLabels[outfitWithItems.weather]}</span>
        </div>

        <div className="shared-outfit-grid">
          {outfitWithItems.items.map((item) => (
            <figure key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image_url} alt={item.name} />
              <figcaption>{item.name}</figcaption>
            </figure>
          ))}
        </div>

        <p>{outfitWithItems.description}</p>
        <small>Styled with Styla</small>
      </section>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSharedOutfit } from "@/lib/outfits/loaders";
import {
  moodLabels,
  occasionLabels,
  weatherLabels
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
  const outfitWithItems = await loadSharedOutfit(supabase, shareSlug);

  if (!outfitWithItems) {
    notFound();
  }

  return (
    <main className="shared-outfit-page">
      <header className="shared-outfit-header">
        <Link className="brand-lockup" href="/login">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo-img" src="/styla-logo.png" alt="" />
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

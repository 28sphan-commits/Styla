import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSharedOutfit } from "@/lib/outfits/loaders";
import {
  moodLabels,
  occasionLabels,
  weatherLabels
} from "@/lib/outfits/schema";
import { createClient } from "@/lib/supabase/server";
import { LOGO_ALT, LOGO_SRC } from "@/lib/brand";

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

  // Record a view (best-effort, fire-and-forget). The RPC excludes the owner's
  // own visits and no-ops gracefully if the engagement migration hasn't run.
  const {
    data: { user }
  } = await supabase.auth.getUser();
  await supabase
    .rpc("increment_outfit_views", {
      p_outfit_id: outfitWithItems.id,
      p_viewer_id: user?.id ?? null
    })
    .then(undefined, () => undefined);

  return (
    <main className="shared-outfit-page">
      <header className="shared-outfit-header">
        <Link className="brand-lockup" href="/login">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-logo-img" src={LOGO_SRC} alt={LOGO_ALT} />
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

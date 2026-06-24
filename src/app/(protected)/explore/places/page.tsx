import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Leaf } from "lucide-react";
import { SustainableMap } from "@/components/places/sustainable-map";
import { createClient } from "@/lib/supabase/server";

// "Discover Sustainable Places Near You" — nested under Explore › Discover
// Stylists. The map is location-aware so all data loading happens client-side
// after the user grants permission; this server component just guards auth.
export default async function SustainablePlacesPage() {
  const supabase = await createClient();

  if (!supabase) redirect("/login");

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <section className="page-shell explore-page">
      <div className="browse-toolbar">
        <div>
          <div className="section-kicker">Styla Sustainable</div>
          <h1>Sustainable places near you</h1>
        </div>
        <span className="places-header-icon" aria-hidden="true">
          <Leaf size={18} />
        </span>
      </div>

      <SustainableMap />

      <div className="browse-back">
        <Link href="/explore/stylists">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Discover Stylists
        </Link>
      </div>
    </section>
  );
}

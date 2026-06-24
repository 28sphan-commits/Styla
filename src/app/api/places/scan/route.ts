import { NextResponse } from "next/server";
import { z } from "zod";
import { bboxAround, scanOverpass } from "@/lib/places/osm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().positive().max(40000).optional()
});

// On-demand "Scan this area": pulls real secondhand shops + clothing-recycling
// points from OpenStreetMap around the caller's location and upserts them. OSM
// rows use source='osm', which RLS reserves for non-community sources, so the
// insert goes through the service-role client.
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  }

  let rows;
  try {
    rows = await scanOverpass(bboxAround(body.lat, body.lng, body.radiusM ?? 5000));
  } catch (err) {
    console.error("[places/scan] Overpass lookup failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach the map data service. Try again in a moment." },
      { status: 502 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "Scanning isn't configured on the server." },
      { status: 500 }
    );
  }

  const { error } = await admin
    .from("sustainable_places")
    .upsert(rows, { onConflict: "osm_id" });

  if (error) {
    return NextResponse.json(
      { error: "Could not save places. Has the sustainable-places migration been applied?" },
      { status: 500 }
    );
  }

  return NextResponse.json({ inserted: rows.length });
}

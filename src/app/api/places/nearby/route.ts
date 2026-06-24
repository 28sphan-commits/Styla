import { NextResponse } from "next/server";
import { z } from "zod";
import { loadNearbyPlaces } from "@/lib/places/loaders";
import { DEFAULT_RADIUS_M } from "@/lib/places/schema";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  mode: z.enum(["shop", "cleanout"]).optional(),
  radius: z.coerce.number().int().positive().optional()
});

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    mode: searchParams.get("mode") ?? undefined,
    radius: searchParams.get("radius") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  }

  const { lat, lng, mode, radius } = parsed.data;
  const places = await loadNearbyPlaces(supabase, {
    lat,
    lng,
    mode,
    radiusM: radius ?? DEFAULT_RADIUS_M
  });

  return NextResponse.json({ places });
}

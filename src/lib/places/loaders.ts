import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  type NearbyPlace,
  type SustainableMode
} from "@/lib/places/schema";

type NearbyArgs = {
  lat: number;
  lng: number;
  mode?: SustainableMode;
  radiusM?: number;
  limit?: number;
};

// Calls the nearby_sustainable_places RPC. Returns [] if the migration hasn't
// been applied yet, so the page degrades gracefully (mirrors how quests/views
// no-op pre-migration).
export async function loadNearbyPlaces(
  supabase: SupabaseClient,
  { lat, lng, mode, radiusM = DEFAULT_RADIUS_M, limit = 60 }: NearbyArgs
): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.rpc("nearby_sustainable_places", {
    p_lat: lat,
    p_lng: lng,
    p_mode: mode ?? null,
    p_radius_m: Math.min(Math.max(500, radiusM), MAX_RADIUS_M),
    p_limit: limit
  });

  if (error) return [];
  return (data ?? []) as NearbyPlace[];
}

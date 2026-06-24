// Types and display vocabulary for "Discover Sustainable Places Near You".
// Backed by public.sustainable_places + the nearby_sustainable_places RPC.

export type SustainableMode = "shop" | "cleanout";

export type SustainablePlaceType =
  | "vintage"
  | "consignment"
  | "thrift"
  | "curated_resale"
  | "donation_dropbox"
  | "nonprofit_donation"
  | "recycling_bin"
  | "textile_recycler";

// One result row from the nearby_sustainable_places RPC.
export type NearbyPlace = {
  id: string;
  name: string;
  mode: SustainableMode;
  place_type: SustainablePlaceType;
  lat: number;
  lng: number;
  distance_m: number;
  accepted_items: string[];
  styla_style_tags: string[];
  sustainability_score: number | null;
  price_tier: number | null;
  is_verified_partner: boolean;
  address: string | null;
  city: string | null;
  website: string | null;
};

export const placeTypeLabels: Record<SustainablePlaceType, string> = {
  vintage: "Vintage shop",
  consignment: "Consignment",
  thrift: "Thrift store",
  curated_resale: "Curated resale",
  donation_dropbox: "Drop box",
  nonprofit_donation: "Nonprofit",
  recycling_bin: "Recycling bin",
  textile_recycler: "Textile recycler"
};

export const modeLabels: Record<SustainableMode, string> = {
  shop: "Shop sustainable",
  cleanout: "Conscious cleanout"
};

// Default search radius (meters), how much "Look for more" widens it each tap,
// and the cap the RPC enforces.
export const DEFAULT_RADIUS_M = 8000;
export const RADIUS_STEP_M = 8000;
export const MAX_RADIUS_M = 40000;

// Distance helper for cards: meters → "0.4 mi".
export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  if (miles < 0.1) return "nearby";
  return `${miles.toFixed(1)} mi`;
}

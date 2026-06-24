// Shared OpenStreetMap → sustainable_places mapping, used by the on-demand
// "Scan this area" API (/api/places/scan). The CLI seed script (scripts/
// seed-places.mjs) keeps its own copy since it runs as a standalone .mjs.

import type { SustainableMode, SustainablePlaceType } from "@/lib/places/schema";

// The public Overpass instances are flaky and load-shed with 406/429/504, so we
// try several mirrors in order. A descriptive User-Agent also matters: requests
// with Node's default UA get rejected with 406 by overpass-api.de's WAF.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const OVERPASS_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "application/json",
  "User-Agent": "Styla/1.0 (sustainable-places map; contact: hello@styla.app)"
};

export type PlaceInsert = {
  name: string;
  mode: SustainableMode;
  place_type: SustainablePlaceType;
  geom: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  accepted_items: string[];
  styla_style_tags: string[];
  website: string | null;
  phone: string | null;
  source: "osm";
  osm_id: string;
  status: "published";
};

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// Bounding box "south,west,north,east" around a point for a given radius (m).
export function bboxAround(lat: number, lng: number, radiusM: number): string {
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng]
    .map((n) => n.toFixed(6))
    .join(",");
}

function coords(el: OsmElement): [number, number] | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  return null;
}

// Maps an OSM element to an insert row, or null if it isn't a useful place.
export function elementToRow(el: OsmElement): PlaceInsert | null {
  const t = el.tags ?? {};
  const xy = coords(el);
  if (!xy) return null;
  const [lng, lat] = xy;

  let mode: SustainableMode;
  let place_type: SustainablePlaceType;
  let accepted_items: string[] = [];
  let styla_style_tags: string[] = [];

  if (t.shop === "second_hand" || t.shop === "charity") {
    mode = "shop";
    place_type = t.shop === "charity" ? "thrift" : "curated_resale";
    if (/vintage/i.test(t.name ?? "")) styla_style_tags = ["vintage"];
  } else if (t.amenity === "recycling") {
    mode = "cleanout";
    // Street-side containers are donation drop boxes; staffed sites are
    // textile recyclers; anything else is a generic clothing bin.
    place_type =
      t.recycling_type === "centre"
        ? "textile_recycler"
        : t.recycling_type === "container"
          ? "donation_dropbox"
          : "recycling_bin";
    if (t["recycling:clothes"] && t["recycling:clothes"] !== "no") {
      accepted_items.push("clothing", "textiles");
    }
    if (t["recycling:shoes"] === "yes") accepted_items.push("shoes");
    if (t["recycling:bags"] === "yes") accepted_items.push("bags");
    if (accepted_items.length === 0) accepted_items = ["clothing", "textiles"];
  } else {
    return null;
  }

  // Most donation bins are unnamed in OSM — give them a useful label from the
  // operator or type instead of dropping them.
  const name =
    t.name ??
    (mode === "cleanout"
      ? t.operator
        ? `${t.operator} donation bin`
        : place_type === "textile_recycler"
          ? "Textile recycling centre"
          : place_type === "donation_dropbox"
            ? "Clothing donation bin"
            : "Clothing recycling point"
      : null);
  if (!name) return null; // skip nameless shops — low value

  const address =
    [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;

  return {
    name,
    mode,
    place_type,
    geom: `SRID=4326;POINT(${lng} ${lat})`,
    address,
    city: t["addr:city"] ?? null,
    postal_code: t["addr:postcode"] ?? null,
    accepted_items,
    styla_style_tags,
    website: t.website ?? t["contact:website"] ?? null,
    phone: t.phone ?? t["contact:phone"] ?? null,
    source: "osm",
    osm_id: `${el.type}/${el.id}`,
    status: "published"
  };
}

// One Overpass request with a hard timeout so a hung mirror can't stall us.
async function queryOverpass(endpoint: string, query: string): Promise<OsmElement[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: OVERPASS_HEADERS,
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Overpass ${res.status} (${endpoint})`);
    const { elements = [] } = (await res.json()) as { elements?: OsmElement[] };
    return elements;
  } finally {
    clearTimeout(timer);
  }
}

// Queries Overpass for secondhand shops + clothing recycling in a bbox and
// returns deduped insert rows. Falls back across mirrors on transient failures.
export async function scanOverpass(bbox: string): Promise<PlaceInsert[]> {
  const query = `[out:json][timeout:60];(nwr["shop"="second_hand"](${bbox});nwr["shop"="charity"](${bbox});nwr["amenity"="recycling"]["recycling:clothes"](${bbox});nwr["amenity"="recycling"]["recycling:shoes"](${bbox}););out center tags;`;

  let elements: OsmElement[] | null = null;
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      elements = await queryOverpass(endpoint, query);
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (elements === null) {
    throw new Error(
      `All Overpass mirrors failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
    );
  }

  const rows = elements
    .map(elementToRow)
    .filter((r): r is PlaceInsert => r !== null);

  const byId = new Map(rows.map((r) => [r.osm_id, r]));
  return [...byId.values()];
}

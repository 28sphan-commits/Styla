// Seeds public.sustainable_places from OpenStreetMap via the Overpass API.
// Solves the cold-start problem: a "near you" map is useless empty.
//
// Run:  npm run seed:places                 (defaults to a San Francisco bbox)
//       npm run seed:places -- 51.43,-0.25,51.58,0.02   (south,west,north,east)
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loaded from
// .env.local by the npm script's --env-file flag).

import { createClient } from "@supabase/supabase-js";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const DEFAULT_BBOX = "37.70,-122.52,37.83,-122.36"; // San Francisco

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const bbox = process.argv[2] ?? DEFAULT_BBOX;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const query = `
[out:json][timeout:90];
(
  nwr["shop"="second_hand"](${bbox});
  nwr["shop"="charity"](${bbox});
  nwr["amenity"="recycling"]["recycling:clothes"](${bbox});
  nwr["amenity"="recycling"]["recycling:shoes"](${bbox});
);
out center tags;
`;

function coords(el) {
  if (typeof el.lat === "number") return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  return null;
}

// Maps an OSM element to a sustainable_places row, or null if not useful.
function toRow(el) {
  const t = el.tags ?? {};
  const xy = coords(el);
  if (!xy) return null;
  const [lng, lat] = xy;

  let mode;
  let place_type;
  let accepted_items = [];
  let styla_style_tags = [];

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

  const address = [t["addr:housenumber"], t["addr:street"]]
    .filter(Boolean)
    .join(" ") || null;

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

async function main() {
  console.log(`Querying Overpass for bbox ${bbox}…`);
  const res = await fetch(OVERPASS, {
    method: "POST",
    // A descriptive User-Agent is required — Overpass's WAF returns 406 for the
    // default Node UA.
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "Styla/1.0 (sustainable-places seed; contact: hello@styla.app)"
    },
    body: `data=${encodeURIComponent(query)}`
  });
  if (!res.ok) {
    console.error(`Overpass error ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { elements = [] } = await res.json();
  const rows = elements.map(toRow).filter(Boolean);
  console.log(`Found ${elements.length} OSM elements → ${rows.length} usable places.`);
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase
      .from("sustainable_places")
      .upsert(batch, { onConflict: "osm_id" });
    if (error) {
      console.error("Upsert failed:", error.message);
      process.exit(1);
    }
    console.log(`Upserted ${Math.min(i + 500, rows.length)} / ${rows.length}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

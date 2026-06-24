"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker as MlMarker } from "maplibre-gl";
import { Compass, Leaf, MapPin, Navigation, Radar, Recycle, ShieldCheck, Store } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  DEFAULT_RADIUS_M,
  formatDistance,
  MAX_RADIUS_M,
  modeLabels,
  placeTypeLabels,
  RADIUS_STEP_M,
  type NearbyPlace,
  type SustainableMode
} from "@/lib/places/schema";

type Coords = { lat: number; lng: number };
type Status = "idle" | "locating" | "ready" | "denied" | "error";
type Maplibre = typeof import("maplibre-gl");

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

// MapTiler if a key is configured, otherwise an OpenStreetMap raster fallback so
// the map works out of the box with no key.
function mapStyle(): string | object {
  if (MAPTILER_KEY) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;
  }
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  };
}

export function SustainableMap() {
  const [status, setStatus] = useState<Status>("idle");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mode, setMode] = useState<SustainableMode>("shop");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [radiusM, setRadiusM] = useState(DEFAULT_RADIUS_M);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<MlMarker[]>([]);
  const mlRef = useRef<Maplibre | null>(null);
  const scannedKeyRef = useRef<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("ready");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Fetch nearby places for the current location + mode within radius r.
  const fetchPlaces = useCallback(
    async (r: number = radiusM): Promise<NearbyPlace[]> => {
      if (!coords) return [];
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        mode,
        radius: String(r)
      });
      const res = await fetch(`/api/places/nearby?${params.toString()}`);
      const data = (await res.json()) as { places?: NearbyPlace[] };
      return data.places ?? [];
    },
    [coords, mode, radiusM]
  );

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    setLoading(true);
    fetchPlaces()
      .then((p) => {
        if (!cancelled) setPlaces(p);
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coords, mode, fetchPlaces]);

  // Pull real places from OpenStreetMap for the current area (radius r), refresh.
  const scanArea = useCallback(
    async (r: number = radiusM) => {
      if (!coords) return;
      setScanning(true);
      setScanMsg(null);
      try {
        const res = await fetch("/api/places/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: coords.lat, lng: coords.lng, radiusM: r })
        });
        const data = (await res.json()) as { inserted?: number; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Scan failed.");
        setPlaces(await fetchPlaces(r));
        setScanMsg(
          data.inserted && data.inserted > 0
            ? `Added ${data.inserted} places from OpenStreetMap.`
            : "No new places found in this area yet."
        );
      } catch (err) {
        setScanMsg(err instanceof Error ? err.message : "Scan failed.");
      } finally {
        setScanning(false);
      }
    },
    [coords, fetchPlaces, radiusM]
  );

  // Auto-scan once per location/radius if the load turns up nothing, so the map
  // self-populates from OpenStreetMap without the user hunting for the button.
  useEffect(() => {
    if (!coords || loading || scanning) return;
    const key = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)},${radiusM}`;
    if (places.length === 0 && scannedKeyRef.current !== key) {
      scannedKeyRef.current = key;
      void scanArea(radiusM);
    }
  }, [coords, loading, scanning, places, scanArea, radiusM]);

  // "Look for more" — widen the radius a step and re-scan OSM at the new size.
  const lookForMore = useCallback(() => {
    const next = Math.min(radiusM + RADIUS_STEP_M, MAX_RADIUS_M);
    if (coords) {
      scannedKeyRef.current = `${coords.lat.toFixed(3)},${coords.lng.toFixed(3)},${next}`;
    }
    setRadiusM(next);
    void scanArea(next);
  }, [coords, radiusM, scanArea]);

  // Initialize the map once we have coordinates.
  useEffect(() => {
    if (!coords || mapRef.current || !mapContainer.current) return;
    let cancelled = false;
    void (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !mapContainer.current) return;
      mlRef.current = ml;
      const map = new ml.Map({
        container: mapContainer.current,
        style: mapStyle() as string,
        center: [coords.lng, coords.lat],
        zoom: 12,
        attributionControl: { compact: true }
      });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      new ml.Marker({ color: "#171a17" })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
    };
  }, [coords]);

  // Tear down the map on unmount.
  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render a marker per place; clicking one selects + scrolls to its card.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    places.forEach((place) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `place-marker is-${place.mode}${
        place.is_verified_partner ? " is-verified" : ""
      }`;
      el.setAttribute("aria-label", place.name);
      el.addEventListener("click", () => {
        setSelectedId(place.id);
        document
          .getElementById(`place-card-${place.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const marker = new ml.Marker({ element: el })
        .setLngLat([place.lng, place.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [places]);

  function selectPlace(place: NearbyPlace) {
    setSelectedId(place.id);
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 });
  }

  if (status !== "ready") {
    return (
      <div className="places-primer">
        <span className="places-primer-icon" aria-hidden="true">
          <MapPin size={26} />
        </span>
        <h2>See sustainable spots around you</h2>
        <p>
          {status === "denied"
            ? "Location access was blocked. Enable it in your browser settings, then try again."
            : status === "error"
              ? "Your browser can't share a location. Try a different browser."
              : "Share your location to map secondhand shops and clothing drop-offs nearby. We never store it."}
        </p>
        <button
          type="button"
          className="places-primer-button"
          onClick={requestLocation}
          disabled={status === "locating"}
        >
          <Navigation size={14} aria-hidden="true" />
          {status === "locating" ? "Locating…" : "Use my location"}
        </button>
      </div>
    );
  }

  return (
    <div className="places-layout">
      <div className="places-toggle" role="tablist" aria-label="Place mode">
        {(["shop", "cleanout"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "is-active" : undefined}
            onClick={() => setMode(m)}
          >
            {m === "shop" ? (
              <Store size={14} aria-hidden="true" />
            ) : (
              <Recycle size={14} aria-hidden="true" />
            )}
            {modeLabels[m]}
          </button>
        ))}
      </div>

      <div className="places-map" ref={mapContainer} />

      <div className="places-scan-row">
        <button
          type="button"
          className="places-scan-button"
          onClick={() => void scanArea()}
          disabled={scanning}
        >
          <Radar size={14} aria-hidden="true" />
          {scanning ? "Scanning this area…" : "Scan this area"}
        </button>
        {places.length > 0 && radiusM < MAX_RADIUS_M ? (
          <button
            type="button"
            className="places-scan-button is-secondary"
            onClick={lookForMore}
            disabled={scanning}
          >
            <Compass size={14} aria-hidden="true" />
            {scanning ? "Looking…" : "Look for more"}
          </button>
        ) : null}
        <span className="places-scan-radius">
          within {Math.round(radiusM / 1609.34)} mi
          {radiusM >= MAX_RADIUS_M ? " · widest" : ""}
        </span>
        {scanMsg ? <span className="places-scan-msg">{scanMsg}</span> : null}
      </div>

      {loading || scanning ? (
        <p className="places-loading">
          {scanning
            ? "Scanning OpenStreetMap for places near you…"
            : "Finding places nearby…"}
        </p>
      ) : places.length === 0 ? (
        <p className="places-empty">
          No {mode === "shop" ? "shops" : "drop-off spots"} found nearby yet. Tap
          “Scan this area” above to pull listings from OpenStreetMap.
        </p>
      ) : (
        <ul className="places-list">
          {places.map((place) => (
            <li
              key={place.id}
              id={`place-card-${place.id}`}
              className={
                selectedId === place.id ? "place-card is-selected" : "place-card"
              }
            >
              <button
                type="button"
                className="place-card-main"
                onClick={() => selectPlace(place)}
              >
                <div className="place-card-top">
                  <strong>{place.name}</strong>
                  {place.is_verified_partner ? (
                    <span className="place-verified">
                      <ShieldCheck size={12} aria-hidden="true" />
                      Verified
                    </span>
                  ) : null}
                </div>
                <div className="place-card-meta">
                  {placeTypeLabels[place.place_type]} · {formatDistance(place.distance_m)}
                  {place.mode === "shop" && place.sustainability_score != null ? (
                    <span className="place-score">
                      <Leaf size={11} aria-hidden="true" />
                      {place.sustainability_score.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                <div className="place-chips">
                  {(place.mode === "shop"
                    ? place.styla_style_tags
                    : place.accepted_items
                  ).map((chip) => (
                    <span
                      key={chip}
                      className={place.mode === "shop" ? "place-chip is-style" : "place-chip is-item"}
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </button>
              <a
                className="place-directions"
                href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={13} aria-hidden="true" />
                Directions
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

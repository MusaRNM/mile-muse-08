import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TrackPoint } from "@/lib/types";
import { RouteMap } from "./RouteMap";

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

// Minimal typings for the parts of the Maps JS SDK we use — avoids pulling
// in the full @types/google.maps and its Node/DOM deps.
type LatLng = { lat: () => number; lng: () => number };
interface GoogleMapsNS {
  maps: {
    LatLng: new (lat: number, lng: number) => LatLng;
    LatLngBounds: new () => { extend: (p: LatLng) => void };
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => {
      fitBounds: (b: { extend: (p: LatLng) => void }, padding?: number) => void;
    };
    Polyline: new (opts: Record<string, unknown>) => unknown;
    Marker: new (opts: Record<string, unknown>) => unknown;
  };
}

interface Props {
  path: TrackPoint[];
  className?: string;
}

// Global loader promise so the Maps JS SDK loads once, asynchronously.
let mapsLoader: Promise<GoogleMapsNS> | null = null;

declare global {
  interface Window {
    __miletrackInitMap?: () => void;
    google?: GoogleMapsNS;
  }
}

function loadMapsSdk(): Promise<GoogleMapsNS> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (mapsLoader) return mapsLoader;
  if (!BROWSER_KEY) return Promise.reject(new Error("no key"));
  mapsLoader = new Promise((resolve, reject) => {
    window.__miletrackInitMap = () => resolve(window.google!);
    const script = document.createElement("script");
    const channel = TRACKING_ID ? `&channel=${encodeURIComponent(TRACKING_ID)}` : "";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(BROWSER_KEY)}&loading=async&callback=__miletrackInitMap${channel}`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsLoader;
}

/**
 * Interactive Google Map showing a trip's polyline. Falls back to the
 * dependency-free SVG RouteMap when the Google Maps connector isn't linked
 * (no browser key) or when the script fails to load — the app keeps working
 * in every environment.
 *
 * The API key here is the connector's browser key, which is HTTP-referrer
 * restricted at the Google Cloud Console — safe to expose in the client.
 * Server-side calls (geocoding) go through the connector gateway.
 */
export function GoogleRouteMap({ path, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!BROWSER_KEY);

  useEffect(() => {
    if (failed || !BROWSER_KEY || !ref.current || path.length < 2) return;
    let cancelled = false;
    loadMapsSdk()
      .then((g) => {
        if (cancelled || !ref.current) return;
        const latLngs = path.map((p) => new g.maps.LatLng(p.lat, p.lng));
        const map = new g.maps.Map(ref.current, {
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        const bounds = new g.maps.LatLngBounds();
        latLngs.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 24);
        new g.maps.Polyline({
          path: latLngs,
          map,
          strokeColor: "#D67A21",
          strokeOpacity: 0.9,
          strokeWeight: 4,
        });
        new g.maps.Marker({ position: latLngs[0], map, label: "A" });
        new g.maps.Marker({ position: latLngs[latLngs.length - 1], map, label: "B" });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path, failed]);

  if (failed || !BROWSER_KEY) return <RouteMap path={path} className={className} />;
  return <div ref={ref} className={cn("overflow-hidden rounded-xl bg-muted", className)} />;
}

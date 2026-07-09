import type { DistanceUnit, TrackPoint } from "./types";

// ---- Unit conversions (meters / m-per-s are canonical) ----
const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;
const MPS_TO_MPH = 2.2369362920544;
const MPS_TO_KMH = 3.6;

export function metersToUnit(meters: number, unit: DistanceUnit): number {
  return meters / (unit === "mi" ? METERS_PER_MILE : METERS_PER_KM);
}

export function mpsToUnitSpeed(mps: number, unit: DistanceUnit): number {
  return mps * (unit === "mi" ? MPS_TO_MPH : MPS_TO_KMH);
}

export function mphToMps(mph: number): number {
  return mph / MPS_TO_MPH;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mi" : "km";
}

export function speedLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "mph" : "km/h";
}

export function formatDistance(meters: number, unit: DistanceUnit, digits = 1): string {
  return `${metersToUnit(meters, unit).toFixed(digits)} ${unitLabel(unit)}`;
}

export function formatSpeed(mps: number, unit: DistanceUnit, digits = 0): string {
  return `${mpsToUnitSpeed(mps, unit).toFixed(digits)} ${speedLabel(unit)}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatHours(seconds: number, digits = 1): string {
  return `${(seconds / 3600).toFixed(digits)}h`;
}

// ---- Geospatial math ----

/** Great-circle distance between two points in meters (Haversine). */
export function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Sum the path distance in meters. */
export function pathDistance(path: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversine(path[i - 1], path[i]);
  }
  return total;
}

/**
 * Reverse geocode a coordinate into a human address.
 *
 * PRIVACY: sends the coordinates to a third party. Caller must gate this
 * behind an explicit user opt-in. When the Google Maps connector is linked
 * the server-side gateway path is used; otherwise falls back to the free
 * OpenStreetMap Nominatim endpoint. Throttled to <=1 req/s per Nominatim ToS.
 */
let lastNominatimAt = 0;
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Try the Google Maps connector server function first when available.
  try {
    const mod = await import("./maps.functions").catch(() => null);
    if (mod && typeof mod.reverseGeocodeGoogle === "function") {
      const res = await mod.reverseGeocodeGoogle({ data: { lat, lng } });
      if (res?.address) return res.address;
    }
  } catch {
    /* fall through to Nominatim */
  }
  try {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const a = data.address ?? {};
    const road = a.road ?? a.pedestrian ?? a.neighbourhood ?? "";
    const city = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? "";
    const state = a.state ?? "";
    const parts = [road, city, state].filter(Boolean);
    if (parts.length) return parts.join(", ");
    return data.display_name?.split(",").slice(0, 2).join(", ") ?? coordString(lat, lng);
  } catch {
    return coordString(lat, lng);
  }
}

function coordString(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/**
 * Ramer–Douglas–Peucker path simplification to keep stored routes small while
 * preserving shape. Tolerance is in degrees (~1e-4 ≈ 11m).
 */
export function simplifyPath(points: TrackPoint[], tolerance = 0.00008): TrackPoint[] {
  if (points.length < 3) return points;
  // Iterative RDP — a hostile/huge imported path must not blow the JS stack.
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = true;
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function perpDistance(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(p.lng - a.lng, p.lat - a.lat);
  const u = ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (mag * mag);
  const cx = a.lng + u * dx;
  const cy = a.lat + u * dy;
  return Math.hypot(p.lng - cx, p.lat - cy);
}

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TrackPoint } from "@/lib/types";

interface RouteMapProps {
  path: TrackPoint[];
  className?: string;
  /** Show start/end markers. */
  markers?: boolean;
}

/**
 * Lightweight, dependency-free route renderer. Draws the recorded GPS polyline
 * scaled to its bounding box with a subtle grid backdrop. Works fully offline
 * and needs no API key. When the Google Maps connector is enabled this can be
 * swapped for an interactive map without changing callers.
 */
export function RouteMap({ path, className, markers = true }: RouteMapProps) {
  const geometry = useMemo(() => computeGeometry(path), [path]);

  if (!geometry) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground",
          className,
        )}
      >
        No route recorded
      </div>
    );
  }

  const { points, start, end } = geometry;

  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-muted", className)}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <pattern id="rm-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M 10 0 L 0 0 0 10"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="0.4"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#rm-grid)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.35"
        />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {markers && (
          <>
            <circle cx={start.x} cy={start.y} r="2.4" fill="var(--color-business)" stroke="white" strokeWidth="0.8" />
            <circle cx={end.x} cy={end.y} r="2.4" fill="var(--color-destructive)" stroke="white" strokeWidth="0.8" />
          </>
        )}
      </svg>
    </div>
  );
}

function computeGeometry(path: TrackPoint[]) {
  if (!path || path.length < 2) return null;
  const lats = path.map((p) => p.lat);
  const lngs = path.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-5;
  const spanLng = maxLng - minLng || 1e-5;
  const pad = 12;
  const scale = 100 - pad * 2;

  const project = (p: TrackPoint) => ({
    x: pad + ((p.lng - minLng) / spanLng) * scale,
    // invert y so north is up
    y: pad + (1 - (p.lat - minLat) / spanLat) * scale,
  });

  const projected = path.map(project);
  const points = projected.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  return { points, start: projected[0], end: projected[projected.length - 1] };
}

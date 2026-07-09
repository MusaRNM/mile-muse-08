import type { Trip } from "./types";

/** Sum of trip distance (meters) accumulated on/after the baseline timestamp. */
export function tripsSinceBaselineMeters(trips: Trip[], baselineAt: number): number {
  let total = 0;
  for (const t of trips) {
    if (t.startTime >= baselineAt) total += t.distanceMeters;
  }
  return total;
}

/** Current odometer reading in meters. */
export function currentOdometerMeters(
  trips: Trip[],
  baselineMeters: number,
  baselineAt: number,
): number {
  return baselineMeters + tripsSinceBaselineMeters(trips, baselineAt);
}

/** Roughly 30 days. */
export const MONTHLY_PROMPT_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldPromptOdometerCheck(opts: {
  baselineMeters: number;
  baselineAt: number;
  lastPromptAt: number;
  now?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  if (opts.baselineAt <= 0) return false; // never configured
  const anchor = Math.max(opts.baselineAt, opts.lastPromptAt);
  return now - anchor >= MONTHLY_PROMPT_MS;
}
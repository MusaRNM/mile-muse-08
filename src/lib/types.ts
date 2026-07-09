// Core domain types for MileTrack.
// All data is stored locally-first (IndexedDB via Dexie). Types are designed to
// be extensible for future features (multiple vehicles, voice notes, expenses).

export type TripCategory = "business" | "personal" | "unclassified";

/** A single GPS sample recorded during a trip. */
export interface TrackPoint {
  lat: number;
  lng: number;
  /** Epoch ms. */
  t: number;
  /** Speed in m/s as reported by the Geolocation API (may be null). */
  speed?: number | null;
}

export interface Trip {
  id: string;
  /** Epoch ms for the start of the trip. */
  startTime: number;
  /** Epoch ms for the end of the trip. */
  endTime: number;
  /** Total driving duration in seconds (excludes long stops when computed). */
  durationSec: number;
  /** Distance in meters (canonical unit; converted for display). */
  distanceMeters: number;
  /** Average speed in m/s. */
  avgSpeed: number;
  /** Max speed in m/s. */
  maxSpeed: number;
  category: TripCategory;
  startAddress?: string;
  endAddress?: string;
  /** Simplified route polyline. */
  path: TrackPoint[];
  /** Optional user note (future: voice notes). */
  note?: string;
  /** Was this trip captured automatically or added manually. */
  source: "auto" | "manual";
  createdAt: number;
  updatedAt: number;
}

export interface FuelEntry {
  id: string;
  /** Epoch ms of purchase date. */
  date: number;
  station?: string;
  /** Total price in USD. */
  totalPrice: number;
  gallons: number;
  /** Price per gallon in USD. */
  pricePerGallon: number;
  /** Optional receipt image as a data URL / blob URL. */
  receiptImage?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type DistanceUnit = "mi" | "km";

export interface AppSettings {
  distanceUnit: DistanceUnit;
  /** Enable foreground automatic trip detection. */
  autoDetect: boolean;
  /** Speed threshold to start a trip, stored in mph. */
  startThresholdMph: number;
  /** Minutes stopped before a trip auto-ends. */
  stopMinutes: number;
  /** Prompt to classify a trip when it ends. */
  promptOnEnd: boolean;
  /** IRS standard business mileage rate in USD per mile. */
  irsRatePerMile: number;
  theme: "light" | "dark" | "system";
  /** Send trip start/end coordinates to a geocoding service to resolve
   *  street addresses. Off by default for privacy. */
  reverseGeocodeEnabled: boolean;
  /** Opt-in cloud sync (requires sign-in and a passphrase). */
  cloudSyncEnabled: boolean;
  /** Odometer baseline in meters. Current odometer = baseline + distance of
   *  trips recorded on/after odometerBaselineAt. */
  odometerBaselineMeters: number;
  /** Epoch ms when the baseline was last set/confirmed. Trips at/after this
   *  timestamp count toward the current odometer. */
  odometerBaselineAt: number;
  /** Epoch ms of the last monthly "is this correct?" prompt. */
  odometerLastPromptAt: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  distanceUnit: "mi",
  autoDetect: false, // must be an explicit opt-in — see TrackerBootstrap
  startThresholdMph: 10,
  stopMinutes: 3,
  promptOnEnd: true,
  irsRatePerMile: 0.7, // 2025 IRS standard business mileage rate
  theme: "system",
  reverseGeocodeEnabled: false,
  cloudSyncEnabled: false,
  odometerBaselineMeters: 0,
  odometerBaselineAt: 0,
  odometerLastPromptAt: 0,
};

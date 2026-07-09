import Dexie, { type Table } from "dexie";
import { z } from "zod";
import type { Trip, FuelEntry } from "./types";

/**
 * Local-first database. Everything the app records lives here in the browser's
 * IndexedDB. Cloud backup/sync can later mirror these tables without changing
 * the app's read/write code.
 */
class MileTrackDB extends Dexie {
  trips!: Table<Trip, string>;
  fuel!: Table<FuelEntry, string>;

  constructor() {
    super("miletrack");
    this.version(1).stores({
      trips: "id, startTime, category, createdAt",
      fuel: "id, date, createdAt",
    });
  }
}

let _db: MileTrackDB | null = null;

/** Lazily create the DB so it never runs during SSR. */
export function db(): MileTrackDB {
  if (typeof window === "undefined") {
    throw new Error("Database is only available in the browser");
  }
  if (!_db) _db = new MileTrackDB();
  return _db;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ---- Trips ----
export async function saveTrip(trip: Trip): Promise<void> {
  await db().trips.put(trip);
}

export async function getTrips(): Promise<Trip[]> {
  return db().trips.orderBy("startTime").reverse().toArray();
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  return db().trips.get(id);
}

export async function deleteTrip(id: string): Promise<void> {
  await db().trips.delete(id);
}

// ---- Fuel ----
export async function saveFuel(entry: FuelEntry): Promise<void> {
  await db().fuel.put(entry);
}

export async function getFuelEntries(): Promise<FuelEntry[]> {
  return db().fuel.orderBy("date").reverse().toArray();
}

export async function deleteFuel(id: string): Promise<void> {
  await db().fuel.delete(id);
}

// ---- Backup / Restore ----
export interface BackupData {
  version: 1;
  exportedAt: number;
  trips: Trip[];
  fuel: FuelEntry[];
}

// Only allow safe base64 image data URLs for user-uploaded receipts.
const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_RECEIPT_BYTES = 2_000_000; // ~2MB base64
const MAX_PATH_POINTS = 20_000;
const MAX_NOTE_LEN = 2_000;
const MAX_ADDR_LEN = 500;
const MAX_STATION_LEN = 200;

const trackPointSchema = z.object({
  lat: z.number().finite().gte(-90).lte(90),
  lng: z.number().finite().gte(-180).lte(180),
  t: z.number().finite().nonnegative(),
  speed: z.number().finite().nullable().optional(),
});

const tripSchema = z.object({
  id: z.string().min(1).max(128),
  startTime: z.number().finite(),
  endTime: z.number().finite(),
  durationSec: z.number().finite().nonnegative().max(60 * 60 * 24 * 7),
  distanceMeters: z.number().finite().nonnegative().max(1e8),
  avgSpeed: z.number().finite().nonnegative().max(200),
  maxSpeed: z.number().finite().nonnegative().max(200),
  category: z.enum(["business", "personal", "unclassified"]),
  startAddress: z.string().max(MAX_ADDR_LEN).optional(),
  endAddress: z.string().max(MAX_ADDR_LEN).optional(),
  path: z.array(trackPointSchema).max(MAX_PATH_POINTS),
  note: z.string().max(MAX_NOTE_LEN).optional(),
  source: z.enum(["auto", "manual"]),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).strict();

const fuelSchema = z.object({
  id: z.string().min(1).max(128),
  date: z.number().finite(),
  station: z.string().max(MAX_STATION_LEN).optional(),
  totalPrice: z.number().finite().nonnegative().max(100_000),
  gallons: z.number().finite().nonnegative().max(100_000),
  pricePerGallon: z.number().finite().nonnegative().max(1_000),
  receiptImage: z
    .string()
    .max(MAX_RECEIPT_BYTES)
    .refine((s) => SAFE_IMAGE_DATA_URL.test(s), "receiptImage must be a base64 image data URL")
    .optional(),
  note: z.string().max(MAX_NOTE_LEN).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).strict();

const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().finite(),
  trips: z.array(tripSchema).max(500_000),
  fuel: z.array(fuelSchema).max(500_000),
}).strict();

export function validateBackup(data: unknown): BackupData {
  return backupSchema.parse(data) as BackupData;
}

export async function exportBackup(): Promise<BackupData> {
  const [trips, fuel] = await Promise.all([
    db().trips.toArray(),
    db().fuel.toArray(),
  ]);
  return { version: 1, exportedAt: Date.now(), trips, fuel };
}

export async function importBackup(data: BackupData, replace = false): Promise<void> {
  // Re-validate defensively even if the caller says it already parsed.
  const clean = validateBackup(data);
  if (replace) {
    await db().trips.clear();
    await db().fuel.clear();
  }
  if (clean.trips.length) await db().trips.bulkPut(clean.trips);
  if (clean.fuel.length) await db().fuel.bulkPut(clean.fuel);
}

export async function clearAllData(): Promise<void> {
  await db().trips.clear();
  await db().fuel.clear();
}

/** Safe check for rendering `receiptImage` as an <img src>. */
export function isSafeImageDataUrl(s: string | undefined | null): s is string {
  if (!s) return false;
  return SAFE_IMAGE_DATA_URL.test(s) && s.length <= MAX_RECEIPT_BYTES;
}


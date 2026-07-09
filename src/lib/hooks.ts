import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getFuelEntries, getTrips } from "./db";
import type { FuelEntry, Trip } from "./types";

/** True only after the component has mounted on the client. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Reactive list of all trips (newest first). Updates automatically on change. */
export function useTrips(): Trip[] | undefined {
  const mounted = useMounted();
  return useLiveQuery(() => (mounted ? getTrips() : Promise.resolve([])), [mounted]);
}

/** Reactive list of all fuel entries (newest first). */
export function useFuel(): FuelEntry[] | undefined {
  const mounted = useMounted();
  return useLiveQuery(() => (mounted ? getFuelEntries() : Promise.resolve([])), [mounted]);
}

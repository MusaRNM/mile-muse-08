import { create } from "zustand";
import { newId, saveTrip } from "./db";
import { haversine, mphToMps, pathDistance, reverseGeocode, simplifyPath } from "./geo";
import { useSettings } from "./settings";
import type { TrackPoint, Trip } from "./types";

export type PermissionStatus = "unknown" | "prompt" | "granted" | "denied";

interface TrackerState {
  /** GPS watch is active (auto-detect listening or a trip recording). */
  watching: boolean;
  /** A trip is actively being recorded. */
  recording: boolean;
  /** True when recording was started manually (ignores speed threshold). */
  manual: boolean;
  permission: PermissionStatus;
  error: string | null;

  // Live stats for the active trip
  path: TrackPoint[];
  startTime: number | null;
  distanceMeters: number;
  currentSpeed: number; // m/s
  maxSpeed: number; // m/s
  lastMoveTime: number | null;

  /** Trip id waiting for the user to classify (business/personal). */
  pendingClassifyId: string | null;

  enableWatch: () => void;
  disableWatch: () => void;
  startManual: () => void;
  stopAndSave: () => Promise<string | null>;
  discard: () => void;
  clearPending: () => void;
  requestPermission: () => Promise<PermissionStatus>;
}

let watchId: number | null = null;

function geo(): Geolocation | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return navigator.geolocation;
}

export const useTracker = create<TrackerState>((set, get) => {
  function reset() {
    set({
      recording: false,
      manual: false,
      path: [],
      startTime: null,
      distanceMeters: 0,
      currentSpeed: 0,
      maxSpeed: 0,
      lastMoveTime: null,
    });
  }

  function onPosition(pos: GeolocationPosition) {
    const s = get();
    const settings = useSettings.getState();
    const startMps = mphToMps(settings.startThresholdMph);
    const now = pos.timestamp || Date.now();
    const point: TrackPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      t: now,
      speed: pos.coords.speed,
    };

    // Derive a speed even when the device doesn't report one.
    let speed = pos.coords.speed ?? 0;
    if ((speed === null || speed <= 0) && s.path.length > 0) {
      const prev = s.path[s.path.length - 1];
      const dt = (now - prev.t) / 1000;
      if (dt > 0) speed = haversine(prev, point) / dt;
    }
    speed = Math.max(0, speed || 0);

    set({ permission: "granted", currentSpeed: speed });

    // Auto-start a trip when moving fast enough.
    if (!s.recording) {
      if (settings.autoDetect && speed >= startMps) {
        set({
          recording: true,
          manual: false,
          startTime: now,
          path: [point],
          distanceMeters: 0,
          maxSpeed: speed,
          lastMoveTime: now,
        });
      }
      return;
    }

    // Recording: append point and update stats.
    const path = [...s.path, point];
    const distanceMeters = s.distanceMeters + (s.path.length ? haversine(s.path[s.path.length - 1], point) : 0);
    const maxSpeed = Math.max(s.maxSpeed, speed);
    const moving = speed >= mphToMps(3);
    set({
      path,
      distanceMeters,
      maxSpeed,
      lastMoveTime: moving ? now : s.lastMoveTime,
    });

    // Auto-end after being stopped for the configured number of minutes.
    if (!s.manual && s.lastMoveTime) {
      const stoppedMs = now - s.lastMoveTime;
      if (stoppedMs > settings.stopMinutes * 60 * 1000) {
        void get().stopAndSave();
      }
    }
  }

  function onError(err: GeolocationPositionError) {
    if (err.code === err.PERMISSION_DENIED) {
      set({ permission: "denied", error: "Location permission denied.", watching: false });
      stopWatch();
    } else {
      set({ error: err.message });
    }
  }

  function startWatch() {
    const g = geo();
    if (!g) {
      set({ error: "Geolocation is not supported on this device." });
      return;
    }
    if (watchId !== null) return;
    watchId = g.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 20000,
    });
    set({ watching: true, error: null });
  }

  function stopWatch() {
    const g = geo();
    if (g && watchId !== null) g.clearWatch(watchId);
    watchId = null;
    set({ watching: false });
  }

  return {
    watching: false,
    recording: false,
    manual: false,
    permission: "unknown",
    error: null,
    path: [],
    startTime: null,
    distanceMeters: 0,
    currentSpeed: 0,
    maxSpeed: 0,
    lastMoveTime: null,
    pendingClassifyId: null,

    enableWatch: () => startWatch(),
    disableWatch: () => {
      stopWatch();
      reset();
    },

    startManual: () => {
      startWatch();
      const now = Date.now();
      set({
        recording: true,
        manual: true,
        startTime: now,
        path: [],
        distanceMeters: 0,
        maxSpeed: 0,
        currentSpeed: 0,
        lastMoveTime: now,
      });
    },

    stopAndSave: async () => {
      const s = get();
      if (!s.recording || !s.startTime) {
        reset();
        return null;
      }
      const endTime = Date.now();
      const rawPath = s.path;
      const path = simplifyPath(rawPath);
      const distanceMeters = s.distanceMeters || pathDistance(rawPath);
      const durationSec = Math.max(1, Math.round((endTime - s.startTime) / 1000));
      const avgSpeed = distanceMeters / durationSec;

      const id = newId();
      const trip: Trip = {
        id,
        startTime: s.startTime,
        endTime,
        durationSec,
        distanceMeters,
        avgSpeed,
        maxSpeed: s.maxSpeed,
        category: "unclassified",
        path,
        source: s.manual ? "manual" : "auto",
        createdAt: endTime,
        updatedAt: endTime,
      };

      // Persist immediately so nothing is lost, then enrich with addresses.
      await saveTrip(trip);
      const promptOnEnd = useSettings.getState().promptOnEnd;
      reset();
      set({ pendingClassifyId: promptOnEnd ? id : null });

      // Reverse-geocode in the background — only if the user explicitly opted in.
      if (rawPath.length > 0 && useSettings.getState().reverseGeocodeEnabled) {
        const first = rawPath[0];
        const last = rawPath[rawPath.length - 1];
        const [startAddress, endAddress] = await Promise.all([
          reverseGeocode(first.lat, first.lng),
          reverseGeocode(last.lat, last.lng),
        ]);
        await saveTrip({ ...trip, startAddress, endAddress, updatedAt: Date.now() });
      }
      return id;
    },

    discard: () => reset(),
    clearPending: () => set({ pendingClassifyId: null }),

    requestPermission: async () => {
      const g = geo();
      if (!g) {
        set({ permission: "denied", error: "Geolocation is not supported." });
        return "denied";
      }
      return new Promise<PermissionStatus>((resolve) => {
        g.getCurrentPosition(
          () => {
            set({ permission: "granted", error: null });
            resolve("granted");
          },
          (err) => {
            const status: PermissionStatus =
              err.code === err.PERMISSION_DENIED ? "denied" : "prompt";
            set({ permission: status });
            resolve(status);
          },
          { enableHighAccuracy: true, timeout: 15000 },
        );
      });
    },
  };
});

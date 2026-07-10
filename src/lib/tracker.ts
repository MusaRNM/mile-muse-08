import { create } from "zustand";
import { newId, saveTrip } from "./db";
import { formatSpeed, haversine, mphToMps, pathDistance, reverseGeocode, simplifyPath } from "./geo";
import { useSettings } from "./settings";
import type { TrackPoint, Trip } from "./types";
import {
  ensureNotificationPermission,
  isNativeApp,
  notify,
  requestNativeLocation,
  openNativeLocationSettings,
  startBackgroundTracking,
  stopBackgroundTracking,
} from "./native";

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
  lastFixAt: number | null;
  lastAccuracyMeters: number | null;
  locationSampleCount: number;

  /** Trip id waiting for the user to classify (business/personal). */
  pendingClassifyId: string | null;

  enableWatch: () => void;
  disableWatch: () => void;
  startManual: () => void;
  stopAndSave: () => Promise<string | null>;
  discard: () => void;
  clearPending: () => void;
  requestPermission: () => Promise<PermissionStatus>;
  openLocationSettings: () => Promise<void>;
}

let watchId: number | null = null;
let lastWatchPoint: TrackPoint | null = null;
let autoStopTimer: ReturnType<typeof setInterval> | null = null;

function geo(): Geolocation | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return navigator.geolocation;
}

export const useTracker = create<TrackerState>((set, get) => {
  function clearAutoStopTimer() {
    if (autoStopTimer) clearInterval(autoStopTimer);
    autoStopTimer = null;
  }

  function armAutoStopTimer() {
    if (autoStopTimer) return;
    autoStopTimer = setInterval(() => {
      const state = get();
      if (!state.recording || !state.lastMoveTime) return;
      const stoppedMs = Date.now() - state.lastMoveTime;
      if (stoppedMs > useSettings.getState().stopMinutes * 60 * 1000) {
        void state.stopAndSave();
      }
    }, 30_000);
  }

  function reset() {
    clearAutoStopTimer();
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
    const accuracy = pos.coords.accuracy;
    if (Number.isFinite(accuracy) && accuracy > 500) return;
    const point: TrackPoint = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      t: now,
      speed: pos.coords.speed,
    };

    // Android GPS often reports `speed: null`; derive it from consecutive
    // samples so auto-start and live mph still work.
    const previousWatchPoint = lastWatchPoint;
    let speed = typeof pos.coords.speed === "number" && Number.isFinite(pos.coords.speed) ? pos.coords.speed : 0;
    if (speed <= 0 && previousWatchPoint) {
      const prev = previousWatchPoint;
      const dt = (now - prev.t) / 1000;
      const distance = haversine(prev, point);
      if (dt >= 1 && dt <= 180 && distance >= 3) speed = distance / dt;
    }
    speed = Math.max(0, speed || 0);
    lastWatchPoint = point;

    set((state) => ({
      permission: "granted",
      currentSpeed: speed,
      lastFixAt: now,
      lastAccuracyMeters: Number.isFinite(accuracy) ? accuracy : null,
      locationSampleCount: state.locationSampleCount + 1,
    }));

    // Auto-start a trip when moving fast enough.
    if (!s.recording) {
      if (settings.autoDetect && speed >= startMps) {
        const startingPath =
          previousWatchPoint && now - previousWatchPoint.t <= 120_000
            ? [previousWatchPoint, point]
            : [point];
        set({
          recording: true,
          manual: false,
          startTime: now,
          path: startingPath,
          distanceMeters: pathDistance(startingPath),
          maxSpeed: speed,
          lastMoveTime: now,
        });
        armAutoStopTimer();
        void notify("Auto trip recording started", `MileTrack is tracking at ${formatSpeed(speed, settings.distanceUnit)}.`);
      }
      return;
    }

    // Recording: append point and update stats.
    const path = [...s.path, point];
    const distanceMeters = s.distanceMeters + (s.path.length ? haversine(s.path[s.path.length - 1], point) : 0);
    const maxSpeed = Math.max(s.maxSpeed, speed);
    const moving = speed >= mphToMps(3);
    const lastMoveTime = moving ? now : s.lastMoveTime;
    set({
      path,
      distanceMeters,
      maxSpeed,
      lastMoveTime,
    });

    // Auto-end after being stopped for the configured number of minutes.
    // Applies to BOTH manual and auto-detected trips so a forgotten "Stop"
    // won't leave a trip recording forever while you're parked.
    if (lastMoveTime) {
      const stoppedMs = now - lastMoveTime;
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

  function handleNativePoint(p: { latitude: number; longitude: number; accuracy: number | null; speed: number | null; time: number }) {
    onPosition({
      coords: {
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy: p.accuracy ?? 0,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: p.speed,
      },
      timestamp: p.time,
    } as GeolocationPosition);
  }

  function startWatch() {
    // Prefer background-capable native tracking on iOS/Android; falls back
    // to browser watchPosition otherwise.
    if (isNativeApp()) {
      void startBackgroundTracking(handleNativePoint).then((ok) => {
        if (ok) set({ watching: true, error: null, permission: "granted" });
        else set({ error: "Android background GPS did not start. Check location permissions." });
      });
      // Also start a foreground watch so the UI updates immediately even
      // before the background service delivers its first point.
    }
    const g = geo();
    if (!g) {
      if (!isNativeApp()) set({ error: "Geolocation is not supported on this device." });
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
    lastWatchPoint = null;
    if (isNativeApp()) void stopBackgroundTracking();
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
    lastFixAt: null,
    lastAccuracyMeters: null,
    locationSampleCount: 0,
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
      armAutoStopTimer();
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
      // Best-effort completion notification (native or web).
      try {
        const miles = (distanceMeters / 1609.344).toFixed(1);
        void notify("Trip saved", `${miles} mi · ${Math.round(durationSec / 60)} min`);
      } catch {
        /* ignore */
      }
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
    openLocationSettings: () => openNativeLocationSettings(),

    requestPermission: async () => {
      // Native: use Capacitor Geolocation permissions API so the OS prompt
      // is shown, and remember the answer for good.
      if (isNativeApp()) {
        const ok = await requestNativeLocation();
        set({ permission: ok ? "granted" : "denied", error: ok ? null : "Location permission denied." });
        if (ok) {
          try {
            useSettings.getState().update({ autoDetect: true });
          } catch {
            /* ignore */
          }
          void ensureNotificationPermission();
        }
        return ok ? "granted" : "denied";
      }
      const g = geo();
      if (!g) {
        set({ permission: "denied", error: "Geolocation is not supported." });
        return "denied";
      }
      return new Promise<PermissionStatus>((resolve) => {
        g.getCurrentPosition(
          () => {
            set({ permission: "granted", error: null });
            try {
              useSettings.getState().update({ autoDetect: true });
            } catch {
              /* ignore */
            }
            void ensureNotificationPermission();
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

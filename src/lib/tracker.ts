import { create } from "zustand";
import { deleteTrip, newId, saveTrip } from "./db";
import { formatSpeed, haversine, mphToMps, pathDistance, reverseGeocode, simplifyPath } from "./geo";
import { useSettings } from "./settings";
import type { TrackPoint, Trip } from "./types";
import {
  clearTripStopNotification,
  ensureNotificationPermission,
  isNativeApp,
  notify,
  notifyTripAppearsEnded,
  requestNativeLocation,
  openNativeLocationSettings,
  registerTripStopNotificationActions,
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
  stopPromptOpen: boolean;

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
  stationarySince: number | null;

  /**
   * Id assigned at trip-start. Used to durably upsert the in-progress trip
   * into IndexedDB so a phone reboot or process kill mid-trip does not lose
   * the recording. Same id is reused when the trip is finalized.
   */
  draftTripId: string | null;

  /** Trip id waiting for the user to classify (business/personal). */
  pendingClassifyId: string | null;

  enableWatch: () => void;
  disableWatch: () => void;
  startManual: () => void;
  stopAndSave: () => Promise<string | null>;
  continueInTraffic: () => void;
  discard: () => void;
  clearPending: () => void;
  requestPermission: () => Promise<PermissionStatus>;
  openLocationSettings: () => Promise<void>;
}

let watchId: number | null = null;
let lastWatchPoint: TrackPoint | null = null;
let autoStopTimer: ReturnType<typeof setInterval> | null = null;
let draftFlushTimer: ReturnType<typeof setInterval> | null = null;
let lifecycleAttached = false;
let nativeActionsRegistered = false;

const ACTIVE_TRIP_KEY = "miletrack-active-trip-v2";
const MAX_SNAPSHOT_POINTS = 4000; // cap localStorage payload (~5MB browser limit)
const DRAFT_FLUSH_MS = 30_000;
const MAX_REASONABLE_SPEED_MPS = mphToMps(130);

type ActiveTripSnapshot = Pick<
  TrackerState,
  | "recording"
  | "manual"
  | "path"
  | "startTime"
  | "distanceMeters"
  | "currentSpeed"
  | "maxSpeed"
  | "lastMoveTime"
  | "stationarySince"
  | "draftTripId"
>;

function geo(): Geolocation | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return navigator.geolocation;
}

function loadActiveTripSnapshot(): ActiveTripSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_TRIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveTripSnapshot;
    if (!parsed.recording || !parsed.startTime || !Array.isArray(parsed.path)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveActiveTripSnapshot(snapshot: ActiveTripSnapshot | null) {
  if (typeof window === "undefined") return;
  try {
    if (!snapshot?.recording) window.localStorage.removeItem(ACTIVE_TRIP_KEY);
    else window.localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
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
      if (!state.recording || !state.stationarySince || state.stopPromptOpen) return;
      const stoppedMs = Date.now() - state.stationarySince;
      if (stoppedMs >= useSettings.getState().stopMinutes * 60 * 1000) {
        triggerStopPrompt();
      }
    }, 30_000);
  }

  function persistCurrentTrip() {
    const state = get();
    // Bound the localStorage payload for very long trips. IndexedDB (via
    // flushDraftTrip) keeps the full-fidelity path — this is a hot-recovery
    // hint only.
    const path = state.path.length > MAX_SNAPSHOT_POINTS
      ? state.path.slice(-MAX_SNAPSHOT_POINTS)
      : state.path;
    saveActiveTripSnapshot({
      recording: state.recording,
      manual: state.manual,
      path,
      startTime: state.startTime,
      distanceMeters: state.distanceMeters,
      currentSpeed: state.currentSpeed,
      maxSpeed: state.maxSpeed,
      lastMoveTime: state.lastMoveTime,
      stationarySince: state.stationarySince,
      draftTripId: state.draftTripId,
    });
  }

  /**
   * Upsert the in-progress trip into IndexedDB so a phone reboot or a mid-trip
   * process kill leaves a recoverable record instead of silently discarding
   * everything. Uses the pre-assigned draftTripId so finalization overwrites
   * the same row.
   */
  async function flushDraftTrip() {
    const s = get();
    if (!s.recording || !s.startTime || !s.draftTripId || s.path.length === 0) return;
    const now = Date.now();
    const durationSec = Math.max(1, Math.round((now - s.startTime) / 1000));
    const trip: Trip = {
      id: s.draftTripId,
      startTime: s.startTime,
      endTime: now,
      durationSec,
      distanceMeters: s.distanceMeters,
      avgSpeed: s.distanceMeters / durationSec,
      maxSpeed: s.maxSpeed,
      category: "unclassified",
      path: simplifyPath(s.path),
      source: s.manual ? "manual" : "auto",
      createdAt: s.startTime,
      updatedAt: now,
    };
    try {
      await saveTrip(trip);
    } catch {
      /* ignore — best-effort durability */
    }
  }

  function armDraftFlushTimer() {
    if (draftFlushTimer) return;
    draftFlushTimer = setInterval(() => void flushDraftTrip(), DRAFT_FLUSH_MS);
  }

  function clearDraftFlushTimer() {
    if (draftFlushTimer) clearInterval(draftFlushTimer);
    draftFlushTimer = null;
  }

  function attachLifecycle() {
    if (lifecycleAttached || typeof window === "undefined") return;
    lifecycleAttached = true;
    // Flush on tab/app hide — covers browser tab close and Capacitor pause
    // (Capacitor forwards pause as visibilitychange on the WebView).
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushDraftTrip();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => void flushDraftTrip());
    // Best-effort native app pause listener.
    if (isNativeApp()) {
      void import("@capacitor/app").then(({ App }) => {
        void App.addListener("pause", () => void flushDraftTrip());
        void App.addListener("appStateChange", (s: { isActive: boolean }) => {
          if (!s.isActive) void flushDraftTrip();
        });
      }).catch(() => {/* ignore */});
    }
  }

  function updateTripState(patch: Partial<TrackerState>) {
    set(patch);
    persistCurrentTrip();
  }

  function triggerStopPrompt() {
    const state = get();
    if (!state.recording || state.stopPromptOpen) return;
    set({ stopPromptOpen: true });
    void notifyTripAppearsEnded();
  }

  function calculateSpeed(point: TrackPoint, reportedSpeed: number | null | undefined, previous: TrackPoint | null) {
    let speed = typeof reportedSpeed === "number" && Number.isFinite(reportedSpeed) ? reportedSpeed : 0;
    if (speed <= 0 && previous) {
      const dt = (point.t - previous.t) / 1000;
      const distance = haversine(previous, point);
      if (dt >= 1 && dt <= 180 && distance >= 3) speed = distance / dt;
    }
    if (!Number.isFinite(speed) || speed < 0) return 0;
    if (speed > MAX_REASONABLE_SPEED_MPS) return 0;
    return speed;
  }

  function reset(keepWatching = true) {
    clearAutoStopTimer();
    clearDraftFlushTimer();
    void clearTripStopNotification();
    saveActiveTripSnapshot(null);
    if (!keepWatching || !useSettings.getState().autoDetect) {
      if (isNativeApp()) void stopBackgroundTracking();
      const g = geo();
      if (g && watchId !== null) g.clearWatch(watchId);
      watchId = null;
      lastWatchPoint = null;
      set({ watching: false });
    } else if (isNativeApp()) {
      void startBackgroundTracking(handleNativePoint, "detect");
    }
    set({
      recording: false,
      manual: false,
      stopPromptOpen: false,
      path: [],
      startTime: null,
      distanceMeters: 0,
      currentSpeed: 0,
      maxSpeed: 0,
      lastMoveTime: null,
      stationarySince: null,
      draftTripId: null,
    });
  }

  function onPosition(pos: GeolocationPosition) {
    const s = get();
    const settings = useSettings.getState();
    const startMps = mphToMps(settings.startThresholdMph);
    const stopMps = mphToMps(settings.stopThresholdMph);
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
    const speed = calculateSpeed(point, pos.coords.speed, previousWatchPoint);
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
        updateTripState({
          recording: true,
          manual: false,
          stopPromptOpen: false,
          startTime: now,
          draftTripId: newId(),
          path: startingPath,
          distanceMeters: pathDistance(startingPath),
          maxSpeed: speed,
          lastMoveTime: now,
          stationarySince: null,
        });
        armAutoStopTimer();
        armDraftFlushTimer();
        if (isNativeApp()) void startBackgroundTracking(handleNativePoint, "record");
        void notify("Auto trip recording started", `MileTrack is tracking at ${formatSpeed(speed, settings.distanceUnit)}.`);
      }
      return;
    }

    // Recording: append point and update stats.
    const moving = speed >= stopMps;
    if (s.stopPromptOpen && !moving) {
      updateTripState({ stationarySince: s.stationarySince ?? now });
      return;
    }
    const path = [...s.path, point];
    const distanceMeters = s.distanceMeters + (s.path.length ? haversine(s.path[s.path.length - 1], point) : 0);
    const maxSpeed = Math.max(s.maxSpeed, speed);
    const lastMoveTime = moving ? now : s.lastMoveTime;
    const stationarySince = moving ? null : s.stationarySince ?? now;
    updateTripState({
      path,
      distanceMeters,
      maxSpeed,
      lastMoveTime,
      stationarySince,
      stopPromptOpen: moving ? false : s.stopPromptOpen,
    });

    if (moving && s.stopPromptOpen) void clearTripStopNotification();

    // Auto-prompt after staying below the configured stop threshold.
    // Do not require 0 mph; slow traffic can continue by tapping "I'm in Traffic".
    if (stationarySince && now - stationarySince >= settings.stopMinutes * 60 * 1000) {
      triggerStopPrompt();
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
      if (!nativeActionsRegistered) {
        nativeActionsRegistered = true;
        void registerTripStopNotificationActions((action) => {
          if (action === "end") void get().stopAndSave();
          else get().continueInTraffic();
        });
      }
      void startBackgroundTracking(handleNativePoint, get().recording ? "record" : "detect").then((ok) => {
        if (ok) set({ watching: true, error: null, permission: "granted" });
        else set({ error: "Android background GPS did not start. Check location permissions." });
      });
      if (get().recording) armAutoStopTimer();
      return;
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
    if (get().recording) armAutoStopTimer();
    set({ watching: true, error: null });
  }

  function stopWatch() {
    const g = geo();
    if (g && watchId !== null) g.clearWatch(watchId);
    watchId = null;
    lastWatchPoint = null;
    if (isNativeApp() && !get().recording) void stopBackgroundTracking();
    set({ watching: false });
  }

  const recovered = loadActiveTripSnapshot();
  attachLifecycle();

  return {
    watching: false,
    recording: recovered?.recording ?? false,
    manual: recovered?.manual ?? false,
    permission: "unknown",
    error: null,
    stopPromptOpen: false,
    path: recovered?.path ?? [],
    startTime: recovered?.startTime ?? null,
    distanceMeters: recovered?.distanceMeters ?? 0,
    currentSpeed: recovered?.currentSpeed ?? 0,
    maxSpeed: recovered?.maxSpeed ?? 0,
    lastMoveTime: recovered?.lastMoveTime ?? null,
    lastFixAt: null,
    lastAccuracyMeters: null,
    locationSampleCount: 0,
    stationarySince: recovered?.stationarySince ?? null,
    draftTripId: recovered?.draftTripId ?? null,
    pendingClassifyId: null,

    enableWatch: () => {
      startWatch();
      // If we recovered a recording session across a cold start / reboot,
      // re-arm the durability timers so the next flush actually happens.
      if (get().recording) {
        armAutoStopTimer();
        armDraftFlushTimer();
      }
    },
    disableWatch: () => {
      reset(false);
      stopWatch();
    },

    startManual: () => {
      startWatch();
      const now = Date.now();
      set({
        recording: true,
        manual: true,
        stopPromptOpen: false,
        startTime: now,
        draftTripId: newId(),
        path: [],
        distanceMeters: 0,
        maxSpeed: 0,
        currentSpeed: 0,
        lastMoveTime: now,
        stationarySince: null,
      });
      persistCurrentTrip();
      if (isNativeApp()) void startBackgroundTracking(handleNativePoint, "record");
      armAutoStopTimer();
      armDraftFlushTimer();
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

      // Reuse the draft id assigned at trip-start so we overwrite any partial
      // row that was flushed during recording (crash/reboot durability).
      const id = s.draftTripId ?? newId();
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
        createdAt: s.startTime,
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

    continueInTraffic: () => {
      const now = Date.now();
      set({ stopPromptOpen: false, stationarySince: now, lastMoveTime: now });
      persistCurrentTrip();
      void clearTripStopNotification();
      armAutoStopTimer();
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

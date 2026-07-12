/**
 * Native (Capacitor) integration. All entry points are safe to call from web
 * code — when the app is not running inside Capacitor, everything no-ops and
 * the existing browser Geolocation / Notification paths keep working.
 *
 * On iOS/Android the app upgrades to:
 *   - Native geolocation (higher-accuracy background updates).
 *   - Background GPS via @capacitor-community/background-geolocation, which
 *     keeps a foreground service alive on Android and uses iOS's continuous
 *     background location updates so mileage keeps recording while other apps
 *     are open or the screen is off.
 *   - Native local notifications (delivered even when the app is backgrounded).
 */

let cachedIsNative: boolean | null = null;

export const TRIP_STOP_ACTION_TYPE = "trip-stop-actions";
export const TRIP_STOP_END_ACTION = "end-trip";
export const TRIP_STOP_TRAFFIC_ACTION = "traffic";
const TRIP_STOP_NOTIFICATION_ID = 230501;

type NativeBgLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  time?: number | null;
};

type NativeBgLocationError = Error & { code?: string };

type NativeBgLocationPlugin = {
  addWatcher: (
    opts: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    cb: (location?: NativeBgLocation, error?: NativeBgLocationError) => void,
  ) => Promise<string>;
  removeWatcher: (opts: { id: string }) => Promise<void>;
  openSettings?: () => Promise<void>;
};

let backgroundGeolocation: NativeBgLocationPlugin | null = null;

async function getBackgroundGeolocation(): Promise<NativeBgLocationPlugin> {
  if (backgroundGeolocation) return backgroundGeolocation;

  // The community background-geolocation package ships native iOS/Android code
  // and TypeScript definitions, but no browser JavaScript entry file. Importing
  // it directly makes Vite fail module resolution during web/SSR builds. The
  // Capacitor runtime exposes it by plugin name instead.
  const { registerPlugin } = await import("@capacitor/core");
  backgroundGeolocation = registerPlugin<NativeBgLocationPlugin>("BackgroundGeolocation");
  return backgroundGeolocation;
}

export function isNativeApp(): boolean {
  if (cachedIsNative !== null) return cachedIsNative;
  try {
    // Capacitor injects a global at runtime; detect without importing at
    // module scope (keeps web bundles small and SSR-safe).
    const w = typeof window !== "undefined" ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }) : undefined;
    cachedIsNative = !!w?.Capacitor?.isNativePlatform?.();
  } catch {
    cachedIsNative = false;
  }
  return cachedIsNative;
}

export type BgLocationHandler = (pos: {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  time: number;
}) => void;

type TrackingMode = "detect" | "record";

let bgWatcherId: string | null = null;
let notificationActionsReady = false;
let notificationActionListenerReady = false;

/**
 * Start continuous background GPS. Silent no-op on web (browser tracking
 * is handled by the existing navigator.geolocation.watchPosition path).
 */
export async function startBackgroundTracking(onPos: BgLocationHandler, mode: TrackingMode = "detect"): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await ensureNotificationPermission();
    const BG = await getBackgroundGeolocation();
    if (bgWatcherId) {
      try {
        await BG.removeWatcher({ id: bgWatcherId });
      } catch {
        /* ignore */
      }
    }
    const recording = mode === "record";
    bgWatcherId = await BG.addWatcher(
      {
        backgroundMessage: recording
          ? "MileTrack is recording your drive."
          : "MileTrack is watching for driving.",
        backgroundTitle: recording ? "Recording mileage" : "Mileage auto-detect active",
        requestPermissions: true,
        stale: false,
        // Battery: don't stream every fix. 10m while recording keeps a tight
        // route without waking the radio on every sample; 25m in ambient
        // auto-detect is enough to notice motion without meaningful drain.
        distanceFilter: recording ? 10 : 25,
      },
      (location, error) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[bg-geo]", error);
          return;
        }
        if (!location) return;
        onPos({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy ?? null,
          speed: location.speed ?? null,
          time: location.time ?? Date.now(),
        });
      },
    );
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[native] background tracking unavailable", err);
    return false;
  }
}

export async function registerTripStopNotificationActions(onAction: (action: "end" | "traffic") => void): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    if (!notificationActionsReady) {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: TRIP_STOP_ACTION_TYPE,
            actions: [
              { id: TRIP_STOP_END_ACTION, title: "End Trip" },
              { id: TRIP_STOP_TRAFFIC_ACTION, title: "I'm in Traffic" },
            ],
          },
        ],
      });
      notificationActionsReady = true;
    }
    if (!notificationActionListenerReady) {
      await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
        if (event.notification?.extra?.kind !== "trip-stop") return;
        if (event.actionId === TRIP_STOP_END_ACTION) onAction("end");
        if (event.actionId === TRIP_STOP_TRAFFIC_ACTION) onAction("traffic");
      });
      notificationActionListenerReady = true;
    }
  } catch {
    /* ignore */
  }
}

export async function notifyTripAppearsEnded(): Promise<void> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: TRIP_STOP_NOTIFICATION_ID,
            title: "Trip appears to have ended.",
            body: "End the trip or keep recording if you're in traffic.",
            actionTypeId: TRIP_STOP_ACTION_TYPE,
            extra: { kind: "trip-stop" },
            ongoing: true,
            autoCancel: false,
            schedule: { at: new Date(Date.now() + 100), allowWhileIdle: true },
          },
        ],
      });
    } catch {
      /* ignore */
    }
    return;
  }
  await notify("Trip appears to have ended.", "End the trip or keep recording if you're in traffic.");
}

export async function clearTripStopNotification(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: TRIP_STOP_NOTIFICATION_ID }] });
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const notifications = delivered.notifications.filter((notification) => notification.id === TRIP_STOP_NOTIFICATION_ID);
    if (notifications.length) await LocalNotifications.removeDeliveredNotifications({ notifications });
  } catch {
    /* ignore */
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  if (!isNativeApp() || !bgWatcherId) return;
  try {
    const BG = await getBackgroundGeolocation();
    await BG.removeWatcher({ id: bgWatcherId });
  } catch {
    /* ignore */
  }
  bgWatcherId = null;
}

export async function requestNativeLocation(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    await ensureNotificationPermission();
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
    return status.location === "granted" || status.coarseLocation === "granted";
  } catch {
    return false;
  }
}

export async function openNativeLocationSettings(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const BG = await getBackgroundGeolocation();
    await BG.openSettings?.();
  } catch {
    /* ignore */
  }
}

type AppSettingsPlugin = {
  isIgnoringBatteryOptimizations: () => Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimizations: () => Promise<void>;
  openAppDetailsSettings: () => Promise<void>;
};

let appSettingsPlugin: AppSettingsPlugin | null = null;
async function getAppSettings(): Promise<AppSettingsPlugin | null> {
  if (!isNativeApp()) return null;
  if (appSettingsPlugin) return appSettingsPlugin;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    appSettingsPlugin = registerPlugin<AppSettingsPlugin>("AppSettings");
    return appSettingsPlugin;
  } catch {
    return null;
  }
}

/** Returns true when the OS reports the app is exempt from battery optimizations. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  const p = await getAppSettings();
  if (!p) return false;
  try {
    const res = await p.isIgnoringBatteryOptimizations();
    return !!res?.ignoring;
  } catch {
    return false;
  }
}

/** Opens the Android system prompt to whitelist the app from battery optimizations. */
export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  const p = await getAppSettings();
  if (!p) return;
  try {
    await p.requestIgnoreBatteryOptimizations();
  } catch {
    /* ignore */
  }
}

/** Opens the Android app-info screen so the user can set Location → Allow all the time. */
export async function openAppDetailsSettings(): Promise<void> {
  const p = await getAppSettings();
  if (!p) {
    await openNativeLocationSettings();
    return;
  }
  try {
    await p.openAppDetailsSettings();
  } catch {
    await openNativeLocationSettings();
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const current = await LocalNotifications.checkPermissions();
      if (current.display === "granted") return true;
      const req = await LocalNotifications.requestPermissions();
      return req.display === "granted";
    } catch {
      return false;
    }
  }
  // Web fallback.
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const res = await Notification.requestPermission();
    return res === "granted";
  } catch {
    return false;
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (isNativeApp()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 1_000_000),
            title,
            body,
            schedule: { at: new Date(Date.now() + 100) },
          },
        ],
      });
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192.png", tag: "miletrack" });
    }
  } catch {
    /* ignore */
  }
}

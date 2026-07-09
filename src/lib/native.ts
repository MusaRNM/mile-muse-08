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
  speed: number | null;
  time: number;
}) => void;

let bgWatcherId: string | null = null;

/**
 * Start continuous background GPS. Silent no-op on web (browser tracking
 * is handled by the existing navigator.geolocation.watchPosition path).
 */
export async function startBackgroundTracking(onPos: BgLocationHandler): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const mod = await import("@capacitor-community/background-geolocation");
    const BackgroundGeolocation = (mod as unknown as { BackgroundGeolocation?: unknown }).BackgroundGeolocation ?? mod.default;
    const BG = BackgroundGeolocation as {
      addWatcher: (opts: Record<string, unknown>, cb: (location: { latitude: number; longitude: number; speed?: number | null; time?: number } | null, error?: unknown) => void) => Promise<string>;
      removeWatcher: (opts: { id: string }) => Promise<void>;
    };
    if (bgWatcherId) {
      try {
        await BG.removeWatcher({ id: bgWatcherId });
      } catch {
        /* ignore */
      }
    }
    bgWatcherId = await BG.addWatcher(
      {
        backgroundMessage: "MileTrack is recording your drive.",
        backgroundTitle: "Tracking mileage",
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,
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

export async function stopBackgroundTracking(): Promise<void> {
  if (!isNativeApp() || !bgWatcherId) return;
  try {
    const { BackgroundGeolocation } = await import("@capacitor-community/background-geolocation");
    await BackgroundGeolocation.removeWatcher({ id: bgWatcherId });
  } catch {
    /* ignore */
  }
  bgWatcherId = null;
}

export async function requestNativeLocation(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    const status = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
    return status.location === "granted" || status.coarseLocation === "granted";
  } catch {
    return false;
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

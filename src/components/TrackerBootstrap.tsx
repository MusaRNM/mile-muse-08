import { useEffect } from "react";
import { useTracker } from "@/lib/tracker";
import { useSettings } from "@/lib/settings";

/**
 * Runs once on the client. Syncs the current geolocation permission state and,
 * when automatic detection is enabled and permission is granted, starts the
 * foreground GPS watch so trips are detected without any manual action.
 *
 * NOTE: True background tracking (with the app minimized) requires a native
 * wrapper such as Capacitor; in the browser, tracking runs while the app is
 * open/foregrounded.
 */
export function TrackerBootstrap() {
  const enableWatch = useTracker((s) => s.enableWatch);
  const autoDetect = useSettings((s) => s.autoDetect);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (typeof navigator === "undefined") return;
      let granted = false;
      if ("permissions" in navigator) {
        try {
          const status = await navigator.permissions.query({
            name: "geolocation" as PermissionName,
          });
          useTracker.setState({
            permission:
              status.state === "granted"
                ? "granted"
                : status.state === "denied"
                  ? "denied"
                  : "prompt",
          });
          granted = status.state === "granted";
          status.onchange = () => {
            useTracker.setState({
              permission:
                status.state === "granted"
                  ? "granted"
                  : status.state === "denied"
                    ? "denied"
                    : "prompt",
            });
          };
        } catch {
          /* permissions API not available; ignore */
        }
      }
      if (!cancelled && granted && autoDetect) {
        enableWatch();
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [autoDetect, enableWatch]);

  return null;
}

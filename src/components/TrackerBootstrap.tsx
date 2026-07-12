import { useEffect } from "react";
import { useTracker } from "@/lib/tracker";
import { useSettings } from "@/lib/settings";
import { isNativeApp } from "@/lib/native";

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
  const recording = useTracker((s) => s.recording);
  const autoDetect = useSettings((s) => s.autoDetect);

  useEffect(() => {
    let cancelled = false;
    let cleanupResume: (() => void) | undefined;

    async function init() {
      if ((autoDetect || recording) && isNativeApp()) {
        useTracker.setState({ permission: "granted" });
        enableWatch();
        try {
          const { App } = await import("@capacitor/app");
          const resumeHandle = await App.addListener("resume", () => {
            if (useSettings.getState().autoDetect || useTracker.getState().recording) {
              useTracker.getState().enableWatch();
            }
          });
          cleanupResume = () => void resumeHandle.remove();
        } catch {
          /* ignore */
        }
        return;
      }
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
      if (!cancelled && granted && (autoDetect || recording)) {
        enableWatch();
      }
    }

    void init();
    return () => {
      cancelled = true;
      cleanupResume?.();
    };
  }, [autoDetect, enableWatch, recording]);

  return null;
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Ruler, Radar, Timer, Bell, DollarSign, Palette, Download, Upload, Trash2, Gauge, MapPin, BatteryCharging, ShieldCheck, ExternalLink, CheckCircle2, XCircle, Satellite } from "lucide-react";
import {
  isNativeApp,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openAppDetailsSettings,
  openBatteryOptimizationSettings,
  requestNativeLocation,
  checkLocationPermissionState,
  showBatteryStatusNotification,
  clearBatteryStatusNotification,
  type LocationPermissionState,
} from "@/lib/native";

import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSettings } from "@/lib/settings";
import { useTracker } from "@/lib/tracker";
import { exportBackup, importBackup, clearAllData, validateBackup } from "@/lib/db";
import type { DistanceUnit } from "@/lib/types";
import { useTrips } from "@/lib/hooks";
import { currentOdometerMeters } from "@/lib/odometer";
import { metersToUnit, unitLabel } from "@/lib/geo";
import { format } from "date-fns";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MileTrack" },
      { name: "description", content: "Configure units, automatic trip detection, IRS mileage rate, theme, and back up your data." },
    ],
  }),
  component: SettingsPage,
});

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatusRow({
  icon,
  title,
  ok,
  live,
  okText,
  badText,
  pendingText,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  ok: boolean | null;
  live?: boolean;
  okText: string;
  badText: string;
  pendingText: string;
  actionLabel: string;
  onAction: () => void | Promise<void>;
}) {
  const desc = ok === null ? pendingText : ok ? okText : badText;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            {ok === true && <CheckCircle2 className="size-4 text-emerald-500" aria-label="OK" />}
            {ok === false && <XCircle className="size-4 text-destructive" aria-label="Needs attention" />}
            {live && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  ok ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                }`}
                aria-label="Live status"
              >
                <span
                  className={`size-1.5 animate-pulse rounded-full ${
                    ok ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="shrink-0">
        <Button variant={ok ? "outline" : "default"} size="sm" onClick={() => void onAction()}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function SettingsPage() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const enableWatch = useTracker((st) => st.enableWatch);
  const disableWatch = useTracker((st) => st.disableWatch);
  const requestPermission = useTracker((st) => st.requestPermission);
  const trips = useTrips() ?? [];
  const METERS_PER_UNIT = s.distanceUnit === "mi" ? 1609.344 : 1000;
  const currentMeters = currentOdometerMeters(
    trips,
    s.odometerBaselineMeters,
    s.odometerBaselineAt,
  );
  const [odoInput, setOdoInput] = useState("");
  const [native, setNative] = useState(false);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
  const [batteryLive, setBatteryLive] = useState(false);
  const [locPerm, setLocPerm] = useState<LocationPermissionState | null>(null);
  const batteryPollRef = useRef<number | null>(null);
  const batteryPollTimeoutRef = useRef<number | null>(null);
  const stopBatteryLivePoll = () => {
    if (batteryPollRef.current !== null) {
      clearInterval(batteryPollRef.current);
      batteryPollRef.current = null;
    }
    if (batteryPollTimeoutRef.current !== null) {
      clearTimeout(batteryPollTimeoutRef.current);
      batteryPollTimeoutRef.current = null;
    }
    setBatteryLive(false);
    void clearBatteryStatusNotification();
  };
  const startBatteryLivePoll = () => {
    if (batteryPollRef.current !== null) return;
    setBatteryLive(true);
    // Seed the live notification with the current status right away.
    void isIgnoringBatteryOptimizations().then((ok) => {
      setBatteryOk(ok);
      void showBatteryStatusNotification(ok);
    });
    batteryPollRef.current = window.setInterval(async () => {
      const ok = await isIgnoringBatteryOptimizations();
      setBatteryOk((prev) => {
        if (prev !== ok) void showBatteryStatusNotification(ok);
        return ok;
      });
    }, 1200);
    // Safety cap: stop polling after 2 minutes so we never leak a timer or
    // leave the notification stuck in the shade.
    batteryPollTimeoutRef.current = window.setTimeout(() => {
      stopBatteryLivePoll();
    }, 120_000);
  };
  const refreshBattery = () => {
    if (!isNativeApp()) return;
    void isIgnoringBatteryOptimizations().then(setBatteryOk);
  };
  const refreshLocation = () => {
    void checkLocationPermissionState().then(setLocPerm);
  };
  const refreshStatus = () => {
    refreshBattery();
    refreshLocation();
  };
  useEffect(() => {
    setNative(isNativeApp());
    refreshStatus();
    // Re-check whenever the user returns to the app after visiting Settings.
    let cleanup: (() => void) | undefined;
    (async () => {
      if (!isNativeApp()) return;
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("resume", () => {
          refreshStatus();
          // User is back in the app — retire the live battery indicator.
          stopBatteryLivePoll();
        });
        cleanup = () => void h.remove();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cleanup?.();
      stopBatteryLivePoll();
    };
  }, []);
  useEffect(() => {
    setOdoInput(metersToUnit(currentMeters, s.distanceUnit).toFixed(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.odometerBaselineMeters, s.odometerBaselineAt, s.distanceUnit, trips.length]);

  function saveOdometer() {
    const n = parseFloat(odoInput);
    if (!isFinite(n) || n < 0) {
      toast.error("Enter a valid odometer reading");
      return;
    }
    const now = Date.now();
    s.update({
      odometerBaselineMeters: n * METERS_PER_UNIT,
      odometerBaselineAt: now,
      odometerLastPromptAt: now,
    });
    toast.success("Odometer updated");
  }

  async function doExport() {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miletrack-backup-${format(Date.now(), "yyyyMMdd-HHmm")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Backup downloaded");
  }

  async function doImport(file: File | undefined) {
    if (!file) return;
    // Cap file size defensively before parsing.
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Backup file too large (max 50MB)");
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = validateBackup(parsed);
      await importBackup(data, true);
      toast.success("Backup restored");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invalid backup file";
      toast.error(msg.length > 120 ? "Invalid backup file" : msg);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Preferences & data</p>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="divide-y">
          <Row icon={<Ruler className="size-4" />} title="Distance units">
            <Select value={s.distanceUnit} onValueChange={(v) => s.update({ distanceUnit: v as DistanceUnit })}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mi">Miles</SelectItem>
                <SelectItem value="km">Kilometers</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row icon={<Palette className="size-4" />} title="Theme">
            <Select value={s.theme} onValueChange={(v) => s.update({ theme: v as typeof s.theme })}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Trip detection
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="divide-y">
            <Row
              icon={<Radar className="size-4" />}
              title="Automatic detection"
              desc="Start & stop trips automatically with Android background tracking"
            >
              <Switch
                checked={s.autoDetect}
                onCheckedChange={(v) => {
                  if (!v) {
                    s.update({ autoDetect: false });
                    disableWatch();
                    return;
                  }
                  void requestPermission().then((status) => {
                    if (status === "granted") {
                      s.update({ autoDetect: true });
                      enableWatch();
                      toast.success("Automatic trip detection enabled");
                    } else {
                      s.update({ autoDetect: false });
                      toast.error("Location permission is required");
                    }
                  });
                }}
              />
            </Row>
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Gauge className="size-4 text-muted-foreground" /> Start speed threshold
                </span>
                <span className="text-sm font-semibold tabular-nums">{s.startThresholdMph} mph</span>
              </div>
              <Slider
                className="mt-3"
                min={5}
                max={30}
                step={1}
                value={[s.startThresholdMph]}
                onValueChange={([v]) => s.update({ startThresholdMph: v })}
              />
            </div>
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Gauge className="size-4 text-muted-foreground" /> Stop speed threshold
                </span>
                <span className="text-sm font-semibold tabular-nums">{s.stopThresholdMph} mph</span>
              </div>
              <Slider
                className="mt-3"
                min={1}
                max={15}
                step={1}
                value={[s.stopThresholdMph]}
                onValueChange={([v]) => s.update({ stopThresholdMph: v })}
              />
            </div>
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Timer className="size-4 text-muted-foreground" /> Auto-stop after
                </span>
                <span className="text-sm font-semibold tabular-nums">{s.stopMinutes} min</span>
              </div>
              <Slider
                className="mt-3"
                min={1}
                max={10}
                step={1}
                value={[s.stopMinutes]}
                onValueChange={([v]) => s.update({ stopMinutes: v })}
              />
            </div>
            <Row
              icon={<Bell className="size-4" />}
              title="Ask to classify"
              desc="Prompt Business or Personal when a trip ends"
            >
              <Switch checked={s.promptOnEnd} onCheckedChange={(v) => s.update({ promptOnEnd: v })} />
            </Row>
          </div>
        </div>
      </section>

      {native && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </h2>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="divide-y">
              <StatusRow
                icon={<Satellite className="size-4" />}
                title="GPS access"
                ok={locPerm ? locPerm.fine || locPerm.coarse : null}
                okText="Granted — MileTrack can read your location."
                badText="Not granted. Tap Fix to allow location access."
                pendingText="Checking…"
                actionLabel={locPerm && (locPerm.fine || locPerm.coarse) ? "Recheck" : "Fix"}
                onAction={async () => {
                  const granted = await requestNativeLocation();
                  if (!granted) {
                    await openAppDetailsSettings();
                    toast.message("Tap Permissions → Location → Allow");
                  }
                  setTimeout(refreshLocation, 800);
                }}
              />
              <StatusRow
                icon={<MapPin className="size-4" />}
                title="Background location"
                ok={locPerm ? locPerm.background : null}
                okText="Allow all the time — trips keep recording in the background."
                badText='Set to "Allow all the time" so trips keep recording with the screen off.'
                pendingText="Checking…"
                actionLabel={locPerm?.background ? "Recheck" : "Fix"}
                onAction={async () => {
                  await requestNativeLocation();
                  await openAppDetailsSettings();
                  toast.message("Tap Permissions → Location → Allow all the time");
                }}
              />
              <StatusRow
                icon={<BatteryCharging className="size-4" />}
                title="Battery unrestricted"
                ok={batteryOk}
                live={batteryLive}
                okText="Unrestricted — background GPS won't be paused."
                badText="Battery optimization is enabled. Tap Fix to whitelist MileTrack."
                pendingText="Checking…"
                actionLabel={batteryLive ? "Cancel" : batteryOk ? "Recheck" : "Fix"}
                onAction={async () => {
                  if (batteryLive) {
                    stopBatteryLivePoll();
                    return;
                  }
                  // Start the live indicator BEFORE leaving the app so the
                  // status notification is already updating by the time the
                  // user reaches the system battery-optimization screen.
                  startBatteryLivePoll();
                  await requestIgnoreBatteryOptimizations();
                  setTimeout(async () => {
                    const ok = await isIgnoringBatteryOptimizations();
                    setBatteryOk(ok);
                    if (!ok) {
                      await openBatteryOptimizationSettings();
                      toast.message("Find MileTrack — status updates live in the notification shade");
                    }
                  }, 1200);
                }}
              />
            </div>
          </div>
          {(() => {
            const hints: { key: string; title: string; steps: string[] }[] = [];
            if (locPerm && !locPerm.fine && !locPerm.coarse) {
              hints.push({
                key: "gps",
                title: "GPS access is still off",
                steps: [
                  "Open Android Settings → Apps → MileTrack → Permissions → Location.",
                  'Choose "Allow only while using the app" or "Allow all the time".',
                  "If the option is greyed out, enable Location services from the quick-settings tile first.",
                ],
              });
            }
            if (locPerm && (locPerm.fine || locPerm.coarse) && !locPerm.background) {
              hints.push({
                key: "bg",
                title: 'Background location is not set to "Allow all the time"',
                steps: [
                  "Open Android Settings → Apps → MileTrack → Permissions → Location.",
                  'Tap "Allow all the time". Android may hide this option behind "See all Location apps".',
                  "On Android 11+ you'll be sent back to the system prompt — pick All the time there.",
                ],
              });
            }
            if (batteryOk === false) {
              hints.push({
                key: "bat",
                title: "Battery is still optimized",
                steps: [
                  'Open Settings → Apps → MileTrack → App battery usage and pick "Unrestricted".',
                  'Samsung: Settings → Battery → Background usage limits → remove MileTrack from "Sleeping / Deep sleeping apps".',
                  'Xiaomi / Redmi: Security → Battery → App battery saver → MileTrack → "No restrictions", and Autostart → enable.',
                  'OnePlus / Oppo / Realme: Settings → Battery → Battery optimization → MileTrack → "Don\'t optimize"; also Advanced → Allow background activity.',
                ],
              });
            }
            if (hints.length === 0) return null;
            return (
              <div className="mt-3 space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Troubleshooting
                </p>
                {hints.map((h) => (
                  <div key={h.key}>
                    <p className="text-sm font-medium">{h.title}</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {h.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  Menu names vary by manufacturer and Android version — use the closest match.
                </p>
              </div>
            );
          })()}
        </section>
      )}

      {native && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Android permissions
          </h2>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="divide-y">
              <Row
                icon={<ShieldCheck className="size-4" />}
                title="Location access"
                desc="Set to Allow all the time so trips keep recording with the screen off or another app open."
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    // First trigger the native OS permission prompt directly
                    // so the user can grant access without hunting through
                    // Settings. Android will show the "Allow all the time"
                    // choice on the second tap (background location).
                    const granted = await requestNativeLocation();
                    // Always open the app details page too — it's the only
                    // way to switch to "Allow all the time" if it wasn't
                    // offered in the prompt, and it's a no-op if the user
                    // already granted everything.
                    void openAppDetailsSettings();
                    toast.message(
                      granted
                        ? "Tap Permissions → Location → Allow all the time"
                        : "Tap Permissions → Location → Allow all the time",
                    );
                  }}
                >
                  Open
                </Button>
              </Row>
              <Row
                icon={<BatteryCharging className="size-4" />}
                title="Battery optimization"
                desc={
                  batteryOk === null
                    ? "Disable so Android doesn't pause GPS in the background."
                    : batteryOk
                      ? "Disabled for MileTrack — background GPS won't be paused."
                      : "Currently enabled. Tap Fix to whitelist MileTrack."
                }
              >
                <Button
                  variant={batteryOk ? "outline" : "default"}
                  size="sm"
                  onClick={async () => {
                    // Escalation ladder:
                    //   1) Direct one-tap system dialog (ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                    //   2) On resume, re-check. If still not whitelisted →
                    //      open the battery-optimization list.
                    //   3) On next resume, re-check. If STILL not whitelisted →
                    //      open app details (works on every OEM).
                    // Each step only fires if the previous one didn't stick,
                    // and we always finish with an up-to-date UI state.
                    let stage: 0 | 1 | 2 = 0;
                    let resumeHandle: { remove: () => Promise<void> } | null = null;
                    let settled = false;

                    const finish = async () => {
                      if (settled) return;
                      settled = true;
                      try {
                        await resumeHandle?.remove();
                      } catch {
                        /* ignore */
                      }
                      const ok = await isIgnoringBatteryOptimizations();
                      setBatteryOk(ok);
                      if (ok) {
                        toast.success("Battery optimization disabled for MileTrack");
                      }
                    };

                    const onResume = async () => {
                      const ok = await isIgnoringBatteryOptimizations();
                      setBatteryOk(ok);
                      if (ok) {
                        await finish();
                        return;
                      }
                      if (stage === 0) {
                        stage = 1;
                        toast.message("Find MileTrack and switch it off");
                        await openBatteryOptimizationSettings();
                      } else if (stage === 1) {
                        stage = 2;
                        toast.message("Tap App battery usage → Unrestricted");
                        await openAppDetailsSettings();
                      } else {
                        await finish();
                      }
                    };

                    try {
                      const { App } = await import("@capacitor/app");
                      resumeHandle = await App.addListener("resume", () => {
                        void onResume();
                      });
                    } catch {
                      /* ignore — we'll fall back to a timed re-check */
                    }

                    // Kick off the first attempt.
                    await requestIgnoreBatteryOptimizations();

                    // Safety net: if no resume event arrives within 30s
                    // (user backgrounded elsewhere, prompt suppressed, etc.),
                    // clean up so we don't leak the listener.
                    setTimeout(() => {
                      void finish();
                    }, 30_000);
                  }}
                >
                  {batteryOk ? "Recheck" : "Fix"}
                </Button>
              </Row>
            </div>
          </div>
        </section>
      )}


      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Privacy
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <Row
            icon={<MapPin className="size-4" />}
            title="Look up trip addresses"
            desc="Send trip start/end coordinates to a geocoding service to show street addresses. Off by default."
          >
            <Switch
              checked={s.reverseGeocodeEnabled}
              onCheckedChange={(v) => s.update({ reverseGeocodeEnabled: v })}
            />
          </Row>
        </div>
      </section>

      

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Odometer
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <Gauge className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Current odometer</p>
                <p className="text-xs text-muted-foreground">
                  {s.odometerBaselineAt > 0
                    ? "Auto-updated from tracked trips. We'll check in monthly."
                    : "Enter your vehicle's current odometer to start tracking it here."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={odoInput}
                onChange={(e) => setOdoInput(e.target.value)}
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground">{unitLabel(s.distanceUnit)}</span>
              <Button size="sm" onClick={saveOdometer}>
                {s.odometerBaselineAt > 0 ? "Update" : "Set"}
              </Button>
            </div>
          </div>
        </div>
      </section>



      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Tax
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <Row
            icon={<DollarSign className="size-4" />}
            title="IRS mileage rate"
            desc="Business deduction per mile"
          >
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                className="w-20"
                value={s.irsRatePerMile}
                onChange={(e) => s.update({ irsRatePerMile: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </Row>
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Data & backup
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="divide-y">
            <Row icon={<Download className="size-4" />} title="Back up data" desc="Download all trips & fuel as a file">
              <Button variant="outline" size="sm" onClick={doExport}>
                Export
              </Button>
            </Row>
            <Row icon={<Upload className="size-4" />} title="Restore" desc="Replace data from a backup file">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Import
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                hidden
                onChange={(e) => doImport(e.target.files?.[0])}
              />
            </Row>
            <Row icon={<Trash2 className="size-4 text-destructive" />} title="Clear all data" desc="Delete every trip & fuel entry">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    Clear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes every trip and fuel entry from this device. Export a
                      backup first if you want to keep it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={async () => {
                        await clearAllData();
                        toast.success("All data cleared");
                      }}
                    >
                      Delete everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Row>
          </div>
        </div>
      </section>

      <p className="px-1 text-center text-xs text-muted-foreground">
        MileTrack stores everything on your device. No accounts, no cloud sync, no ads, no analytics.{" "}
        <a
          href="https://musarnm.github.io/mile-muse-08/privacy-policy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Privacy policy
        </a>
        {" · "}
        <a
          href="https://musarnm.github.io/mile-muse-08/terms.html"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Terms of use
        </a>
      </p>

      <p className="px-1 text-center text-xs text-muted-foreground">
        <a
          href="https://musarnm.github.io/mile-muse-08/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          Legal documents on GitHub Pages
          <ExternalLink className="size-3" />
        </a>
      </p>
    </div>
  );
}

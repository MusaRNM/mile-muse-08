import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Ruler, Radar, Timer, Bell, DollarSign, Palette, Download, Upload, Trash2, Gauge, MapPin } from "lucide-react";
import { CloudSyncCard } from "@/components/CloudSyncCard";
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

function SettingsPage() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const enableWatch = useTracker((st) => st.enableWatch);
  const disableWatch = useTracker((st) => st.disableWatch);
  const trips = useTrips() ?? [];
  const METERS_PER_UNIT = s.distanceUnit === "mi" ? 1609.344 : 1000;
  const currentMeters = currentOdometerMeters(
    trips,
    s.odometerBaselineMeters,
    s.odometerBaselineAt,
  );
  const [odoInput, setOdoInput] = useState("");
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
              desc="Start & stop trips automatically while the app is open"
            >
              <Switch
                checked={s.autoDetect}
                onCheckedChange={(v) => {
                  s.update({ autoDetect: v });
                  if (v) enableWatch();
                  else disableWatch();
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

      <CloudSyncCard />

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
        MileTrack stores everything on your device. Cloud sync is optional and end-to-end encrypted.
      </p>
    </div>
  );
}

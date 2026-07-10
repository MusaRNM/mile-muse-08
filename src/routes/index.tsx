import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Play,
  MapPin,
  Clock,
  Briefcase,
  User,
  Gauge,
  Receipt,
  TriangleAlert,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/StatCard";
import { MileageBarChart } from "@/components/MileageChart";
import { ManualTripDialog } from "@/components/ManualTripDialog";
import { OdometerCheckDialog } from "@/components/OdometerCheckDialog";
import { useTrips, useFuel } from "@/lib/hooks";
import { useTracker } from "@/lib/tracker";
import { useSettings } from "@/lib/settings";
import {
  getRange,
  summarizeTrips,
  summarizeFuel,
  irsDeduction,
  dailySeries,
  monthlySeries,
  type RangeKey,
} from "@/lib/reports";
import { formatDistance, formatHours, formatSpeed, metersToUnit, unitLabel } from "@/lib/geo";
import { currentOdometerMeters, shouldPromptOdometerCheck } from "@/lib/odometer";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  year: "Year",
};

function Dashboard() {
  const trips = useTrips();
  const fuel = useFuel();
  const unit = useSettings((s) => s.distanceUnit);
  const irsRate = useSettings((s) => s.irsRatePerMile);
  const autoDetect = useSettings((s) => s.autoDetect);
  const odoBaselineMeters = useSettings((s) => s.odometerBaselineMeters);
  const odoBaselineAt = useSettings((s) => s.odometerBaselineAt);
  const odoLastPromptAt = useSettings((s) => s.odometerLastPromptAt);
  const [range, setRange] = useState<RangeKey>("today");
  const [manualOpen, setManualOpen] = useState(false);
  const [odoCheckOpen, setOdoCheckOpen] = useState(false);

  const permission = useTracker((s) => s.permission);
  const requestPermission = useTracker((s) => s.requestPermission);
  const enableWatch = useTracker((s) => s.enableWatch);
  const watching = useTracker((s) => s.watching);
  const recording = useTracker((s) => s.recording);
  const currentSpeed = useTracker((s) => s.currentSpeed);
  const liveDistance = useTracker((s) => s.distanceMeters);
  const lastFixAt = useTracker((s) => s.lastFixAt);
  const lastAccuracy = useTracker((s) => s.lastAccuracyMeters);
  const sampleCount = useTracker((s) => s.locationSampleCount);
  const trackerError = useTracker((s) => s.error);
  const startManual = useTracker((s) => s.startManual);
  const openLocationSettings = useTracker((s) => s.openLocationSettings);

  const t = trips ?? [];
  const f = fuel ?? [];
  const dr = getRange(range);
  const ts = summarizeTrips(t, dr);
  const fs = summarizeFuel(f, dr);
  const unclassified = t.filter((x) => x.category === "unclassified").length;

  const chartData =
    range === "year"
      ? monthlySeries(t, dr, unit)
      : dailySeries(t, getRange(range === "today" ? "week" : range), unit);

  const odometerMeters = useMemo(
    () => currentOdometerMeters(t, odoBaselineMeters, odoBaselineAt),
    [t, odoBaselineMeters, odoBaselineAt],
  );

  useEffect(() => {
    if (
      shouldPromptOdometerCheck({
        baselineMeters: odoBaselineMeters,
        baselineAt: odoBaselineAt,
        lastPromptAt: odoLastPromptAt,
      })
    ) {
      setOdoCheckOpen(true);
    }
  }, [odoBaselineMeters, odoBaselineAt, odoLastPromptAt]);

  async function handleEnable() {
    const res = await requestPermission();
    if (res === "granted") enableWatch();
  }

  const lastFixText = lastFixAt ? `${Math.max(0, Math.round((Date.now() - lastFixAt) / 1000))}s ago` : "no fix";

  return (
    <div className="space-y-5">
      {permission !== "granted" && (
        <div className="rounded-2xl border border-primary/30 bg-accent/60 p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Enable location tracking</p>
              <p className="text-xs text-muted-foreground">
                MileTrack uses GPS to record your drives automatically. On Android, allow precise location and background location.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={handleEnable}>Allow location</Button>
                {permission === "denied" && (
                  <Button size="sm" variant="secondary" onClick={() => void openLocationSettings()}>
                    Open settings
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Record control */}
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-90">
              {recording ? "Trip in progress" : autoDetect ? "Auto-detect on" : "Manual mode"}
            </p>
            <p className="mt-0.5 font-display text-xl font-bold">
              {recording
                ? "Recording your drive…"
                : watching
                  ? "Watching for driving"
                  : "Ready to track"}
            </p>
          </div>
          <span
            className={`size-3 rounded-full ${watching ? "bg-primary-foreground animate-pulse" : "bg-primary-foreground/40"}`}
          />
        </div>
        {!recording && (
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => (permission === "granted" ? startManual() : handleEnable())}
            >
              <Play className="size-4 fill-current" /> Start trip
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Add trip manually"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg bg-primary-foreground/10 p-2">
            <div className="opacity-75">Speed</div>
            <div className="font-semibold tabular-nums">{formatSpeed(currentSpeed, unit)}</div>
          </div>
          <div className="rounded-lg bg-primary-foreground/10 p-2">
            <div className="opacity-75">Distance</div>
            <div className="font-semibold tabular-nums">{formatDistance(liveDistance, unit)}</div>
          </div>
          <div className="rounded-lg bg-primary-foreground/10 p-2">
            <div className="opacity-75">GPS</div>
            <div className="font-semibold tabular-nums">{sampleCount ? lastFixText : "waiting"}</div>
          </div>
        </div>
        {(trackerError || lastAccuracy !== null) && (
          <p className="mt-2 text-xs opacity-85">
            {trackerError ?? `Accuracy ${Math.round(lastAccuracy ?? 0)}m`}
          </p>
        )}
      </div>

      {/* Range selector */}
      <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
        <TabsList className="grid w-full grid-cols-4">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((k) => (
            <TabsTrigger key={k} value={k}>
              {RANGE_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Business"
          accent="business"
          icon={<Briefcase className="size-4" />}
          value={`${metersToUnit(ts.businessMeters, unit).toFixed(1)}`}
          sub={unitLabel(unit)}
        />
        <StatCard
          label="Personal"
          accent="personal"
          icon={<User className="size-4" />}
          value={`${metersToUnit(ts.personalMeters, unit).toFixed(1)}`}
          sub={unitLabel(unit)}
        />
        <StatCard
          label="Driving time"
          icon={<Clock className="size-4" />}
          value={formatHours(ts.durationSec)}
          sub={`${ts.tripCount} trip${ts.tripCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="IRS deduction"
          accent="primary"
          icon={<Gauge className="size-4" />}
          value={`$${irsDeduction(ts.businessMeters, irsRate).toFixed(0)}`}
          sub={`@ $${irsRate.toFixed(2)}/mi`}
        />
      </div>

      <StatCard
        label="Odometer"
        accent="primary"
        icon={<Gauge className="size-4" />}
        value={metersToUnit(odometerMeters, unit).toFixed(1)}
        sub={
          odoBaselineAt > 0
            ? unitLabel(unit)
            : `${unitLabel(unit)} · tap to set baseline`
        }
        onClick={() => setOdoCheckOpen(true)}
      />


      {/* Chart */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Mileage over time</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-business" /> Business
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-full bg-personal" /> Personal
            </span>
          </div>
        </div>
        <MileageBarChart data={chartData} unit={unitLabel(unit)} />
      </div>

      {/* Fuel + unclassified quick info */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Fuel this period"
          icon={<Receipt className="size-4" />}
          value={`$${fs.cost.toFixed(0)}`}
          sub={`${fs.gallons.toFixed(1)} gal`}
        />
        <StatCard
          label="Unclassified"
          accent={unclassified ? "primary" : "muted"}
          icon={<TriangleAlert className="size-4" />}
          value={unclassified}
          sub={unclassified ? "Tap Trips to review" : "All sorted"}
        />
      </div>

      <ManualTripDialog open={manualOpen} onOpenChange={setManualOpen} />
      <OdometerCheckDialog
        open={odoCheckOpen}
        onOpenChange={setOdoCheckOpen}
        estimatedMeters={odometerMeters}
      />
    </div>
  );
}

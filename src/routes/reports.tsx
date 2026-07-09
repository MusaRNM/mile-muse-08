import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { FileText, FileSpreadsheet, FileDown, Briefcase, User, Clock, Fuel, Route as RouteIcon, DollarSign, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTrips, useFuel } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import {
  getRange,
  summarizeTrips,
  summarizeFuel,
  irsDeduction,
  type DateRange,
  type RangeKey,
} from "@/lib/reports";
import { metersToUnit, unitLabel, formatHours } from "@/lib/geo";
import { exportPDF, exportCSV, exportExcel } from "@/lib/export";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Export — MileTrack" },
      { name: "description", content: "Generate daily, weekly, monthly, yearly and custom mileage & fuel reports and export to PDF, CSV or Excel." },
    ],
  }),
  component: ReportsPage,
});

type Preset = RangeKey | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
  { key: "custom", label: "Custom" },
];

function ReportsPage() {
  const trips = useTrips();
  const fuel = useFuel();
  const unit = useSettings((s) => s.distanceUnit);
  const irsRate = useSettings((s) => s.irsRatePerMile);

  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState(format(new Date(Date.now() - 30 * 864e5), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const range: DateRange = useMemo(() => {
    if (preset === "custom") {
      return {
        start: new Date(`${customStart}T00:00`).getTime(),
        end: new Date(`${customEnd}T23:59:59`).getTime(),
      };
    }
    return getRange(preset);
  }, [preset, customStart, customEnd]);

  const t = trips ?? [];
  const f = fuel ?? [];
  const ts = summarizeTrips(t, range);
  const fs = summarizeFuel(f, range);
  const deduction = irsDeduction(ts.businessMeters, irsRate);

  const title = PRESETS.find((p) => p.key === preset)?.label + " report";
  const input = { trips: t, fuel: f, range, unit, irsRatePerMile: irsRate, title };

  const rows = [
    { label: "Business", value: `${metersToUnit(ts.businessMeters, unit).toFixed(1)} ${unitLabel(unit)}`, Icon: Briefcase, accent: "text-business" },
    { label: "Personal", value: `${metersToUnit(ts.personalMeters, unit).toFixed(1)} ${unitLabel(unit)}`, Icon: User, accent: "text-personal" },
    { label: "Driving hours", value: formatHours(ts.durationSec), Icon: Clock, accent: "" },
    { label: "Total trips", value: String(ts.tripCount), Icon: RouteIcon, accent: "" },
    { label: "Fuel purchases", value: `${fs.entryCount} · ${fs.gallons.toFixed(1)} gal`, Icon: Fuel, accent: "" },
    { label: "Fuel cost", value: `$${fs.cost.toFixed(2)}`, Icon: Receipt, accent: "" },
    { label: "Est. IRS deduction", value: `$${deduction.toFixed(2)}`, Icon: DollarSign, accent: "text-primary" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Reports</h1>
        <p className="text-sm text-muted-foreground">Summaries & exports for your records</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              preset === p.key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-start">From</Label>
            <Input id="r-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="r-end">To</Label>
            <Input id="r-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 text-xs text-muted-foreground">
          {format(range.start, "MMM d, yyyy")} — {format(range.end, "MMM d, yyyy")}
        </div>
        <div className="divide-y">
          {rows.map(({ label, value, Icon, accent }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Icon className="size-4" /> {label}
              </span>
              <span className={`font-display font-semibold tabular-nums ${accent}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Export</h2>
        <div className="grid grid-cols-3 gap-3">
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => exportPDF(input)}>
            <FileText className="size-6 text-primary" />
            <span className="text-xs font-medium">PDF</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => exportCSV(input)}>
            <FileDown className="size-6 text-primary" />
            <span className="text-xs font-medium">CSV</span>
          </Button>
          <Button variant="outline" className="h-auto flex-col gap-2 py-4" onClick={() => exportExcel(input)}>
            <FileSpreadsheet className="size-6 text-primary" />
            <span className="text-xs font-medium">Excel</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

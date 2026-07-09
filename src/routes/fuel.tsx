import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Plus, Fuel as FuelIcon, DollarSign, Droplets, Gauge, Trash2, Route as RouteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { StatCard } from "@/components/StatCard";
import { FuelLineChart } from "@/components/MileageChart";
import { AddFuelDialog } from "@/components/AddFuelDialog";
import { useFuel, useTrips } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import { deleteFuel } from "@/lib/db";
import { unitLabel } from "@/lib/geo";
import {
  summarizeFuel,
  summarizeTrips,
  efficiencyStats,
  getRange,
  monthlyFuelSeries,
} from "@/lib/reports";

export const Route = createFileRoute("/fuel")({
  head: () => ({
    meta: [
      { title: "Fuel Log — MileTrack" },
      { name: "description", content: "Log fuel purchases with receipt scanning, and track gallons, cost, MPG and cost per mile." },
    ],
  }),
  component: FuelPage,
});

function FuelPage() {
  const fuel = useFuel();
  const trips = useTrips();
  const unit = useSettings((s) => s.distanceUnit);
  const [addOpen, setAddOpen] = useState(false);

  const f = fuel ?? [];
  const t = trips ?? [];
  const allFuel = summarizeFuel(f);
  const allTrips = summarizeTrips(t);
  const eff = efficiencyStats(allTrips.totalMeters, allFuel, unit);

  const yearRange = getRange("year");
  const monthRange = getRange("month");
  const yearFuel = summarizeFuel(f, yearRange);
  const monthFuel = summarizeFuel(f, monthRange);
  const chart = useMemo(() => monthlyFuelSeries(f, yearRange), [f, yearRange.start, yearRange.end]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Fuel</h1>
          <p className="text-sm text-muted-foreground">Receipts, costs & efficiency</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total spent"
          accent="primary"
          icon={<DollarSign className="size-4" />}
          value={`$${allFuel.cost.toFixed(0)}`}
          sub={`${allFuel.entryCount} fill-ups`}
        />
        <StatCard
          label="Total gallons"
          icon={<Droplets className="size-4" />}
          value={allFuel.gallons.toFixed(1)}
          sub={`avg $${allFuel.avgPricePerGallon.toFixed(2)}/gal`}
        />
        <StatCard
          label="Avg MPG"
          accent="business"
          icon={<Gauge className="size-4" />}
          value={eff.mpg ? eff.mpg.toFixed(1) : "—"}
          sub={eff.mpg ? "all recorded miles" : "need more data"}
        />
        <StatCard
          label={`Cost / ${unitLabel(unit)}`}
          icon={<RouteIcon className="size-4" />}
          value={eff.costPerUnit ? `$${eff.costPerUnit.toFixed(2)}` : "—"}
          sub="fuel per distance"
        />
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Monthly spending</h2>
          <span className="text-xs text-muted-foreground">
            This month ${monthFuel.cost.toFixed(0)} · Year ${yearFuel.cost.toFixed(0)}
          </span>
        </div>
        <FuelLineChart data={chart} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold">History</h2>
        {fuel === undefined ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : f.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <FuelIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No fuel logged yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Snap a gas receipt to add your first fill-up.
            </p>
          </div>
        ) : (
          f.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm">
              {entry.receiptImage ? (
                <img
                  src={entry.receiptImage}
                  alt="Receipt"
                  className="size-14 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <FuelIcon className="size-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{entry.station ?? "Fuel"}</span>
                  <span className="font-display font-semibold">${entry.totalPrice.toFixed(2)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{format(entry.date, "MMM d, yyyy")}</span>
                  <span>
                    {entry.gallons.toFixed(2)} gal · ${entry.pricePerGallon.toFixed(2)}/gal
                  </span>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this fuel entry?</AlertDialogTitle>
                    <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteFuel(entry.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>

      <AddFuelDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Search, ChevronRight, Clock, Gauge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteMap } from "@/components/RouteMap";
import { CategoryBadge } from "@/components/CategoryBadge";
import { useTrips } from "@/lib/hooks";
import { useSettings } from "@/lib/settings";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/geo";
import type { TripCategory } from "@/lib/types";

export const Route = createFileRoute("/trips/")({
  head: () => ({
    meta: [
      { title: "Trip History — MileTrack" },
      { name: "description", content: "Searchable history of every recorded drive with maps, distance, time and business/personal classification." },
    ],
  }),
  component: TripsPage,
});

type Filter = "all" | TripCategory;

function TripsPage() {
  const trips = useTrips();
  const unit = useSettings((s) => s.distanceUnit);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    let list = trips ?? [];
    if (filter !== "all") list = list.filter((t) => t.category === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.startAddress?.toLowerCase().includes(q) ||
          t.endAddress?.toLowerCase().includes(q) ||
          format(t.startTime, "MMM d yyyy").toLowerCase().includes(q),
      );
    }
    return list;
  }, [trips, filter, query]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Trips</h1>
        <p className="text-sm text-muted-foreground">Your complete drive history</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by location or date"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="unclassified">New</TabsTrigger>
        </TabsList>
      </Tabs>

      {trips === undefined ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No trips yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start driving with the app open, or add a trip from the dashboard.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <Link
              key={t.id}
              to="/trips/$tripId"
              params={{ tripId: t.id }}
              className="flex items-stretch gap-3 rounded-2xl border bg-card p-3 shadow-sm transition-colors hover:bg-accent/40"
            >
              <RouteMap path={t.path} className="size-20 shrink-0" markers={t.path.length > 1} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(t.startTime, "EEE, MMM d · h:mm a")}
                  </span>
                  <CategoryBadge category={t.category} />
                </div>
                <div className="mt-1 font-display text-lg font-semibold">
                  {formatDistance(t.distanceMeters, unit)}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> {formatDuration(t.durationSec)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Gauge className="size-3" /> {formatSpeed(t.avgSpeed, unit)}
                  </span>
                </div>
                {(t.startAddress || t.endAddress) && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {t.startAddress ?? "?"} → {t.endAddress ?? "?"}
                  </p>
                )}
              </div>
              <ChevronRight className="my-auto size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

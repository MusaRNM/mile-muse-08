import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  Gauge,
  MapPin,
  Trophy,
  Trash2,
  Calendar,
  Route as RouteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { GoogleRouteMap } from "@/components/GoogleRouteMap";
import { getTrip, saveTrip, deleteTrip } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/geo";
import type { Trip, TripCategory } from "@/lib/types";

export const Route = createFileRoute("/trips/$tripId")({
  head: () => ({
    meta: [
      { title: "Trip Details — MileTrack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TripDetail,
});

function TripDetail() {
  const { tripId } = Route.useParams();
  const router = useRouter();
  const unit = useSettings((s) => s.distanceUnit);
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [note, setNote] = useState("");

  useEffect(() => {
    void getTrip(tripId).then((t) => {
      setTrip(t ?? null);
      setNote(t?.note ?? "");
    });
  }, [tripId]);

  async function update(patch: Partial<Trip>) {
    if (!trip) return;
    const next = { ...trip, ...patch, updatedAt: Date.now() };
    setTrip(next);
    await saveTrip(next);
  }

  async function remove() {
    await deleteTrip(tripId);
    toast.success("Trip deleted");
    router.navigate({ to: "/trips" });
  }

  if (trip === undefined) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (trip === null) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium">Trip not found</p>
        <Button variant="link" onClick={() => router.navigate({ to: "/trips" })}>
          Back to trips
        </Button>
      </div>
    );
  }

  const stats = [
    { label: "Distance", value: formatDistance(trip.distanceMeters, unit), Icon: RouteIcon },
    { label: "Duration", value: formatDuration(trip.durationSec), Icon: Clock },
    { label: "Avg speed", value: formatSpeed(trip.avgSpeed, unit), Icon: Gauge },
    { label: "Max speed", value: formatSpeed(trip.maxSpeed, unit), Icon: Trophy },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="size-4" /> Back
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="size-4" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the trip and its route from your records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <GoogleRouteMap path={trip.path} className="aspect-video w-full" />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="size-4" />
        {format(trip.startTime, "EEEE, MMMM d, yyyy")} · {format(trip.startTime, "h:mm a")} –{" "}
        {format(trip.endTime, "h:mm a")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <Icon className="size-3.5" /> {label}
            </div>
            <div className="mt-1.5 font-display text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-business" />
          <div>
            <p className="text-xs text-muted-foreground">Start</p>
            <p className="font-medium">{trip.startAddress ?? "Unknown location"}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-xs text-muted-foreground">End</p>
            <p className="font-medium">{trip.endAddress ?? "Unknown location"}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Classification</Label>
        <Select value={trip.category} onValueChange={(v) => update({ category: v as TripCategory })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="unclassified">Unclassified</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Notes</Label>
        <Textarea
          id="note"
          placeholder="Add a note (client, purpose, etc.)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => update({ note })}
        />
      </div>
    </div>
  );
}

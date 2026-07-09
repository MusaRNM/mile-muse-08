import { useEffect, useState } from "react";
import { Briefcase, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTracker } from "@/lib/tracker";
import { useSettings } from "@/lib/settings";
import { getTrip, saveTrip } from "@/lib/db";
import { formatDistance, formatDuration } from "@/lib/geo";
import type { Trip, TripCategory } from "@/lib/types";

/**
 * Shows automatically after a trip ends (when enabled in settings) asking the
 * user to classify the trip as Business or Personal. The choice can be edited
 * later from the trip detail screen.
 */
export function ClassifyDialog() {
  const pendingId = useTracker((s) => s.pendingClassifyId);
  const clearPending = useTracker((s) => s.clearPending);
  const unit = useSettings((s) => s.distanceUnit);
  const [trip, setTrip] = useState<Trip | null>(null);

  useEffect(() => {
    let active = true;
    if (pendingId) {
      void getTrip(pendingId).then((t) => {
        if (active) setTrip(t ?? null);
      });
    } else {
      setTrip(null);
    }
    return () => {
      active = false;
    };
  }, [pendingId]);

  async function classify(category: TripCategory) {
    if (trip) {
      await saveTrip({ ...trip, category, updatedAt: Date.now() });
    }
    clearPending();
  }

  return (
    <Dialog open={!!pendingId} onOpenChange={(open) => !open && clearPending()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Was this trip Business or Personal?</DialogTitle>
          <DialogDescription>
            {trip
              ? `${formatDistance(trip.distanceMeters, unit)} · ${formatDuration(trip.durationSec)}${
                  trip.endAddress ? ` · to ${trip.endAddress}` : ""
                }`
              : "Classify your trip to keep your reports accurate."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 border-business/40 py-5 hover:bg-business-muted"
            onClick={() => classify("business")}
          >
            <Briefcase className="size-6 text-business" />
            <span className="font-semibold">Business</span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 border-personal/40 py-5 hover:bg-personal-muted"
            onClick={() => classify("personal")}
          >
            <User className="size-6 text-personal" />
            <span className="font-semibold">Personal</span>
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => clearPending()}>
          Decide later
        </Button>
      </DialogContent>
    </Dialog>
  );
}

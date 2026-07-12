import { useState } from "react";
import { Loader2, OctagonPause, Square } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { useTracker } from "@/lib/tracker";
import { formatDistance } from "@/lib/geo";

export function TripStopDialog() {
  const open = useTracker((s) => s.stopPromptOpen);
  const distanceMeters = useTracker((s) => s.distanceMeters);
  const stopAndSave = useTracker((s) => s.stopAndSave);
  const continueInTraffic = useTracker((s) => s.continueInTraffic);
  const unit = useSettings((s) => s.distanceUnit);
  const stopThresholdMph = useSettings((s) => s.stopThresholdMph);
  const stopMinutes = useSettings((s) => s.stopMinutes);
  const [saving, setSaving] = useState(false);

  async function endTrip() {
    setSaving(true);
    await stopAndSave();
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && continueInTraffic()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <OctagonPause className="size-5" />
          </div>
          <DialogTitle>Trip appears to have ended.</DialogTitle>
          <DialogDescription>
            Speed stayed under {stopThresholdMph} mph for {stopMinutes} min. Current trip: {formatDistance(distanceMeters, unit)}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button onClick={endTrip} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4 fill-current" />}
            End Trip
          </Button>
          <Button variant="outline" onClick={continueInTraffic} disabled={saving}>
            I'm in Traffic
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/lib/settings";
import { metersToUnit, unitLabel } from "@/lib/geo";
import type { DistanceUnit } from "@/lib/types";

const METERS = { mi: 1609.344, km: 1000 };

export function OdometerCheckDialog({
  open,
  onOpenChange,
  estimatedMeters,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimatedMeters: number;
}) {
  const unit = useSettings((s) => s.distanceUnit) as DistanceUnit;
  const update = useSettings((s) => s.update);
  const estimated = metersToUnit(estimatedMeters, unit);
  const [value, setValue] = useState(estimated.toFixed(1));

  function confirmCorrect() {
    update({ odometerLastPromptAt: Date.now() });
    onOpenChange(false);
    toast.success("Odometer confirmed");
  }

  function saveUpdate() {
    const n = parseFloat(value);
    if (!isFinite(n) || n < 0) {
      toast.error("Enter a valid odometer reading");
      return;
    }
    const now = Date.now();
    update({
      odometerBaselineMeters: n * METERS[unit],
      odometerBaselineAt: now,
      odometerLastPromptAt: now,
    });
    onOpenChange(false);
    toast.success("Odometer updated");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly odometer check</DialogTitle>
          <DialogDescription>
            Based on tracked trips, your odometer should read about{" "}
            <span className="font-semibold">
              {estimated.toFixed(1)} {unitLabel(unit)}
            </span>
            . Does that match your vehicle?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="odo-check">Actual reading ({unitLabel(unit)})</Label>
          <Input
            id="odo-check"
            type="number"
            inputMode="decimal"
            step="0.1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={saveUpdate}>
            Update reading
          </Button>
          <Button onClick={confirmCorrect}>Yes, it's correct</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
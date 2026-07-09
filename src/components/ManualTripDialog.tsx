import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { newId, saveTrip } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { unitLabel } from "@/lib/geo";
import type { Trip, TripCategory } from "@/lib/types";

const METERS = { mi: 1609.344, km: 1000 };

export function ManualTripDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const unit = useSettings((s) => s.distanceUnit);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("09:30");
  const [distance, setDistance] = useState("");
  const [category, setCategory] = useState<TripCategory>("business");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function save() {
    const dist = parseFloat(distance);
    if (!dist || dist <= 0) {
      toast.error("Enter a valid distance");
      return;
    }
    const startTime = new Date(`${date}T${start}`).getTime();
    let endTime = new Date(`${date}T${end}`).getTime();
    if (endTime <= startTime) endTime = startTime + 60 * 1000;
    const durationSec = Math.round((endTime - startTime) / 1000);
    const distanceMeters = dist * METERS[unit];
    const avgSpeed = distanceMeters / durationSec;

    const trip: Trip = {
      id: newId(),
      startTime,
      endTime,
      durationSec,
      distanceMeters,
      avgSpeed,
      maxSpeed: avgSpeed,
      category,
      startAddress: from || undefined,
      endAddress: to || undefined,
      path: [],
      source: "manual",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTrip(trip);
    toast.success("Trip added");
    onOpenChange(false);
    setDistance("");
    setFrom("");
    setTo("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add trip manually</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mt-date">Date</Label>
            <Input id="mt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mt-start">Start</Label>
              <Input id="mt-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mt-end">End</Label>
              <Input id="mt-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mt-dist">Distance ({unitLabel(unit)})</Label>
              <Input
                id="mt-dist"
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TripCategory)}>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-from">From (optional)</Label>
            <Input id="mt-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Start location" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mt-to">To (optional)</Label>
            <Input id="mt-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="End location" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save trip</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

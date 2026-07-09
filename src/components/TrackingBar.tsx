import { useEffect, useState } from "react";
import { Circle, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTracker } from "@/lib/tracker";
import { useSettings } from "@/lib/settings";
import { formatDistance, formatDuration, formatSpeed } from "@/lib/geo";

/**
 * Sticky live-trip bar shown above the bottom navigation while a trip is being
 * recorded. Displays live distance, duration and speed, and lets the user stop.
 */
export function TrackingBar() {
  const recording = useTracker((s) => s.recording);
  const distanceMeters = useTracker((s) => s.distanceMeters);
  const currentSpeed = useTracker((s) => s.currentSpeed);
  const startTime = useTracker((s) => s.startTime);
  const stopAndSave = useTracker((s) => s.stopAndSave);
  const unit = useSettings((s) => s.distanceUnit);

  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!recording || !startTime) return;
    const tick = () => setElapsed(Math.round((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [recording, startTime]);

  if (!recording) return null;

  return (
    <div className="border-t bg-primary text-primary-foreground">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/60" />
            <Circle className="size-3 fill-current" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-base font-semibold tabular-nums">
              {formatDistance(distanceMeters, unit)} · {formatDuration(elapsed)}
            </div>
            <div className="text-xs opacity-80">Recording · {formatSpeed(currentSpeed, unit)}</div>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await stopAndSave();
            setSaving(false);
          }}
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4 fill-current" />}
          Stop
        </Button>
      </div>
    </div>
  );
}

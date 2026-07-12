import { useEffect, useState } from "react";
import { Clock, Globe } from "lucide-react";
import { useSettings } from "@/lib/settings";

/**
 * Live world clock in the header. Shows the current date/time in the
 * device's detected timezone (which follows the OS/browser location).
 * If the user has granted geolocation permission, the timezone label is
 * augmented with a coarse city hint from a lightweight reverse geocode.
 */
export function WorldClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [tz, setTz] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const reverseGeocodeEnabled = useSettings((s) => s.reverseGeocodeEnabled);

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    } catch {
      /* ignore */
    }
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Try to enrich with a city name if geolocation is available AND the user
  // opted into reverse geocoding. Silent-fail. Without opt-in, no coordinates
  // ever leave the device from this component.
  useEffect(() => {
    if (!reverseGeocodeEnabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { Accept: "application/json" } },
          );
          if (!res.ok) return;
          const data = (await res.json()) as {
            address?: { city?: string; town?: string; village?: string; state?: string; country_code?: string };
          };
          if (cancelled) return;
          const a = data.address ?? {};
          const label = a.city || a.town || a.village || a.state || "";
          const cc = a.country_code ? a.country_code.toUpperCase() : "";
          setCity(label ? (cc ? `${label}, ${cc}` : label) : "");
        } catch {
          /* ignore */
        }
      },
      () => {
        /* permission denied or unavailable; just show timezone */
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 8000 },
    );
    return () => {
      cancelled = true;
    };
  }, [reverseGeocodeEnabled]);

  const time = now
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now)
    : "";

  const date = now
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(now)
    : "";

  const tzShort = tz ? tz.split("/").pop()?.replace(/_/g, " ") : "";

  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-2 text-xs">
      <div className="flex items-center gap-2 text-foreground">
        <Clock className="size-3.5 text-primary" />
        <span className="font-medium tabular-nums">{time}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{date}</span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <Globe className="size-3.5 shrink-0" />
        <span className="truncate">{city || tzShort || tz || "Local"}</span>
      </div>
    </div>
  );
}

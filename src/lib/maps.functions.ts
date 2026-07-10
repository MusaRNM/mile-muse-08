import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Reverse geocode via the Google Maps Platform connector (server-side).
 *
 * The provider API key never touches the browser — it's injected into the
 * connector gateway from server env vars. If the connector isn't linked yet
 * we return null so callers can fall back to the client-side (Nominatim) path.
 *
 * This intentionally works without sign-in because MileTrack stores trips
 * locally on-device; signed-out Android users still need start/end addresses.
 */
export const reverseGeocodeGoogle = createServerFn({ method: "POST" })
  .validator((raw) =>
    z
      .object({
        lat: z.number().finite().gte(-90).lte(90),
        lng: z.number().finite().gte(-180).lte(180),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const googleKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !googleKey) return null;

    try {
      const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": googleKey,
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        status?: string;
        results?: Array<{ formatted_address?: string }>;
      };
      const address = json.results?.[0]?.formatted_address;
      return address ? { address } : null;
    } catch {
      return null;
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reverse geocode via the Google Maps Platform connector (server-side).
 *
 * The provider API key never touches the browser — it's injected into the
 * connector gateway from server env vars. If the connector isn't linked yet
 * we return null so callers can fall back to the client-side (Nominatim) path.
 *
 * Auth-gated: only signed-in users can invoke this so anonymous callers cannot
 * burn the app's paid Google Maps quota by hitting the RPC endpoint directly.
 */
export const reverseGeocodeGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
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

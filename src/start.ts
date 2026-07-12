import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Baseline security headers for every server-rendered response.
 * The app has no third-party map/script dependencies; CSP is tight to
 * prevent exfiltration and clickjacking and to scope Permissions-Policy so
 * geolocation cannot be silently invoked by cross-origin iframes.
 */
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const res = await next();
  const response = res as unknown as Response;
  if (!(response instanceof Response)) return res;

  const ct = response.headers.get("content-type") ?? "";
  const isHtml = ct.includes("text/html");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(self), camera=(self), microphone=()",
  );
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  if (isHtml) {
    response.headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        // Receipt thumbnails render from validated data:image/* strings.
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        // No third-party scripts — the app runs entirely from its own origin.
        "script-src 'self' 'unsafe-inline'",
        // Outbound network is restricted to the single free endpoint the
        // client can call: OpenStreetMap Nominatim, and only if the user
        // opts in to reverse-geocoding in Settings. No Google APIs, no
        // paid services, no analytics endpoints.
        "connect-src 'self' https://nominatim.openstreetmap.org",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "object-src 'none'",
      ].join("; "),
    );

  }
  return res;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));

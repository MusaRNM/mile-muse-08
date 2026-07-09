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
 * CSP is intentionally permissive on script (Vite + Google Maps loader need
 * inline) but restricts connect/img/frame — the primary goal is preventing
 * exfiltration and clickjacking, and scoping Permissions-Policy so geolocation
 * cannot be silently invoked by cross-origin iframes.
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
        "img-src 'self' data: blob: https://maps.gstatic.com https://*.googleapis.com https://*.ggpht.com https://*.google.com",
        "font-src 'self' data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline' https://maps.googleapis.com",
        "connect-src 'self' https://connector-gateway.lovable.dev https://*.supabase.co https://*.lovable.cloud https://nominatim.openstreetmap.org https://maps.googleapis.com",
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

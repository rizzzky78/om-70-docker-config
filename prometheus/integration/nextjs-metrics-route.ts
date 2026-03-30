/**
 * Next.js App Router — Metrics API Route
 * =======================================
 * Copy this file to your Next.js project at:
 *   app/api/metrics/route.ts
 *
 * This endpoint is scraped by Prometheus.
 * Pair with: nextjs-instrumentation.ts (instrumentation.ts)
 *
 * ⚠ SECURITY: Protect this endpoint so it is not publicly accessible.
 *   Option A — IP allowlist at the reverse proxy (Nginx / Traefik).
 *   Option B — Secret header check (shown below, disabled by default).
 *   Option C — Deploy Prometheus on the same private network as your app.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Optional: require a secret token to access metrics.
 * Set METRICS_TOKEN in your .env to enable authentication.
 *
 * Prometheus config (`prometheus.yml`) must include:
 *   bearer_token: <your_token>
 *   OR
 *   params:
 *     token: ["<your_token>"]
 */
const METRICS_TOKEN = process.env.METRICS_TOKEN;

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ----- Optional token authentication ------------------------------------
  if (METRICS_TOKEN) {
    const authHeader = req.headers.get("authorization");
    const providedToken = authHeader?.replace("Bearer ", "").trim();

    if (providedToken !== METRICS_TOKEN) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }
  // ------------------------------------------------------------------------

  const registry = global.prometheusRegistry;

  if (!registry) {
    // The registry is initialized in instrumentation.ts.
    // If it is not found, the server likely started without the instrumentation hook.
    return new NextResponse(
      "Metrics registry not initialized. Ensure instrumentation.ts is set up correctly.",
      { status: 503 }
    );
  }

  const metrics = await registry.metrics();

  return new NextResponse(metrics, {
    status: 200,
    headers: {
      "Content-Type": registry.contentType,
      // Prevent caching — Prometheus needs fresh data on every scrape
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

// ============================================================================
// HTTP Request Duration Tracking Middleware (Optional)
// ============================================================================
// Next.js does not have built-in server-side request middleware for App Router.
// To instrument route handlers, wrap them with this helper.
//
// Usage in a route handler:
//   import { withMetrics } from "@/lib/metrics"; // move this helper to your lib/
//   export const GET = withMetrics(async (req) => { ... }, "/api/your-route");
// ============================================================================

import type { Registry, Histogram } from "prom-client";

/**
 * Wraps a Next.js App Router handler to record HTTP request duration metrics.
 *
 * @param handler  — the original route handler
 * @param route    — the route pattern (e.g. "/api/users")
 */
export function withMetrics(
  handler: (req: NextRequest) => Promise<NextResponse>,
  route: string
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const registry: Registry | undefined = global.prometheusRegistry;

    if (!registry) return handler(req);

    const histogram = registry.getSingleMetric(
      "http_request_duration_seconds"
    ) as Histogram<string> | undefined;

    if (!histogram) return handler(req);

    const end = histogram.startTimer({ method: req.method, route });

    try {
      const response = await handler(req);
      end({ status_code: String(response.status) });
      return response;
    } catch (err) {
      end({ status_code: "500" });
      throw err;
    }
  };
}

// ============================================================================
// Declare global type for TypeScript (include in globals.d.ts in your project)
// ============================================================================
//
// declare global {
//   var prometheusRegistry: import("prom-client").Registry | undefined;
// }

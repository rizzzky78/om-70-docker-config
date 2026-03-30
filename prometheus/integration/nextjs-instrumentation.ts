/**
 * Next.js instrumentation.ts — Prometheus Metrics Initialization
 * ==============================================================
 * Official Next.js docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 * Official prom-client:   https://github.com/siimon/prom-client
 *
 * INSTALLATION:
 *   npm install prom-client
 *
 * SETUP:
 *   1. Place this file at the root of your project (or inside /src if using src/ layout):
 *        app/instrumentation.ts   ← App Router (Next.js 13.5+)
 *     OR
 *        src/instrumentation.ts   ← src/ project layout
 *
 *   2. Enable the instrumentation hook in next.config.js/ts (required until Next.js 15):
 *        // next.config.ts
 *        const nextConfig = {
 *          experimental: {
 *            instrumentationHook: true,   // Remove in Next.js 15+ (on by default)
 *          },
 *        };
 *        export default nextConfig;
 *
 *   3. Create the API route: see nextjs-metrics-route.ts
 */

import type { Registry } from "prom-client";

// Extend globalThis so the registry survives Next.js hot-reloads in development.
declare global {
  // eslint-disable-next-line no-var
  var prometheusRegistry: Registry | undefined;
}

/**
 * register() is called once when the Next.js server starts.
 * It must NOT be imported by client components — this file is server-only.
 */
export async function register() {
  // prom-client uses Node.js-only APIs.
  // Guard against Edge runtime (used by middleware and some App Router routes).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Avoid re-registering metrics during hot-reloads (development only)
  if (global.prometheusRegistry) return;

  const {
    Registry,
    collectDefaultMetrics,
    Histogram,
    Counter,
    Gauge,
  } = await import("prom-client");

  const registry = new Registry();

  // -------------------------------------------------------------------------
  // Default Node.js metrics: CPU, memory, GC, event loop, file descriptors…
  // -------------------------------------------------------------------------
  collectDefaultMetrics({
    register: registry,
    prefix: "nodejs_",
  });

  // -------------------------------------------------------------------------
  // Custom HTTP metrics
  // -------------------------------------------------------------------------

  /**
   * Histogram for tracking HTTP request duration.
   * Use labels for method, route, and status code.
   *
   * ⚠ Avoid high-cardinality labels (e.g., user IDs, query strings).
   *   Only use low-cardinality values like route patterns, methods, status codes.
   */
  new Histogram({
    name: "http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  /** Counter for total HTTP requests */
  new Counter({
    name: "http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });

  /**
   * Example: custom business metric — active user sessions.
   * Replace with your own application-specific gauges/counters.
   */
  new Gauge({
    name: "app_active_sessions",
    help: "Number of currently active user sessions",
    registers: [registry],
  });

  // Store in global so the API route (and any server component) can access it
  global.prometheusRegistry = registry;

  console.log("[Prometheus] Metrics registry initialized.");
}

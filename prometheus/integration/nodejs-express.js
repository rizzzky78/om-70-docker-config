/**
 * Express.js + prom-client Integration Example
 * =============================================
 * Official prom-client docs: https://github.com/siimon/prom-client
 *
 * INSTALLATION:
 *   npm install prom-client
 *
 * USAGE:
 *   Add this file to your Express project, then mount the router.
 *   See below for usage instructions.
 */

const express = require("express");
const promClient = require("prom-client");

// =============================================================================
// 1. Create a dedicated Registry
//    (avoids pollution of the default global registry)
// =============================================================================
const register = new promClient.Registry();

// Add default Node.js metrics: CPU, memory, GC, event loop, file descriptors…
promClient.collectDefaultMetrics({
  register,
  // Prefix all default metric names (optional — helps with multi-service setups)
  prefix: "nodejs_",
  // Collect every 10 seconds
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// =============================================================================
// 2. Define custom metrics
// =============================================================================

/**
 * HTTP request duration histogram.
 * Use a Histogram (not a Summary) so Prometheus can calculate arbitrary
 * percentiles at query time.
 */
const httpRequestDuration = new promClient.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  // Buckets in seconds — cover typical web request ranges
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/** Total HTTP requests counter (optional — histogram _count already provides this). */
const httpRequestTotal = new promClient.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// =============================================================================
// 3. Middleware — instrument all routes
// =============================================================================

/**
 * Express middleware that measures request duration and records HTTP metrics.
 * Mount BEFORE your routes.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function metricsMiddleware(req, res, next) {
  // Skip the /metrics endpoint itself to avoid self-measurement noise
  if (req.path === "/metrics") return next();

  const end = httpRequestDuration.startTimer({ method: req.method });

  res.on("finish", () => {
    const labels = {
      method: req.method,
      // Normalize dynamic route params: /users/123 → /users/:id
      route: req.route?.path ?? req.path,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestTotal.inc(labels);
  });

  next();
}

// =============================================================================
// 4. Metrics endpoint router
// =============================================================================

const metricsRouter = express.Router();

/**
 * GET /metrics
 * Prometheus scrapes this endpoint.
 *
 * ⚠ SECURITY: Restrict this endpoint to your internal network or Prometheus
 * server only. Do not expose it publicly without authentication.
 */
metricsRouter.get("/metrics", async (_req, res) => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// =============================================================================
// 5. Minimal Express app wiring example
// =============================================================================

function createApp() {
  const app = express();

  // Mount metrics middleware first so it captures all requests
  app.use(metricsMiddleware);

  // Mount metrics endpoint
  app.use(metricsRouter);

  // Your application routes go here:
  app.get("/", (_req, res) => res.json({ status: "ok" }));
  app.get("/health", (_req, res) => res.json({ status: "healthy" }));

  return app;
}

// =============================================================================
// 6. Start the server (if running this file directly)
// =============================================================================

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Metrics exposed at http://localhost:${PORT}/metrics`);
  });
}

module.exports = { metricsMiddleware, metricsRouter, register };

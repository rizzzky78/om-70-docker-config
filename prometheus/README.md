# Prometheus & Grafana — Production Monitoring Stack

> **Stack versions:** Prometheus `v3.10.0` · Grafana `v12.4.2`  
> **Compatible with:** Docker Desktop (Windows + WSL2) · Linux (Ubuntu Server)

A production-ready, self-contained monitoring stack. Includes:

- Prometheus for metrics collection & storage
- Grafana with auto-provisioned datasource + pre-built Node.js dashboard
- Alert rules for HTTP errors, latency, heap memory, and instance availability
- Integration guides for **Next.js (App Router)** and **Express.js**

---

## 📁 Directory Structure

```
prometheus/
├── .env                          # Active config (do not commit)
├── .env.example                  # Template (safe to commit)
├── docker-compose.yml            # Main stack definition
├── README.md                     # This file
│
├── prometheus/
│   ├── prometheus.yml            # Scrape configurations
│   └── rules/
│       └── alert.rules.yml       # Alert rules
│
├── grafana/
│   └── provisioning/
│       ├── datasources/
│       │   └── prometheus.yml    # Auto-provisioned Prometheus datasource
│       └── dashboards/
│           ├── dashboard.yml     # Dashboard provider config
│           └── nodejs-overview.json  # Pre-built Node.js dashboard
│
└── integration/
    ├── nodejs-express.js         # Express.js example
    ├── nextjs-instrumentation.ts # Next.js instrumentation.ts
    └── nextjs-metrics-route.ts   # Next.js API route
```

---

## 🚀 Quick Start

### 1. Configure environment

```bash
cd prometheus/
cp .env.example .env
```

Edit `.env` — at minimum set a strong `GF_ADMIN_PASSWORD`.

### 2. Start the stack

```bash
docker compose up -d
```

### 3. Verify services

```bash
docker compose ps          # both services should show "healthy"
docker compose logs -f     # watch for startup errors
```

### 4. Access the UIs

| Service    | URL                      | Default credentials     |
|------------|--------------------------|-------------------------|
| Prometheus | <http://localhost:9090>    | none (no auth by default) |
| Grafana    | <http://localhost:3001>    | admin / (your .env password) |

---

## 🪟 Windows (Docker Desktop + WSL2) Setup

### Prerequisites

1. **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/)  
   Enable *WSL2 backend* in Settings → General.

2. **WSL2** — install if not already present:

   ```powershell
   wsl --install
   wsl --set-default-version 2
   ```

3. Docker Desktop → Settings → Resources → WSL Integration → enable your distro.

### Running the stack

Open a **PowerShell** or **WSL terminal** in the `prometheus/` directory:

```powershell
docker compose up -d
```

### Connecting to apps running on Windows host

When your Node.js app runs on Windows (outside Docker), use `host.docker.internal` as the target in `prometheus/prometheus.yml`:

```yaml
static_configs:
  - targets:
      - "host.docker.internal:3000"   # resolves to the Windows host IP
```

This is the default in the provided `prometheus.yml`.

### File permissions (WSL bind mounts)

If Prometheus or Grafana refuse to start due to permission errors on bind-mounted files:

```bash
# In WSL terminal, from the project root:
chmod 644 prometheus/prometheus.yml
chmod 644 prometheus/rules/alert.rules.yml
```

Named volumes (`prometheus_data`, `grafana_data`) are managed by Docker and have no permission issues.

---

## 🐧 Linux (Ubuntu Server) Setup

### Prerequisites

```bash
# Install Docker Engine + Docker Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Allow current user to run docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

### Running the stack

```bash
cd /path/to/om-70-docker-config/prometheus
cp .env.example .env
# Edit .env — set a strong password
nano .env

docker compose up -d
```

### Connecting to apps on the Linux host

When your Node.js app runs directly on the host (not in Docker), use the Docker bridge gateway IP:

```bash
# Find the gateway IP of the monitoring network
docker network inspect monitoring_network --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
# Typically: 172.x.0.1
```

Then update `prometheus/prometheus.yml`:

```yaml
static_configs:
  - targets:
      - "172.x.0.1:3000"    # replace with actual gateway IP
```

Or add `--add-host=host-gateway:host-gateway` to the Prometheus service in `docker-compose.yml` and use `host-gateway:3000`.

### Firewall

If using `ufw`, open the monitoring ports:

```bash
sudo ufw allow from <your-ip>/32 to any port 9090   # Prometheus (restrict to trusted IP)
sudo ufw allow from <your-ip>/32 to any port 3001   # Grafana
```

---

## 🔗 Integrating Your Node.js Application

### Step 1 — Install prom-client

```bash
npm install prom-client
```

---

### Step 2A — Express.js Integration

Copy `integration/nodejs-express.js` into your project and follow the inline comments.

**Key points:**

- Import `metricsMiddleware` and mount it **first** (before your routes).
- Mount `metricsRouter` to expose `GET /metrics`.
- The middleware automatically records HTTP method, route pattern, and status code.

```js
const express = require("express");
const { metricsMiddleware, metricsRouter } = require("./metrics"); // your copy

const app = express();

app.use(metricsMiddleware);  // ← mount first
app.use(metricsRouter);      // ← exposes GET /metrics

// ... your routes
app.listen(3000);
```

---

### Step 2B — Next.js (App Router) Integration

#### 1. Enable the instrumentation hook

```ts
// next.config.ts
const nextConfig = {
  experimental: {
    instrumentationHook: true,  // Remove in Next.js 15+ (enabled by default)
  },
};
export default nextConfig;
```

#### 2. Copy `instrumentation.ts` to your project root (or `src/`)

```bash
cp integration/nextjs-instrumentation.ts instrumentation.ts
```

This file initializes the Prometheus registry when the server starts. It is guarded against the Edge runtime.

#### 3. Copy the API route

```bash
mkdir -p app/api/metrics
cp integration/nextjs-metrics-route.ts app/api/metrics/route.ts
```

This exposes `GET /api/metrics` which Prometheus will scrape.

#### 4. Add global type declaration

Add this to `globals.d.ts` (or any `.d.ts` file in your project) to avoid TypeScript errors:

```ts
import type { Registry } from "prom-client";

declare global {
  var prometheusRegistry: Registry | undefined;
}
```

#### 5. Instrument individual route handlers (optional)

```ts
// app/api/users/route.ts
import { withMetrics } from "@/app/api/metrics/route";  // or extract to a lib file

export const GET = withMetrics(async (req) => {
  // your handler logic
  return Response.json({ users: [] });
}, "/api/users");
```

#### 6. Restart your Next.js server

```bash
npm run dev    # development
# OR
npm run build && npm run start   # production
```

Verify metrics are available:

```bash
curl http://localhost:3000/api/metrics
```

---

### Step 3 — Configure Prometheus to scrape your app

Edit `prometheus/prometheus.yml` and update the `nodejs-app` job target:

```yaml
- job_name: "nodejs-app"
  metrics_path: "/api/metrics"    # Next.js
  # metrics_path: "/metrics"      # Express.js
  static_configs:
    - targets:
        - "host.docker.internal:3000"   # Windows/macOS Docker Desktop
        # - "172.17.0.1:3000"           # Linux host
        # - "your_container_name:3000"  # If app runs in a Docker container
```

**Reload Prometheus without restarting:**

```bash
curl -X POST http://localhost:9090/-/reload
```

**Verify** — Prometheus UI → Status → Targets → `nodejs-app` should show state `UP`.

---

### Step 4 — Connect app container to monitoring network (Docker apps only)

If your Node.js app **runs in its own Docker container**, connect it to the `monitoring_network`:

**Option A — Add to existing compose file:**

```yaml
# In your app's docker-compose.yml
services:
  app:
    networks:
      - monitoring_network

networks:
  monitoring_network:
    external: true
    name: monitoring_network
```

**Option B — Connect at runtime:**

```bash
docker network connect monitoring_network your_app_container
```

Then update the Prometheus target to use the container name:

```yaml
targets:
  - "your_app_container:3000"
```

---

## 📊 Grafana — Dashboards & Alerts

### Login

Navigate to `http://localhost:3001` and log in with the credentials from your `.env`.

### Pre-built Dashboard

The **Node.js Overview** dashboard is auto-provisioned. Find it at:  
Dashboards → Monitoring → **Node.js Overview**

Panels included:

- App Status (UP/DOWN)
- Request Rate (req/s)
- HTTP 5xx Error Rate
- Heap Memory Used
- p99 Response Time
- Request Rate by Status Code
- Response Time Percentiles (p50 / p95 / p99)
- Heap Memory Usage (used vs. total)
- Event Loop Lag
- Active Handles & Requests
- Open File Descriptors

### Import additional community dashboards

1. Browse [grafana.com/grafana/dashboards](https://grafana.com/grafana/dashboards)
2. In Grafana → Dashboards → Import → paste the dashboard ID (e.g. `11159` for Node.js)
3. Select **Prometheus** as the data source → Import

### Alerting

Configure notification channels at: Alerting → Contact points → Add contact point.

Supported channels: Email (SMTP), Slack, PagerDuty, webhook, and more.

---

## ⚙️ Configuration Reference

### Prometheus (`prometheus/prometheus.yml`)

| Section | Purpose |
|---------|---------|
| `global.scrape_interval` | How often targets are polled (default: 15s) |
| `global.evaluation_interval` | How often alert rules are checked |
| `scrape_configs` | List of targets to monitor |
| `rule_files` | Paths to alert/recording rule files |

**Hot reload** (without restart):

```bash
curl -X POST http://localhost:9090/-/reload
```

**Validate config:**

```bash
docker run --rm \
  -v $(pwd)/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus:v3.10.0 \
  promtool check config /etc/prometheus/prometheus.yml
```

### Alert Rules (`prometheus/rules/alert.rules.yml`)

| Alert | Fires when |
|-------|-----------|
| `InstanceDown` | A target is unreachable for > 1 minute |
| `HighHTTPErrorRate` | 5xx rate > 5% over 5 minutes |
| `HighP99Latency` | p99 response time > 2 seconds |
| `HighNodeMemoryUsage` | Heap usage > 500 MB |
| `TooManyOpenFileDescriptors` | FDs > 80% of the soft limit |
| `PrometheusConfigReloadFailed` | Config reload was unsuccessful |

### `.env` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GF_ADMIN_USER` | `admin` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | — | **Change this!** Grafana admin password |
| `GRAFANA_PORT` | `3001` | Host port for Grafana |
| `PROMETHEUS_PORT` | `9090` | Host port for Prometheus |
| `PROMETHEUS_RETENTION_TIME` | `30d` | TSDB data retention period |
| `PROMETHEUS_RETENTION_SIZE` | `0` | TSDB size limit (`0` = unlimited) |
| `PROMETHEUS_SCRAPE_INTERVAL` | `15s` | Default scrape interval |
| `PROMETHEUS_MEM_LIMIT` | `2g` | Memory limit for Prometheus container |
| `GRAFANA_MEM_LIMIT` | `512m` | Memory limit for Grafana container |

---

## 🔒 Production Hardening

### 1. Reverse Proxy with TLS (Nginx example)

```nginx
server {
    listen 443 ssl;
    server_name monitoring.example.com;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass         http://localhost:3001;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
    }
}
```

Do **not** expose Prometheus (9090) publicly — keep it on a private network or behind auth.

### 2. Protect the `/metrics` endpoint

Set `METRICS_TOKEN` in your application `.env` and configure Prometheus to send it:

```yaml
# prometheus/prometheus.yml
- job_name: "nodejs-app"
  authorization:
    credentials: "your_secret_token"
```

### 3. Use Docker secrets (Swarm mode)

Replace plain-text passwords in the compose file with Docker secrets for Swarm or Kubernetes deployments.

### 4. Disable Prometheus Admin API in production (if unused)

Remove `--web.enable-admin-api` from the Prometheus `command` section in `docker-compose.yml`.

---

## 🔧 Useful Commands

```bash
# Start stack
docker compose up -d

# Stop stack
docker compose down

# View logs
docker compose logs -f prometheus
docker compose logs -f grafana

# Reload Prometheus config (no restart)
curl -X POST http://localhost:9090/-/reload

# Backup Grafana data volume
docker run --rm \
  -v grafana_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/grafana-backup-$(date +%Y%m%d).tar.gz -C /data .

# Backup Prometheus data volume
docker run --rm \
  -v prometheus_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/prometheus-backup-$(date +%Y%m%d).tar.gz -C /data .

# Update images (pin new version in docker-compose.yml first)
docker compose pull
docker compose up -d

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets | jq .
```

---

## 🐛 Troubleshooting

### Prometheus container exits immediately

```bash
docker compose logs prometheus
```

Common causes:

- Invalid YAML in `prometheus.yml` → validate with `promtool check config`
- Incorrect volume mount path
- Permission denied on config file (Linux) → `chmod 644 prometheus/prometheus.yml`

### Grafana shows "No data" in dashboards

1. Prometheus UI → Status → Targets → verify your app is `UP`
2. Grafana → Explore → run `up` query → check data is present
3. Ensure the dashboard time range covers a period when the app was running
4. Check that `metrics_path` in `prometheus.yml` matches your app's actual endpoint

### Target is `DOWN` in Prometheus

- Verify the app is running: `curl http://localhost:3000/api/metrics`
- Check the target address in `prometheus.yml` resolves correctly from within the container:

  ```bash
  docker exec prometheus wget -qO- http://host.docker.internal:3000/api/metrics
  ```

- On Linux, `host.docker.internal` is not available by default — use the bridge gateway IP instead

### Grafana login fails

- Check the `.env` password matches what was set when the container first started
- If you changed the password after first run, the stored hash in the Grafana volume may differ
- Reset by recreating the Grafana volume:

  ```bash
  docker compose down
  docker volume rm grafana_data
  docker compose up -d
  ```

### Port conflicts

If ports 9090 or 3001 are already in use, change them in `.env`:

```dotenv
PROMETHEUS_PORT=9091
GRAFANA_PORT=3002
```

Then restart: `docker compose up -d`

---

## 📚 References

- [Prometheus — Installation (Docker)](https://prometheus.io/docs/prometheus/latest/installation/#using-docker)
- [Prometheus — Configuration reference](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus — Alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
- [Grafana — Docker installation](https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/)
- [Grafana — Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [prom-client — Node.js Prometheus client](https://github.com/siimon/prom-client)
- [Next.js — Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)

# Nextcloud Docker Setup

Dockerized [Nextcloud](https://nextcloud.com/) deployment with **MariaDB** database and **external Redis** for caching/file locking.

Compatible with **Docker Desktop (Windows)** and **Linux**.

## Stack

| Component  | Image              | Version                       | Notes                                       |
| ---------- | ------------------ | ----------------------------- | ------------------------------------------- |
| Nextcloud  | `nextcloud:stable` | 32.0.7 (apache)               | Latest stable with built-in Apache           |
| MariaDB    | `mariadb:10.11`    | 10.11.x LTS                   | [Recommended](https://docs.nextcloud.com/server/stable/admin_manual/installation/system_requirements.html) by Nextcloud |
| Redis      | External container | User-managed                  | Must be running with password enabled        |

> **Version Compatibility**: Nextcloud stable supports MariaDB 10.6 / **10.11 (recommended)** / 11.4 per [official system requirements](https://docs.nextcloud.com/server/stable/admin_manual/installation/system_requirements.html). MariaDB 10.11 is the recommended LTS version.

## Prerequisites

- **Docker Engine** 20.10+ (Linux) or **Docker Desktop** 4.x+ (Windows/macOS)
- **Docker Compose** v2 (included with Docker Desktop; install separately on Linux if needed)
- **External Redis container** already running with password authentication enabled

## Quick Start

### 1. Configure Environment Variables

```bash
# Navigate to the nextcloud directory
cd nextcloud

# Copy the example environment file
cp .env.example .env

# Edit .env with your actual values
# IMPORTANT: Change ALL default passwords before deploying!
```

Key variables to configure in `.env`:

| Variable                  | Description                               | Example                   |
| ------------------------- | ----------------------------------------- | ------------------------- |
| `MYSQL_ROOT_PASSWORD`     | MariaDB root password                     | `strong_root_password`    |
| `MYSQL_PASSWORD`          | MariaDB nextcloud user password           | `strong_user_password`    |
| `NEXTCLOUD_ADMIN_USER`    | Nextcloud admin username                  | `admin`                   |
| `NEXTCLOUD_ADMIN_PASSWORD`| Nextcloud admin password                  | `strong_admin_password`   |
| `REDIS_HOST`              | Redis container name or hostname          | `redis`                   |
| `REDIS_HOST_PASSWORD`     | Redis password                            | `your_redis_password`     |
| `NEXTCLOUD_TRUSTED_DOMAINS` | Space-separated trusted domains         | `localhost cloud.example.com` |

### 2. Create the External Redis Network

The Nextcloud container communicates with your external Redis container through a shared Docker network.

```bash
# Create the external network
docker network create nextcloud_redis_network

# Connect your existing Redis container to this network
docker network connect nextcloud_redis_network <your_redis_container_name>
```

> **Note**: Replace `<your_redis_container_name>` with the actual name or ID of your running Redis container. You can find it with `docker ps`.

### 3. Verify Redis Connectivity (Optional)

Confirm your Redis container is accessible on the shared network:

```bash
# Check that Redis is connected to the network
docker network inspect nextcloud_redis_network
```

Ensure the `REDIS_HOST` value in your `.env` matches the Redis container name shown in the network inspection output.

### 4. Deploy

```bash
# Start the stack (from the nextcloud directory)
docker compose up -d

# Watch the logs during first startup
docker compose logs -f
```

First startup may take 1–2 minutes as Nextcloud initializes the database and runs auto-configuration.

### 5. Access Nextcloud

Open your browser and navigate to:

```
http://localhost:8080
```

You will be automatically logged in with the admin credentials configured in `.env` (if both `NEXTCLOUD_ADMIN_USER` and `NEXTCLOUD_ADMIN_PASSWORD` were set).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Docker Compose Stack                    │
│                                                         │
│  ┌──────────────────┐       ┌──────────────────┐        │
│  │   nextcloud-app   │──────▶│   nextcloud-db   │        │
│  │  (nextcloud:stable)│      │  (mariadb:10.11) │        │
│  │   Port: 8080:80   │      │  Port: 3306      │        │
│  └────────┬──────────┘       └──────────────────┘        │
│           │              nextcloud_internal network       │
└───────────┼──────────────────────────────────────────────┘
            │
            │  nextcloud_redis_network (external)
            │
    ┌───────▼──────────┐
    │   Redis Container │  ← Pre-existing, external
    │  (password-enabled)│
    └──────────────────┘
```

## MariaDB Configuration

The MariaDB container is started with the following command flags, as required by [Nextcloud database requirements](https://docs.nextcloud.com/server/stable/admin_manual/configuration_database/linux_database_configuration.html):

| Flag                                     | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `--transaction-isolation=READ-COMMITTED` | Required isolation level for Nextcloud             |
| `--log-bin=binlog`                       | Enable binary logging                              |
| `--binlog-format=ROW`                    | Required binary log format                         |

## Volumes

| Volume           | Container Path       | Purpose                          |
| ---------------- | -------------------- | -------------------------------- |
| `nextcloud_data` | `/var/www/html`      | Nextcloud application + user data |
| `mariadb_data`   | `/var/lib/mysql`     | MariaDB database files            |

## Useful Commands

### Nextcloud OCC CLI

The [occ command](https://docs.nextcloud.com/server/stable/admin_manual/configuration_server/occ_command.html) is Nextcloud's command-line interface:

```bash
# Run occ commands
docker compose exec --user www-data app php occ

# Check Nextcloud status
docker compose exec --user www-data app php occ status

# List installed apps
docker compose exec --user www-data app php occ app:list

# Run a maintenance scan
docker compose exec --user www-data app php occ files:scan --all

# Put Nextcloud in maintenance mode
docker compose exec --user www-data app php occ maintenance:mode --on

# Disable maintenance mode
docker compose exec --user www-data app php occ maintenance:mode --off
```

### Database Backup & Restore

```bash
# Backup MariaDB
docker compose exec db mariadb-dump -u root -p"$MYSQL_ROOT_PASSWORD" nextcloud > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore MariaDB
docker compose exec -T db mariadb -u root -p"$MYSQL_ROOT_PASSWORD" nextcloud < backup.sql
```

> **Windows (PowerShell)**: Replace `$(date +%Y%m%d_%H%M%S)` with `$(Get-Date -Format 'yyyyMMdd_HHmmss')`.

### Container Management

```bash
# Stop the stack
docker compose down

# Stop and remove volumes (DANGER: deletes all data!)
docker compose down -v

# Restart a specific service
docker compose restart app

# View logs
docker compose logs -f app
docker compose logs -f db
```

## Upgrading Nextcloud

The official Nextcloud Docker image handles upgrades automatically when the container is recreated with a newer image:

```bash
# Pull latest stable image
docker compose pull

# Recreate containers with new image
docker compose up -d

# Check upgrade progress in logs
docker compose logs -f app
```

> **Important**: Always [backup your database and volumes](#database-backup--restore) before upgrading.

## Reverse Proxy Configuration

If Nextcloud is behind a reverse proxy (nginx, Traefik, Caddy, etc.), uncomment and configure these variables in `.env`:

```bash
APACHE_DISABLE_REWRITE_IP=1
TRUSTED_PROXIES=172.16.0.0/12
OVERWRITEHOST=nextcloud.example.com
OVERWRITEPROTOCOL=https
OVERWRITECLIURL=https://nextcloud.example.com
```

See the [Nextcloud reverse proxy documentation](https://docs.nextcloud.com/server/stable/admin_manual/configuration_server/reverse_proxy_configuration.html) for details.

## Troubleshooting

### Nextcloud cannot connect to the database

1. Ensure the `db` service is healthy: `docker compose ps`
2. Verify `MYSQL_PASSWORD` matches between the `db` and `app` environment variables
3. Check MariaDB logs: `docker compose logs db`

### Nextcloud cannot connect to Redis

1. Verify your Redis container is running: `docker ps | grep redis`
2. Confirm the Redis container is on the shared network: `docker network inspect nextcloud_redis_network`
3. Test Redis connectivity from the Nextcloud container:

   ```bash
   docker compose exec app bash -c "apt-get update && apt-get install -y redis-tools && redis-cli -h ${REDIS_HOST} -p ${REDIS_HOST_PORT} -a ${REDIS_HOST_PASSWORD} ping"
   ```

4. Ensure `REDIS_HOST` matches the Redis container name as shown in `docker network inspect`

### Permission issues on Linux

On Linux, the Nextcloud container runs as `www-data` (UID 33). If you use bind mounts instead of named volumes, ensure proper ownership:

```bash
sudo chown -R 33:33 /path/to/nextcloud/data
```

### Docker Desktop (Windows) specific notes

- Named volumes are stored inside the Docker Desktop VM — no manual permission changes needed
- Use forward slashes (`/`) in volume paths within `docker-compose.yml`
- If port 8080 conflicts, change the host port in `docker-compose.yml`: `"9090:80"`
- File system performance may be slightly slower than native Linux due to the WSL2 layer

## References

- [Nextcloud Docker Hub](https://hub.docker.com/_/nextcloud)
- [MariaDB Docker Hub](https://hub.docker.com/_/mariadb)
- [Nextcloud System Requirements](https://docs.nextcloud.com/server/stable/admin_manual/installation/system_requirements.html)
- [Nextcloud Database Configuration](https://docs.nextcloud.com/server/stable/admin_manual/configuration_database/linux_database_configuration.html)
- [Nextcloud Reverse Proxy Configuration](https://docs.nextcloud.com/server/stable/admin_manual/configuration_server/reverse_proxy_configuration.html)
- [Nextcloud OCC Command Reference](https://docs.nextcloud.com/server/stable/admin_manual/configuration_server/occ_command.html)

# ELK Stack — Production Docker Configuration

Production-ready Docker Compose configuration for Elasticsearch, Logstash, and Kibana (ELK) **v9.3.2**.

> Based on the [official Elastic Docker Compose template](https://github.com/elastic/elasticsearch/blob/main/docs/reference/setup/install/docker/docker-compose.yml) and [production guidelines](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-prod).

---

## Architecture

| Service    | Image                                              | Ports           | Description                              |
|------------|----------------------------------------------------|-----------------|------------------------------------------|
| `setup`    | `elasticsearch:9.3.2`                              | —               | Generates CA/TLS certs, sets passwords   |
| `es01`     | `elasticsearch:9.3.2`                              | `9200`          | Elasticsearch node 1 (master-eligible)   |
| `es02`     | `elasticsearch:9.3.2`                              | —               | Elasticsearch node 2 (master-eligible)   |
| `es03`     | `elasticsearch:9.3.2`                              | —               | Elasticsearch node 3 (master-eligible)   |
| `kibana`   | `kibana:9.3.2`                                     | `5601`          | Kibana dashboard                         |
| `logstash` | `logstash:9.3.2`                                   | `5044`, `50000`, `9600` | Logstash pipeline processor        |

---

## Host Prerequisites (Ubuntu Server)

### 1. Set `vm.max_map_count`

**Required** by Elasticsearch. Must be at least `1048576`.

```bash
# Apply immediately
sudo sysctl -w vm.max_map_count=1048576

# Persist across reboots
echo "vm.max_map_count=1048576" | sudo tee -a /etc/sysctl.conf
```

**Ref:** [Docker production requirements](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-prod#_set_vm_max_map_count)

### 2. Docker Engine & Compose

- Docker Engine 20.10+ (with `overlay2` storage driver)
- Docker Compose v2

```bash
docker --version
docker compose version
```

### 3. System Resources

Minimum **4GB RAM** for Docker (recommended **8GB+** for 3-node production cluster).

---

## Quick Start

### 1. Configure Passwords

Edit the `.env` file and set **strong passwords** (alphanumeric, at least 6 characters):

```bash
ELASTIC_PASSWORD=your_secure_password_here
KIBANA_PASSWORD=your_secure_password_here
```

### 2. Adjust Memory (Optional)

In `.env`, set `MEM_LIMIT` per your available RAM (in bytes):

```bash
# 2GB per container
MEM_LIMIT=2147483648

# 4GB per container
MEM_LIMIT=4294967296
```

### 3. Start the Stack

```bash
docker compose up -d
```

The `setup` service will:

1. Generate a Certificate Authority (CA) and TLS certificates
2. Wait for Elasticsearch to be available
3. Set the `kibana_system` user password

This takes **~60–120 seconds** on first run.

### 4. Verify

```bash
# Check all containers are healthy
docker compose ps

# Test Elasticsearch (from the host)
docker compose exec es01 curl -s --cacert config/certs/ca/ca.crt -u "elastic:${ELASTIC_PASSWORD}" https://localhost:9200

# Open Kibana
# Navigate to http://localhost:5601
# Login with user: elastic, password: <ELASTIC_PASSWORD>
```

---

## Configuration

### Logstash Pipeline

Edit `logstash/pipeline/logstash.conf` to customize the Logstash pipeline.

The default pipeline:

- **Input**: Beats on port `5044`, TCP/JSON on port `50000`
- **Filter**: Drops empty messages
- **Output**: Elasticsearch (HTTPS, authenticated)

**Ref:** [Logstash Docker configuration](https://www.elastic.co/docs/reference/logstash/docker-config)

### Logstash Settings

Edit `logstash/config/logstash.yml` for Logstash-specific settings.

**Ref:** [Logstash settings](https://www.elastic.co/docs/reference/logstash/logstash-settings-file)

### Elasticsearch Port Security

By default, ES port is bound to `127.0.0.1:9200` (localhost only). To expose externally:

```bash
# In .env
ES_PORT=9200
```

**Ref:** [Multi-node setup docs](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-compose)

---

## Ports Reference

| Port    | Service       | Protocol | Description                       |
|---------|---------------|----------|-----------------------------------|
| `9200`  | Elasticsearch | HTTPS    | REST API (localhost only)         |
| `5601`  | Kibana        | HTTP     | Web dashboard                     |
| `5044`  | Logstash      | TCP      | Beats input                       |
| `50000` | Logstash      | TCP/UDP  | Generic JSON input                |
| `9600`  | Logstash      | HTTP     | Monitoring API                    |

---

## Operations

### Stop (preserve data)

```bash
docker compose down
```

### Stop and remove all data

```bash
docker compose down -v
```

### View logs

```bash
docker compose logs -f           # All services
docker compose logs -f es01      # Single service
docker compose logs -f logstash  # Logstash
```

### Restart a single service

```bash
docker compose restart kibana
```

---

## File Structure

```
.
├── .env                          # Environment variables (passwords, versions, ports)
├── docker-compose.yml            # Docker Compose services definition
├── logstash/
│   ├── config/
│   │   └── logstash.yml          # Logstash settings
│   └── pipeline/
│       └── logstash.conf         # Logstash pipeline configuration
└── README.md                     # This file
```

---

## Security Notes

- **TLS/SSL** is enabled on all Elasticsearch HTTP and transport communication
- Certificates are **auto-generated** by the `setup` service using `elasticsearch-certutil`
- Kibana connects to ES using the `kibana_system` built-in user
- ES API port is **bound to localhost** by default — not exposed externally
- All passwords are stored in `.env` — **do not commit this file to version control**

---

## References

- [Elasticsearch Docker Install](https://www.elastic.co/guide/en/elasticsearch/reference/current/docker.html)
- [Multi-node Docker Compose](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-compose)
- [Docker Production Settings](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-prod)
- [Kibana Docker Install](https://www.elastic.co/guide/en/kibana/current/docker.html)
- [Logstash Docker Install](https://www.elastic.co/guide/en/logstash/current/docker.html)
- [Logstash Docker Config](https://www.elastic.co/docs/reference/logstash/docker-config)

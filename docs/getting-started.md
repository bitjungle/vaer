# Deployment Guide

This guide covers production deployment of the Vær server and supporting infrastructure.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Deployment Options](#deployment-options)
- [Production Configuration](#production-configuration)
- [Docker Deployment](#docker-deployment)
- [Security Considerations](#security-considerations)
- [Monitoring & Operations](#monitoring--operations)
- [Troubleshooting](#troubleshooting)

## Architecture Overview

The Vær system consists of two services:

```
┌─────────────┐        ┌──────────────┐        ┌────────────────┐
│ MCP Client  │───────▶│ vaer  │───────▶│  metno-proxy   │
│ (Claude)    │ stdio/ │ (Node.js)    │  HTTP  │  (Nginx)       │
│             │  HTTP  │              │        │                │
└─────────────┘        └──────────────┘        └────────────────┘
                              │                        │
                              │                        │ HTTPS
                              │                        ▼
                              │                 ┌────────────────┐
                              │                 │  api.met.no    │
                              │                 │  (MET Norway)  │
                              │                 └────────────────┘
                              ▼
                       ┌──────────────┐
                       │  places.db   │
                       │  (SQLite)    │
                       └──────────────┘
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

**Best for:**
- Development
- Single-server deployments
- Quick setup

**Pros:**
- Simple configuration
- Automatic service orchestration
- Built-in networking
- Easy updates

**Cons:**
- Single-host limitation
- No built-in load balancing

### Option 2: Kubernetes

**Best for:**
- Production at scale
- Multi-region deployments
- High availability requirements

**Pros:**
- Horizontal scaling
- Service mesh capabilities
- Advanced deployment strategies
- Built-in service discovery

**Cons:**
- Complex setup
- Requires Kubernetes expertise
- Higher operational overhead

### Option 3: Standalone Containers

**Best for:**
- Custom orchestration
- Legacy infrastructure
- Specialized deployment tools

**Pros:**
- Maximum flexibility
- Works with any container runtime

**Cons:**
- Manual networking setup
- No automatic orchestration
- More maintenance

## Production Configuration

### Environment Variables

#### metno-proxy
- **`METNO_USER_AGENT`** (build-time): Your User-Agent string (required by MET Norway)
  - Format: `service-name/version contact@email.com`
  - Example: `my-weather-service/1.0 ops@example.com`
  - Set during build: `docker build --build-arg METNO_USER_AGENT="..."`

#### vaer
- **`METNO_PROXY_BASE_URL`** (required): URL to metno-proxy
  - Development: `http://localhost:8080`
  - Docker Compose: `http://metno-proxy:80`
  - Production: `http://metno-proxy.internal` or similar

- **`METNO_TIMEOUT_MS`** (optional): HTTP timeout (default: 5000ms)
  - Increase for slow networks: `10000`
  - Decrease for fast failures: `3000`

- **`FROST_CLIENT_ID`** (optional): Frost API credentials
  - Get from: https://frost.met.no/auth/requestCredentials.html
  - Enables `weather.get_recent_observations` tool
  - Leave unset if observations not needed

- **`VAER_LOG_LEVEL`** (optional): Logging verbosity
  - `info` (default): Normal production logging
  - `debug`: Verbose logging for troubleshooting
  - `warn`: Errors and warnings only

- **`VAER_PORT`** (optional): Enable HTTP transport
  - Set to port number (e.g., `3000`) to enable HTTP
  - Leave unset for stdio transport (default)
  - HTTP transport is stateless and suitable for load balancing

- **`VAER_AUTH_MODE`** (optional): Authentication for HTTP transport
  - `none` (default): No authentication
  - `api-key`: Simple API key authentication
  - `jwt`: JWT token authentication

- **`VAER_API_KEY`** (optional): API key for `api-key` auth mode

### Resource Requirements

#### metno-proxy (Nginx)
- **CPU**: 0.1-0.25 cores (minimal)
- **Memory**: 64-128 MB
- **Disk**: 100 MB for cache
- **Network**: High bandwidth for API calls

#### vaer (Node.js)
- **CPU**: 0.25-0.5 cores per instance
- **Memory**: 256-512 MB (includes native modules)
- **Disk**: 20 MB + places.db (6 MB if enabled)
- **Network**: Moderate bandwidth

### Scaling Considerations

**Horizontal Scaling:**
- vaer can scale horizontally (stateless)
- Place load balancer in front of vaer instances
- metno-proxy can also scale (shared cache recommended)

**Vertical Scaling:**
- Not typically needed for vaer
- CPU bottleneck only at very high request rates
- Memory stable after startup

## Docker Deployment

### Prerequisites

1. **Docker Engine**: 20.10+ with BuildKit support
2. **Docker Compose**: v2.0+ (or docker-compose 1.29+)
3. **Network Access**: Outbound HTTPS to api.met.no
4. **User-Agent**: Prepare compliant User-Agent string

### Quick Start

```bash
# 1. Clone repository (includes places.db)
git clone https://github.com/bitjungle/vaer.git
cd vaer

# 2. Configure environment
cat > .env <<EOF
METNO_USER_AGENT=my-service/1.0 ops@example.com
FROST_CLIENT_ID=your-frost-id-optional
VAER_LOG_LEVEL=info
EOF

# 3. Build and start services
make compose-build
make up

# 4. Verify deployment
curl http://localhost:8080/healthz
docker compose ps
docker compose logs vaer
```

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
services:
  metno-proxy:
    build:
      args:
        METNO_USER_AGENT: "${METNO_USER_AGENT}"
    restart: always
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  vaer:
    environment:
      - NODE_ENV=production
      - METNO_PROXY_BASE_URL=http://metno-proxy:80
      - METNO_TIMEOUT_MS=${METNO_TIMEOUT_MS:-5000}
      - FROST_CLIENT_ID=${FROST_CLIENT_ID}
      - VAER_LOG_LEVEL=${VAER_LOG_LEVEL:-info}
    restart: always
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
      replicas: 2  # For HTTP transport only
```

Deploy:
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment

Example manifests in `k8s/` directory:

```yaml
# k8s/metno-proxy-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metno-proxy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: metno-proxy
  template:
    metadata:
      labels:
        app: metno-proxy
    spec:
      containers:
      - name: nginx
        image: your-registry/metno-proxy:latest
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "128Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: metno-proxy
spec:
  selector:
    app: metno-proxy
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
```

```yaml
# k8s/vaer-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vaer
spec:
  replicas: 3
  selector:
    matchLabels:
      app: vaer
  template:
    metadata:
      labels:
        app: vaer
    spec:
      containers:
      - name: mcp-server
        image: your-registry/vaer:latest
        ports:
        - containerPort: 3000
        env:
        - name: METNO_PROXY_BASE_URL
          value: "http://metno-proxy"
        - name: VAER_PORT
          value: "3000"
        - name: FROST_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: vaer-secrets
              key: frost-client-id
              optional: true
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: places-data
          mountPath: /app/data
          readOnly: true
      volumes:
      - name: places-data
        configMap:
          name: places-database
          optional: true
```

## Security Considerations

### Network Security

1. **Firewall Rules**:
   - metno-proxy: Only needs outbound HTTPS to api.met.no
   - vaer: Only needs outbound HTTP to metno-proxy
   - No incoming ports needed for stdio transport

2. **TLS/SSL**:
   - metno-proxy → api.met.no uses HTTPS (enforced)
   - vaer → metno-proxy can use HTTP (internal network)
   - Consider mTLS for HTTP transport in production

3. **Network Segmentation**:
   - Deploy on isolated network/VPC
   - Use network policies in Kubernetes
   - Restrict egress to api.met.no only

### Container Security

1. **Image Scanning**:
   ```bash
   # Scan for vulnerabilities
   docker scan vaer:latest
   trivy image vaer:latest
   ```

2. **Non-Root User**:
   - Dockerfile already runs as non-root user (weather:weather)
   - UID/GID: 1001

3. **Read-Only Filesystem**:
   ```yaml
   securityContext:
     readOnlyRootFilesystem: true
     runAsNonRoot: true
     runAsUser: 1001
   ```

4. **Resource Limits**:
   - Always set CPU/memory limits
   - Prevent resource exhaustion attacks

### API Security

1. **User-Agent Compliance**:
   - Use descriptive User-Agent: `service/version contact@email.com`
   - MET Norway may block generic/invalid User-Agents
   - Document your contact email for MET to reach you

2. **Rate Limiting**:
   - metno-proxy has built-in rate limiting (5 req/s)
   - Adjust in nginx.conf if needed
   - Monitor for 429 responses

3. **Authentication** (HTTP transport):
   - Enable `VAER_AUTH_MODE=api-key` in production
   - Use strong, random API keys (32+ characters)
   - Rotate keys regularly
   - Consider JWT for advanced use cases

### Secrets Management

**Development:**
```bash
# .env file (gitignored)
FROST_CLIENT_ID=abc123
VAER_API_KEY=secret-key
```

**Production (Docker Compose):**
```bash
# Use Docker secrets
echo "abc123" | docker secret create frost_client_id -
```

**Production (Kubernetes):**
```bash
# Use Kubernetes secrets
kubectl create secret generic vaer-secrets \
  --from-literal=frost-client-id=abc123 \
  --from-literal=api-key=secret-key
```

## Monitoring & Operations

### Health Checks

**metno-proxy:**
```bash
curl http://localhost:8080/healthz
# Expected: HTTP 200, body: "ok"
```

**vaer (HTTP transport):**
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","transport":"http"}
```

### Metrics & Observability

**Logs:**
```bash
# View all logs
docker compose logs -f

# View specific service
docker compose logs -f vaer

# Kubernetes
kubectl logs -f deployment/vaer
```

**Metrics Endpoint** (HTTP transport):
```bash
curl http://localhost:3000/metrics
```

Exports:
- `weather_mcp_requests_total` - Total requests by tool
- `weather_mcp_request_duration_seconds` - Request latency histogram
- `weather_mcp_upstream_calls_total` - API calls by endpoint
- `weather_mcp_cache_hits_total` / `weather_mcp_cache_misses_total` - Cache hit rate

**Prometheus Configuration:**
```yaml
scrape_configs:
  - job_name: 'vaer'
    static_configs:
      - targets: ['vaer:3000']
    metrics_path: /metrics
```

### Log Aggregation

**Loki (Kubernetes):**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
data:
  promtail.yaml: |
    clients:
      - url: http://loki:3100/loki/api/v1/push
    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_label_app]
            target_label: app
```

### Alerting

Example alerts:
- High error rate (>5% of requests fail)
- High latency (p95 > 5s)
- Cache hit rate low (<50%)
- Proxy unavailable
- Memory usage high (>80%)

### Updates & Rollbacks

**Docker Compose:**
```bash
# Update images
docker compose pull

# Rolling restart
docker compose up -d --no-deps --build vaer

# Rollback (if issues)
docker compose up -d --no-deps vaer:previous-tag
```

**Kubernetes:**
```bash
# Rolling update
kubectl set image deployment/vaer mcp-server=vaer:v2

# Check rollout status
kubectl rollout status deployment/vaer

# Rollback
kubectl rollout undo deployment/vaer
```

## Troubleshooting

### Common Issues

**1. "Unable to reach MET Weather API"**
- **Cause**: metno-proxy not running or unreachable
- **Fix**:
  ```bash
  # Check proxy health
  curl http://localhost:8080/healthz

  # Check logs
  docker compose logs metno-proxy

  # Restart proxy
  docker compose restart metno-proxy
  ```

**2. "PlacesDB not available" (Warning)**
- **Cause**: places.db not found in data/ directory
- **Impact**: Place name resolution disabled (tools still work with coordinates)
- **Note**: places.db is included in the repository. If missing, ensure you have the latest code:
  ```bash
  git pull origin main
  ```
- **Developer option**: Regenerate from source — see [etl-pipeline.md](etl-pipeline.md)

**3. High Memory Usage**
- **Cause**: Memory leak or many concurrent requests
- **Fix**:
  - Check for memory leaks in logs
  - Increase memory limit
  - Restart service
  - Scale horizontally (HTTP transport)

**4. Slow Response Times**
- **Causes**:
  - api.met.no slow
  - Cache cold
  - Network issues
- **Fix**:
  - Check `weather_mcp_upstream_calls_total` metric
  - Verify cache hit rate
  - Increase `METNO_TIMEOUT_MS`
  - Check network latency to api.met.no

**5. 429 Rate Limit Errors**
- **Cause**: Exceeding MET API rate limits
- **Fix**:
  - Reduce request frequency
  - Increase cache TTL in nginx config
  - Contact MET Norway for higher limits
  - Implement request queuing

### Debug Mode

Enable verbose logging:
```bash
# Docker Compose
VAER_LOG_LEVEL=debug docker compose up

# Kubernetes
kubectl set env deployment/vaer VAER_LOG_LEVEL=debug
```

### Support & Contact

- **Vær Issues**: https://github.com/your-org/vaer/issues
- **MET Norway API**: https://api.met.no/doc
- **MET Norway Support**: https://api.met.no/doc/FAQ
- **MCP Protocol**: https://modelcontextprotocol.io

## License & Attribution

This server uses data from MET Norway under [CC BY 4.0](https://api.met.no/doc/License).

All responses include proper attribution as required by MET Norway's terms of use:
```
Data from MET Norway Weather API (https://api.met.no/)
```

Ensure your deployment displays or logs this attribution appropriately.

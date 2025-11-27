# Setup & Development Guide

This guide covers how to get the Vær server and supporting infrastructure running for development and testing.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [Testing the Deployment](#testing-the-deployment)
- [Alternative: Local Development](#alternative-local-development)
- [Optional: Places Database Setup](#optional-places-database-setup)
- [Environment Configuration](#environment-configuration)
- [Testing with MCP Inspector](#testing-with-mcp-inspector)
- [Useful Commands](#useful-commands)
- [Troubleshooting](#troubleshooting)
- [What You Get](#what-you-get)

## Prerequisites

### Required Software

1. **Docker Desktop** (includes Docker Compose)
   - Download: https://www.docker.com/products/docker-desktop
   - Verify: `docker --version && docker compose version`

2. **Node.js 24+ LTS** (for local development)
   - Download: https://nodejs.org/
   - Verify: `node --version`

3. **Git** (to clone repository)
   - Verify: `git --version`

### System Requirements

- **macOS**: 10.15+ (Catalina or later)
- **Linux**: Any modern distribution with Docker support
- **Windows**: Windows 10/11 with WSL2

## Quick Start (Docker Compose)

The fastest way to get the full stack running:

### 1. Build the Docker Images

```bash
# Build both metno-proxy and vaer images
make compose-build
```

This will:
- Build the nginx-based metno-proxy container
- Build the Node.js vaer container with multi-stage build
- Install all dependencies and compile TypeScript

### 2. Start All Services

```bash
# Start metno-proxy and vaer
make up

# Wait 10-15 seconds for health checks to pass
```

You should see:
```
Container metno-proxy  Started
Container metno-proxy  Healthy
Container vaer  Starting
Container vaer  Started
```

### 3. Verify Services are Running

```bash
docker compose ps
```

Expected output:
```
NAME          STATUS                   PORTS
metno-proxy   Up (healthy)            0.0.0.0:8080->80/tcp
vaer   Up (healthy)            0.0.0.0:3000->3000/tcp
```

Both services should show as **healthy**.

## Testing the Deployment

### Test metno-proxy Health

```bash
curl http://localhost:8080/healthz
```

**Expected output:** `ok`

### Test vaer Health

```bash
curl http://localhost:3000/health
```

**Expected output:**
```json
{"status":"ok","transport":"http"}
```

### Test Weather API Integration

```bash
# Get weather forecast for Oslo, Norway
curl "http://localhost:8080/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75" | head -c 500
```

**Expected output:** JSON weather data starting with `{"type":"Feature","geometry":...`

### Test MCP Server Tools

```bash
# List available MCP tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

**Expected output:** JSON-RPC response with list of 8 tools:
- `weather.get_location_forecast`
- `weather.get_nowcast`
- `weather.get_air_quality`
- `weather.get_marine_conditions`
- `weather.get_recent_observations`
- `weather.assess_outdoor_activity_window`
- `weather.assess_marine_trip_risk`
- `places.resolve_name`

### View Service Logs

```bash
# View all logs (follow mode)
make compose-logs

# View specific service logs
docker compose logs -f vaer
docker compose logs -f metno-proxy

# View last 50 lines
docker compose logs --tail=50
```

### Stop Services

```bash
# Stop all services
make down
```

## Alternative: Local Development

If you prefer to run vaer locally outside Docker (for faster iteration):

### 1. Start metno-proxy in Docker

The proxy must always run in Docker:

```bash
cd metno-proxy
make run

# Verify it's running
curl http://localhost:8080/healthz
```

### 2. Install Dependencies and Build

```bash
# From project root
npm install
npm run build
```

### 3. Run vaer Locally

**For stdio transport (default):**
```bash
METNO_PROXY_BASE_URL=http://localhost:8080 node dist/index.js
```

The server will wait for MCP protocol messages on stdin/stdout.

**For HTTP transport (recommended for testing):**
```bash
METNO_PROXY_BASE_URL=http://localhost:8080 \
  VAER_PORT=3000 \
  node dist/index.js
```

The server will listen on http://localhost:3000.

**For development with auto-reload:**
```bash
METNO_PROXY_BASE_URL=http://localhost:8080 \
  VAER_PORT=3000 \
  npm run dev
```

## Optional: Places Database Setup

The places database enables Norwegian place name resolution (28,115 locations).

### Run ETL Pipeline

```bash
# Navigate to ETL directory
cd scripts/etl

# Build and run the ETL pipeline
docker compose -f docker-compose.etl.yml up

# This will:
# - Start a PostGIS container
# - Load Kartverket Stedsnavn data
# - Extract and transform to SQLite
# - Create data/places.db (~6 MB)
```

### Verify Database Created

```bash
# Check file exists
ls -lh ../../data/places.db
# Expected: ~6 MB file

# Check record count
sqlite3 ../../data/places.db "SELECT COUNT(*) FROM places;"
# Expected: 28115
```

### Test Places Integration

```bash
# If using Docker Compose
docker compose restart vaer

# Check logs for successful initialization
docker compose logs vaer | grep PlacesDB
# Expected: "PlacesDB initialized successfully"
```

**Note:** The server runs gracefully without places.db - the places tools are simply disabled with a warning log.

## Environment Configuration

### Create .env File

Create a `.env` file in the project root for custom configuration:

```bash
# .env
# =====

# Required: Your User-Agent for MET Norway API
METNO_USER_AGENT=my-service/1.0 contact@example.com

# Optional: Frost API credentials for observations
# Get from: https://frost.met.no/auth/requestCredentials.html
FROST_CLIENT_ID=your-frost-client-id

# Optional: Logging level
VAER_LOG_LEVEL=debug

# Optional: HTTP timeout
METNO_TIMEOUT_MS=10000
```

### Apply Configuration

```bash
# Rebuild with new User-Agent
make compose-build

# Restart with new environment variables
make compose-restart
```

### Available Environment Variables

#### For metno-proxy (build-time)
- `METNO_USER_AGENT` - User-Agent string (required by MET Norway)

#### For vaer (runtime)
- `METNO_PROXY_BASE_URL` **(required)** - URL to metno-proxy
- `METNO_TIMEOUT_MS` - HTTP timeout in milliseconds (default: 5000)
- `FROST_CLIENT_ID` - Frost API client ID for observations (optional)
- `VAER_LOG_LEVEL` - Logging level: `info`, `debug`, `warn` (default: `info`)
- `VAER_PORT` - Port for HTTP transport (omit for stdio)
- `VAER_AUTH_MODE` - Authentication mode: `none`, `api-key`, `jwt`
- `VAER_API_KEY` - API key if auth mode requires it

## Testing with MCP Inspector

The MCP Inspector provides an interactive UI for testing MCP protocol interactions.

### With Docker (stdio transport)

```bash
# Run interactively
docker compose run --rm vaer

# The container will start and wait for stdin
# Connect with MCP Inspector from another terminal
```

### With Local Build (stdio transport)

```bash
METNO_PROXY_BASE_URL=http://localhost:8080 \
  npx @modelcontextprotocol/inspector node dist/index.js
```

This will:
1. Start the MCP Inspector web UI
2. Open your browser automatically
3. Connect to the vaer server via stdio
4. Allow you to test tools, resources, and prompts interactively

### With HTTP Transport

If running with HTTP transport enabled:

```bash
# Start server
METNO_PROXY_BASE_URL=http://localhost:8080 \
  VAER_PORT=3000 \
  node dist/index.js

# In another terminal, use MCP Inspector in HTTP mode
# (See MCP Inspector docs for HTTP configuration)
```

## Useful Commands

### Service Management

```bash
# Check service status
docker compose ps

# Restart specific service
docker compose restart vaer
docker compose restart metno-proxy

# Rebuild and restart everything
make compose-restart

# Stop services (keep containers)
docker compose stop

# Start stopped services
docker compose start

# Stop and remove all containers
make down

# Remove containers and volumes
docker compose down -v
```

### Logs and Debugging

```bash
# View real-time logs (all services)
make compose-logs

# View logs for specific service
docker compose logs -f vaer
docker compose logs -f metno-proxy

# View last N lines
docker compose logs --tail=100 vaer

# Search logs
docker compose logs vaer | grep ERROR
```

### Resource Monitoring

```bash
# Check container resource usage
docker stats

# Check disk usage
docker system df

# Inspect container
docker inspect vaer
docker inspect metno-proxy
```

### Testing Commands

```bash
# Test proxy health
make test-health

# Test proxy with sample forecast request
make test-forecast

# Run unit tests
npm run test:unit

# Run integration tests (requires services running)
METNO_PROXY_BASE_URL=http://localhost:8080 npm run test:integration

# Run all tests with coverage
npm run test:coverage
```

### Development Commands

```bash
# Type check
npm run typecheck

# Lint code
npm run lint

# Build TypeScript
npm run build

# Clean build artifacts
rm -rf dist/
```

## Troubleshooting

### Services Not Starting

**Issue:** Docker Compose fails to start services

```bash
# Check for port conflicts
lsof -i :8080  # metno-proxy
lsof -i :3000  # vaer

# Kill conflicting processes if needed
kill -9 <PID>

# Check Docker is running
docker ps

# View detailed error logs
docker compose logs --tail=100
```

### Health Checks Failing

**Issue:** Services show as "unhealthy"

**Solution:**
1. Wait 30-60 seconds for health checks to stabilize
2. Check logs for errors:
   ```bash
   docker compose logs metno-proxy
   docker compose logs vaer
   ```
3. Verify health endpoints manually:
   ```bash
   docker exec metno-proxy curl -f http://localhost/healthz
   docker exec vaer wget --spider http://localhost:3000/health
   ```

### PlacesDB Not Available Warning

**Warning in logs:**
```
PlacesDB not available - places tools will be disabled
```

**Explanation:** This is normal if you haven't run the ETL pipeline.

**Impact:** Server works fine, but `places.resolve_name` tool is unavailable.

**Solution (optional):**
```bash
cd scripts/etl
docker compose -f docker-compose.etl.yml up
docker compose restart vaer
```

### Connection Refused Errors

**Issue:** vaer can't connect to metno-proxy

```bash
# Check metno-proxy is running and healthy
docker compose ps metno-proxy

# Check network connectivity
docker exec vaer ping metno-proxy
docker exec vaer curl http://metno-proxy:80/healthz

# Restart services
make compose-restart
```

### Build Errors

**Issue:** Docker build fails

```bash
# Clear Docker cache and rebuild
docker system prune -a
make compose-build

# Check for disk space
df -h
```

### TypeScript Compilation Errors

**Issue:** `npm run build` fails

```bash
# Clean and reinstall
rm -rf node_modules/ dist/
npm install
npm run build

# Check Node.js version
node --version  # Should be 20+
```

### Permission Errors (Linux)

**Issue:** Docker permission denied

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then test
docker ps
```

## What You Get

Once the full stack is running, you have:

### Services

- **metno-proxy**: `http://localhost:8080`
  - Nginx reverse proxy to api.met.no
  - Caching layer (10-minute cache for successful responses)
  - Rate limiting (5 req/s)
  - Health check: `/healthz`

- **vaer**: `http://localhost:3000`
  - MCP server with HTTP transport
  - Health check: `/health`
  - Metrics endpoint: `/metrics` (Prometheus format)
  - MCP protocol: `POST /mcp`

### MCP Capabilities

**8 Tools:**
1. `weather.get_location_forecast` - Global weather forecasts
2. `weather.get_nowcast` - Nordic 2-hour precipitation
3. `weather.get_air_quality` - Norway air quality & AQI
4. `weather.get_marine_conditions` - Coastal marine weather
5. `weather.get_recent_observations` - Observed weather (Frost API)
6. `weather.assess_outdoor_activity_window` - Activity planning
7. `weather.assess_marine_trip_risk` - Marine trip risk assessment
8. `places.resolve_name` - Norwegian place name resolution

**7 Resources:**
- `metno://license` - MET Norway license information
- `metno://products/locationforecast` - Product metadata
- `metno://products/nowcast` - Nowcast metadata
- `metno://products/airquality` - Air quality metadata
- `metno://products/marine` - Marine metadata
- `metno://products/observations` - Observations metadata
- `metno://units` - Unit definitions

**3 Prompts:**
- `weather-planning` - Multi-day weather planning
- `marine-risk-assessment` - Marine trip risk evaluation
- `comfort-scoring` - Outdoor comfort scoring

### Data Coverage

- **Locationforecast**: Global coverage
- **Nowcast**: Nordic region (Norway, Sweden, Finland, Denmark)
- **Air Quality**: Norway only
- **Marine**: Oslo/Western Norway coastal areas
- **Observations**: Norway (requires Frost API credentials)
- **Places**: Norway (28,115 locations)

## Next Steps

- **Connect MCP Clients**: See `examples/client-configs/` for Claude Desktop, VS Code, etc.
- **Production Deployment**: See [DEPLOYMENT.md](../DEPLOYMENT.md) for production setup
- **Development**: See [CLAUDE.md](../CLAUDE.md) for development guidelines
- **Architecture**: See [DESIGN.md](DESIGN.md) for detailed design specification

## See Also

- [README.md](../README.md) - Project overview
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Production deployment guide
- [DESIGN.md](DESIGN.md) - Architecture and design specification
- [V1_HISTORY.md](V1_HISTORY.md) - Implementation history and architectural decisions
- [V2_ROADMAP.md](V2_ROADMAP.md) - Future roadmap and planned features
- [Example Client Configs](../examples/client-configs/) - MCP client configurations

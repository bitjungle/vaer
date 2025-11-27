# VÆR - Model Context Protocol Weather+Place Server

<img src="img/vaer_logo.png" alt="Vær logo" width="120" align="right" />

An **opinionated Model Context Protocol (MCP) server** that provides high-level, LLM-friendly weather tools backed by **MET Norway’s Weather API (`api.met.no`)**, via an internal `metno-proxy` (Nginx reverse proxy + cache).

This server is designed to be used by MCP-compatible clients (e.g. AI assistants, IDEs, custom apps) to get structured weather information and simple “weather services” like activity planning and marine trip risk assessments.

---

## Getting Started

```bash
# Clone the repository
git clone git@github.com:bitjungle/vaer.git
cd vaer

# Start the stack (requires Docker)
make compose-build && make up

# Verify it's running
curl http://localhost:8080/healthz   # → ok
curl http://localhost:3000/health    # → {"status":"ok","transport":"http"}
```

That's it — you now have a running MCP server. See [docs/SETUP.md](docs/SETUP.md) for development setup and [DEPLOYMENT.md](DEPLOYMENT.md) for production.

---

## Features

- **Opinionated weather tools**
  - `weather.get_location_forecast` – normalized hourly forecast
  - `weather.get_nowcast` – short-term precipitation and conditions
  - `weather.get_air_quality` – air quality & AQI for Norwegian locations
  - `weather.get_recent_observations` – recent observed weather (Frost)
  - `weather.get_marine_conditions` – coastal/marine summary
  - `weather.assess_outdoor_activity_window` – "when is it nice outside?"
  - `weather.assess_marine_trip_risk` – simple marine risk evaluation

- **Norwegian place name resolution** (28,115 places)
  - `places.resolve_name` – resolve Norwegian place names to coordinates
  - Powered by Kartverket Stedsnavn (official Norwegian place names register)
  - Supports queries like "What's the weather in Bergen?"
  - Intelligent matching with FTS5 full-text search, confidence scoring and disambiguation
  - Local SQLite database (6.09 MB), ~5ms query latency

- **MCP-native**
  - Exposes **tools**, **resources**, and **prompts** using the MCP specification.
  - Supports **stdio** and **HTTP** transports.

- **Backed by `metno-proxy`**
  - Uses your existing Nginx proxy for:
    - Proper `User-Agent` handling (required by MET Norway)
    - Caching and rate limiting
    - Health checks

- **Structured, consistent outputs**
  - Normalized units (°C, m/s, mm/h, etc.)
  - Structured JSON-like responses + short textual summaries
  - Includes metadata about data source, licensing and cache freshness

- **Attribution & compliance**
  - Built-in resources for MET Norway license & credit lines.
  - Designed to respect MET usage guidelines.

---

## Architecture

High-level architecture:

```text
MCP Client (ChatGPT, IDE, custom app)
        │  (MCP / JSON-RPC)
        ▼
   Vær Server
        ├─ Weather Domain (MET-backed)
        │    │  (HTTP, internal)
        │    ▼
        │  metno-proxy (Nginx: cache, UA, rate limit)
        │    │  (HTTPS)
        │    ▼
        │  api.met.no (MET Norway Weather API)
        │
        └─ Places Domain (Norway gazetteer)
             │  (local SQLite query)
             ▼
           data/places.db (Stedsnavn-derived)
````

* The MCP server **never calls `api.met.no` directly**.
* All upstream traffic goes through `metno-proxy`.
* Place name resolution uses a **local SQLite database** (no network calls).

---

## Requirements

* **Runtime**

  * Node.js 24+ (LTS or newer)

* **MET proxy**

  * A running `metno-proxy` container or service that:

    * Proxies `/weatherapi/...` to `https://api.met.no/...`
    * Sets a compliant `User-Agent`
    * Optionally enables caching & rate limiting

* **Docker + Compose v2** (for Docker deployments and ETL)

  * **macOS/Windows**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes everything)
  * **Linux servers**: Install Docker CE from Docker's official repository — see **[README-docker-install.md](README-docker-install.md)** for step-by-step instructions

  Ubuntu's default `docker.io` package lacks Compose v2 and Buildx. Use Docker's official repo for a complete installation.

* **Places Database** (optional, for Norway place name resolution)

  * Kartverket Stedsnavn PostGIS dump: `postgis/Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql`
  * ETL creates `data/places.db` (28,115 places, 6.09 MB)
  * Server runs gracefully without places.db (tools disabled with warning)
  * See `scripts/etl/README.md` for ETL setup instructions

* **MCP Client**

  * Any client that supports MCP servers over stdio or HTTP.

---

## Configuration

The MCP server is configured via environment variables:

### Required

* `METNO_PROXY_BASE_URL`
  Base URL to the Nginx proxy (e.g. `http://localhost:8080` for dev, `http://metno-proxy:80` for Docker).

### Proxy & Timeouts

* `METNO_TIMEOUT_MS` — Upstream HTTP timeout (default: `5000`ms)
* `METNO_CONNECT_TIMEOUT_MS` — Connection timeout (default: `2000`ms)

### Frost API (Observations)

* `FROST_CLIENT_ID` — Client ID for Frost API (get from https://frost.met.no/auth/requestCredentials.html)
* `FROST_BASE_URL` — Override Frost API base URL (default: `https://frost.met.no`)
* `FROST_TIMEOUT_MS` — Frost API timeout (default: `10000`ms)

### Server

* `VAER_PORT` — Port for HTTP transport. If not set, server uses stdio transport.
* `VAER_LOG_LEVEL` — Logging level: `debug`, `info`, `warn`, `error` (default: `info`)

### Authentication

* `VAER_AUTH_MODE` — Authentication mode: `none`, `api-key`, `jwt` (default: `none`)
* `VAER_API_KEY` — API key value (required if `VAER_AUTH_MODE=api-key`)

### Places Database

* `PLACES_DB_PATH` — Path to SQLite places database (default: `./data/places.db`)

---

## Usage

1. **Run `metno-proxy`**
   Start the Nginx-based proxy that fronts `api.met.no`.

2. **Run the Vær server**
   Start the MCP server process (via `node`, `npm`, `pnpm`, or Docker), pointing it at `METNO_PROXY_BASE_URL`.

3. **Connect from an MCP client**
   Configure your MCP-compatible client to connect to this server:

   * via **stdio** (local)
   * or via **HTTP** (remote), using the configured port and optional API key.

4. **Call tools from the client**
   The client can now call any of the 7 implemented tools:

   **Data Tools:**
   * `weather.get_location_forecast` – Global weather forecasts
   * `weather.get_nowcast` – Nordic 2-hour precipitation
   * `weather.get_air_quality` – Norway air quality & AQI
   * `weather.get_marine_conditions` – Coastal marine weather
   * `weather.get_recent_observations` – Observed weather (Frost API)

   **Service Tools:**
   * `weather.assess_outdoor_activity_window` – Activity planning with comfort scoring
   * `weather.assess_marine_trip_risk` – Marine trip risk assessment

   **Places Tool:**
   * `places.resolve_name` – Resolve Norwegian place names to coordinates

---

## Repository Layout

```text
.
├─ api/
│   └─ apis.json              # MET API catalog
├─ metno-proxy/               # Nginx reverse proxy
│   ├─ Dockerfile
│   ├─ Makefile
│   ├─ nginx.conf
│   └─ conf.d/
│       └─ metno.conf
├─ src/
│  ├─ index.ts                # MCP server entry point
│  ├─ config/                 # Configuration management
│  ├─ transport/              # stdio + HTTP transports
│  ├─ tools/                  # 7 MCP tools (weather.* + places.*)
│  ├─ resources/              # MCP resources (license, products, units)
│  ├─ prompts/                # 3 MCP prompts
│  ├─ domain/                 # Shared utilities (HTTP, errors, caching)
│  └─ places/                 # Places module (db, matcher, schemas)
├─ scripts/
│  └─ etl/                    # Places ETL pipeline (Docker-based)
│      ├─ docker-compose.etl.yml
│      ├─ Dockerfile.etl
│      ├─ Dockerfile.postgis
│      ├─ Makefile
│      └─ scripts/            # Python ETL scripts
├─ tests/                     # Integration tests
├─ data/                      # Runtime data (places.db)
├─ docs/
│   ├─ DESIGN.md              # Complete design specification
│   ├─ V1_HISTORY.md          # Implementation history
│   ├─ V2_ROADMAP.md          # Future roadmap
│   └─ SETUP.md               # Setup & development guide
├─ docker-compose.yml         # Full stack orchestration
├─ Makefile
├─ package.json
├─ CLAUDE.md                  # AI assistant guidance
├─ README-metno-proxy.md
└─ README.md                  # This file
```

---

## Quick Start (Development)

### Prerequisites
- Node.js 24+ LTS
- Docker Desktop (macOS/Windows) or Docker + Compose v2 (Linux — see [Requirements](#requirements))

### Running the Full Stack

```bash
# Build and start all services
make compose-build
make up

# Verify services are running
docker compose ps

# Test endpoints
curl http://localhost:8080/healthz
curl http://localhost:3000/health
```

Both services should show as "healthy":
- **metno-proxy**: `http://localhost:8080` (nginx proxy to api.met.no)
- **vaer**: `http://localhost:3000` (MCP server with HTTP transport)

**For detailed setup instructions, troubleshooting, and alternative configurations, see [docs/SETUP.md](docs/SETUP.md).**

### Testing with MCP Inspector

First, build the project:

```bash
npm run build
```

Then run the inspector:

```bash
METNO_PROXY_BASE_URL=http://localhost:8080 npx @modelcontextprotocol/inspector node dist/index.js
```

**Important**: Use `node dist/index.js` (not `npm run dev`) to avoid npm's output interfering with the MCP JSON-RPC protocol over stdio.

### Testing HTTP Transport

To test the HTTP transport:

```bash
# Start server with HTTP transport
METNO_PROXY_BASE_URL=http://localhost:8080 VAER_PORT=3000 npm run dev

# In another terminal, test health endpoint
curl http://localhost:3000/health

# Expected response: {"status":"ok","transport":"http"}
```

The HTTP transport:
- Listens on configured port (e.g., 3000)
- Exposes MCP protocol at `POST /mcp` endpoint
- Provides health check at `GET /health` endpoint
- Uses StreamableHTTPServerTransport (stateless mode)
- Shares same tools/resources/prompts as stdio transport

**Note**: Testing the full MCP protocol over HTTP requires a proper MCP client (like MCP Inspector in HTTP mode or the MCP SDK client).

### Testing Proxy Integration

To test the proxy integration layer:

```bash
METNO_PROXY_BASE_URL=http://localhost:8080 npx tsx tests/test-proxy-integration.ts
```

This validates:
- Health check endpoint
- Fetching data from MET API via proxy
- Cache header parsing
- Error handling

### Testing Location Forecast Tool

To test the location forecast tool:

```bash
METNO_PROXY_BASE_URL=http://localhost:8080 npx tsx tests/test-location-forecast.ts
```

This validates:
- Basic forecast with defaults
- Forecast with altitude and probabilistic data
- Cache verification
- API error handling

---

## Automated Testing

The project uses [Vitest](https://vitest.dev/) for automated testing with separate configurations for unit and integration tests.

### Test Structure

```
tests/
├── integration/           # Integration tests (require running services)
│   ├── setup.ts          # Shared test setup and fixtures
│   ├── proxy.integration.test.ts
│   ├── server-startup.integration.test.ts
│   ├── mcp-resources-prompts.integration.test.ts
│   └── tools.integration.test.ts
└── (unit tests in src/)  # Unit tests co-located with source
```

### Running Tests

**All tests:**
```bash
npm test
```

**Unit tests only** (src/**/*.test.ts):
```bash
npm run test:unit
```

**Integration tests** (requires metno-proxy running):
```bash
METNO_PROXY_BASE_URL=http://localhost:8080 npm run test:integration
```

**Watch mode** (re-run on file changes):
```bash
npm run test:watch                    # All tests
npm run test:integration:watch        # Integration tests only
```

**Coverage report:**
```bash
npm run test:coverage
```

### Integration Test Requirements

Integration tests require:
1. **metno-proxy running** at `http://localhost:8080`
   ```bash
   cd metno-proxy && make run
   ```

2. **(Optional) Frost API credentials** for observation tests:
   ```bash
   export FROST_CLIENT_ID="your-client-id"
   ```

3. **(Optional) Places database** for place name resolution tests:
   - Run ETL pipeline first (see "Setting Up Places Module" below)

### Test Coverage Thresholds

The project enforces minimum 70% coverage for:
- Lines
- Functions
- Branches
- Statements

Coverage excludes:
- Test files
- Configuration files
- Entry point (src/index.ts)
- Demo scripts

### Known Test Limitations

Some tests are currently skipped due to:
- **MCP prompt argument type mismatch**: lat/lon parameter validation issue ([see test file](tests/integration/mcp-resources-prompts.integration.test.ts))
- **API availability**: Nowcast and marine endpoints may not be fully configured
- **Response structure changes**: Some tool response formats need verification

See inline `it.skip()` and `describe.skip()` blocks with TODO comments for details.

---

### Setting Up Places Module (Optional)

The places module requires a one-time ETL run to create the local database:

```bash
cd scripts/etl

# Build Docker images (first time only)
docker compose -f docker-compose.etl.yml build

# Run ETL pipeline (~2 seconds)
docker compose -f docker-compose.etl.yml up

# Verify output
ls -lh ../../data/places.db  # Should show ~6 MB
sqlite3 ../../data/places.db "SELECT COUNT(*) FROM places;"  # Should show 28115
```

Test the places integration:

```bash
npx tsx tests/test-places-integration.ts
```

**Note**: The server runs gracefully without `places.db` - places tools are simply disabled with a warning log.

---

## Deployment

The Vær server can be deployed in multiple ways:

### Docker Compose (Recommended)

Deploy the full stack (metno-proxy + vaer) with a single command:

```bash
# 1. Build and start all services
make compose-build
make up

# 2. Verify deployment
docker compose ps
curl http://localhost:8080/healthz

# 3. View logs
make compose-logs

# 4. Stop services
make down
```

**Environment Configuration:**

Create a `.env` file in the project root:
```bash
# Required: Your User-Agent for MET Norway API
METNO_USER_AGENT=my-service/1.0 contact@example.com

# Optional: Frost API credentials for observations
FROST_CLIENT_ID=your-frost-client-id

# Optional: Logging level
VAER_LOG_LEVEL=info
```

### Standalone Docker

Build and run the MCP server image directly:

```bash
# Build image
docker build -t vaer:latest .

# Run with environment variables
docker run -d \
  --name vaer \
  -e METNO_PROXY_BASE_URL=http://metno-proxy:80 \
  -e VAER_LOG_LEVEL=info \
  -v $(pwd)/data:/app/data:ro \
  vaer:latest
```

### MCP Client Configuration

Connect MCP clients (Claude Desktop, VS Code, etc.) to the server:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "vaer": {
      "command": "node",
      "args": ["/path/to/vaer/dist/index.js"],
      "env": {
        "METNO_PROXY_BASE_URL": "http://localhost:8080"
      }
    }
  }
}
```

**Docker-based setup:**
```json
{
  "mcpServers": {
    "vaer": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "--network", "vaer_vaer-network",
        "-e", "METNO_PROXY_BASE_URL=http://metno-proxy:80",
        "vaer:latest"
      ]
    }
  }
}
```

See [`examples/client-configs/`](examples/client-configs/) for more configuration examples.

### Production Deployment

For production deployments, see:
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Comprehensive deployment guide
  - Docker Compose production configuration
  - Kubernetes manifests
  - Security considerations
  - Monitoring & operations
  - Troubleshooting

---

## License

VÆR is open-source software licensed under the MIT License. However, the author respectfully requests that it not be used for military, warfare, or surveillance applications.
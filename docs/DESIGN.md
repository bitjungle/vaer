# Opinionated Weather + Places MCP Server

## 1. Purpose & Scope

### 1.1 Mission

Provide an **opinionated MCP server** that exposes **high-level weather tools** and **Norwegian place name resolution** backed by:

* **MET Norway's Weather API** (`api.met.no`) via `metno-proxy` (Nginx reverse proxy + cache).([api.met.no][1])
* **Kartverket Stedsnavn** (Norwegian place name register) via local SQLite gazetteer.

The server targets the **MCP spec revision `2025-06-18`**, exposing **tools, resources, and prompts** over **stdio** and **Streamable HTTP** using the official TypeScript SDK.([modelcontextprotocol.io][2])

This unified server enables complete "weather in <place>" workflows within a single MCP integration:

1. Resolve Norwegian place names to coordinates (e.g., "Bergen" → 60.39°N, 5.32°E)
2. Fetch weather data for those coordinates
3. Return grounded, properly attributed answers

### 1.2 Non-Goals

* Not a full clone of all `api.met.no` endpoints.
* No geocoding outside Norway (places module is Norway-only).
* No long-term historical analytics (Frost access is limited to "recent observations" for v1).

---

## 2. High-Level Architecture

### 2.1 Components

```text
MCP Client (Claude Desktop, IDE, custom app)
        │  (JSON-RPC over stdio / HTTP)
        ▼
  Weather+Places MCP Server
        ├─ Domain: weather (MET-backed)
        │    │  (HTTP, internal)
        │    ▼
        │  metno-proxy (Nginx: cache, UA, rate limit)
        │    │  (HTTPS)
        │    ▼
        │  api.met.no (MET Norway Weather API)
        │
        └─ Domain: places (Norway gazetteer)
             │  (local SQLite query)
             ▼
           data/places.db (Stedsnavn-derived)
```

* **MCP Server** (unified, single process)

  * Implements MCP server lifecycle and capabilities (tools/resources/prompts).([modelcontextprotocol.io][3])
  * Uses TypeScript SDK `@modelcontextprotocol/sdk` with `zod` for schema validation.([GitHub][4])
  * Two domain modules:
    * `weather/` – All MET-related logic and tools
    * `places/` – Stedsnavn ETL, gazetteer querying, place resolution

* **metno-proxy**

  * Handles User-Agent requirements, caching, optional rate limiting, and health checks.
  * Only internal traffic between MCP server and proxy.

* **MET Weather API**

  * Provides Locationforecast, Nowcast, Airqualityforecast, Gribfiles, Frost, etc.([api.met.no][5])

* **Places Database** (`data/places.db`)

  * Read-only SQLite database with 28,115 Norwegian place records
  * FTS5 full-text search index for fuzzy matching
  * Derived from Kartverket Stedsnavn via offline ETL pipeline
  * Never requires network access

### 2.2 Transports

* **stdio**: For local CLI / desktop integrations.
* **Streamable HTTP**: For web or remote clients, using `StreamableHTTPServerTransport`.([GitHub][4])

Both transports MUST expose identical capabilities.

---

## 3. Functional Requirements

### 3.1 Weather Capabilities (v1)

1. **Location Forecasts**

   * Short/medium-range forecast up to 9 days using Locationforecast/2.0 `compact` JSON.([api.met.no][6])
2. **Nowcast**

   * High-frequency (5-min) precipitation/conditions up to 2 hours for Nordic coordinates.([api.met.no][7])
3. **Air Quality**

   * Air quality index and key pollutants for Norwegian locations via Airqualityforecast.([api.met.no][8])
4. **Recent Observations**

   * Recent temperature / wind / precipitation via Frost (limited to last N days/hours).([api.met.no][5])
5. **Marine Conditions (Coastal/Nearshore)**

   * Basic wave + wind conditions via Gribfiles (coast from Oslo / Western Norway).([api.met.no][5])

### 3.2 Opinionated "Service" Features

* **Hourly comfort scoring** for outdoor activities.
* **Marine trip risk assessment** with simple thresholds.
* Normalized, consistent units (°C, m/s, mm/h, etc.).
* Optional probability fields if available (e.g. percentiles from Locationforecast).([MET Weather API][9])

### 3.3 Places Capabilities (Norway-only)

1. **Place Name Resolution**

   * Resolve Norwegian place names to coordinates using Kartverket Stedsnavn register
   * Supports fuzzy matching and Norwegian characters (æ, ø, å)
   * FTS5 full-text search for flexible name matching
   * Confidence scoring and disambiguation support

2. **Coverage**

   * 28,115 Norwegian places (as-built)
   * Place types: cities (by), towns (tettsted), villages (bygdelagBygd), districts (bydel), settlements (tettbebyggelse), farms (gard)
   * Municipality and county metadata
   * Coordinates in WGS84 (EPSG:4326)

3. **Runtime Behavior**

   * Local SQLite database (6.09 MB)
   * No network calls required
   * Read-only queries (~5ms latency)
   * Graceful degradation if database unavailable (places tool not registered)

---

## 4. Non-Functional Requirements

1. **Compliance with MET terms**

   * Always set a **non-generic User-Agent** (handled by Nginx) and respect rate limits.([api.met.no][1])
   * Expose licensing and crediting info as an MCP resource (see §7).([api.met.no][1])
2. **Performance**

   * Target p95 < 300ms for forecast tools for cached requests.
   * Use proxy cache to reduce load and latency.
3. **Reliability**

   * Graceful degradation when `api.met.no` is unavailable (stale cache + clear error output).
4. **Localization**

   * Support `language` parameter (ISO language code, default `en`) for textual summaries.
5. **Security**

   * Support pluggable authentication for HTTP transport (none/api-key/jwt), at MCP layer.
   * No secrets in tool arguments or structured outputs.
6. **Observability**

   * Structured logging, correlation IDs, minimal metrics (latency, error rate, cache hit ratio).

---

## 5. Data & Domain Model

### 5.1 Core Concepts

* **Coordinate**: `{ lat: number; lon: number; altitude?: number }`
* **TimeWindow**:

  * `kind: "absolute" | "relative"`
  * `from` / `to` ISO timestamps, or relative (e.g. `"next_48h"`).
* **WeatherPoint** (hourly):

  * `time`
  * `air_temperature` (°C)
  * `wind_speed` (m/s)
  * `wind_direction` (deg)
  * `precipitation_rate` (mm/h)
  * `symbol_code` (MET icon code)
  * Optionally: probability/percentiles if available.
* **ComfortScore**

  * `score: "good" | "ok" | "poor"`
  * `reason: string`
  * Detailed factors: `temperature_ok`, `wind_ok`, `precipitation_ok`, `darkness_ok` (if sunrise/sunset is added later).
* **MarineConditions**

  * `significant_wave_height` (m)
  * `wind_speed` (m/s)
  * `wind_direction` (deg)
  * `risk_level: "low" | "medium" | "high"`

All units follow MET defaults (metric) with explicit unit annotations in structured outputs, so the LLM never has to guess.

### 5.2 Places Data Model

* **Place** (resolved location):

  * `ssr_id: string` (Stedsnavn register ID)
  * `primary_name: string` (normalized Norwegian name)
  * `lat: number` (WGS84 latitude)
  * `lon: number` (WGS84 longitude)
  * `municipality_code?: string` (e.g., "4601")
  * `municipality_name?: string` (e.g., "Bergen")
  * `county_name?: string` (e.g., "Vestland")
  * `place_class: string` (city/town/village/farm/district/settlement)
  * `importance: number` (0-10 scoring for ranking)
  * `confidence: number` (0-1 match confidence)

* **Place Types** (as-built):

  * `city` (by) – Cities, highest importance (10.0)
  * `town` (tettsted) – Towns (8.0)
  * `district` (bydel) – Urban districts (7.0)
  * `village` (bygdelagBygd) – Villages (5.0)
  * `settlement` (tettbebyggelse) – Built-up areas (4.0)
  * `farm` (gard) – Farms (2.0)

* **Match Confidence**:

  * `1.0` – Exact match on primary name
  * `0.6-0.9` – FTS fuzzy match (ranked by SQLite rank score)
  * Adjusted by importance (municipality/county names boosted +2.0)

---

## 6. MCP Surface: Tools

Tools should follow MCP’s tools mechanism and schemas as described in the 2025-06-18 spec (name, description, input/output schemas, structured content).([modelcontextprotocol.io][10])

### 6.1 General Design Rules

* **Naming**:
  * `weather.*` namespace for weather tools (e.g. `weather.get_location_forecast`)
  * `places.*` namespace for place resolution (e.g. `places.resolve_name`)
* **Schemas**:

  * Define input/output schemas using `zod` or JSON Schema equivalent.
  * Ensure all outputs include both:

    * `structuredContent` (machine-readable object)
    * `content` with a brief textual summary for the model.([GitHub][4])
* **Idempotency**: All tools are pure functions (no persistent state changes).
* **Error model**: Standardized error envelope (see §10).

---

### 6.2 Tool: `weather.get_location_forecast`

**Purpose**
Retrieve an opinionated hourly forecast using Locationforecast/2.0 `compact` JSON, normalized to a simple time series.([api.met.no][6])

**Input schema (conceptual)**

```json
{
  "type": "object",
  "properties": {
    "location": {
      "type": "object",
      "required": ["lat", "lon"],
      "properties": {
        "lat": { "type": "number", "minimum": -90, "maximum": 90 },
        "lon": { "type": "number", "minimum": -180, "maximum": 180 },
        "altitude": { "type": "number", "minimum": -500, "maximum": 9000 }
      }
    },
    "timeWindow": {
      "type": "object",
      "properties": {
        "kind": { "enum": ["absolute", "relative"] },
        "from": { "type": "string", "format": "date-time" },
        "to": { "type": "string", "format": "date-time" },
        "preset": {
          "enum": ["next_24h", "next_48h", "next_7d", "full_available"]
        }
      },
      "additionalProperties": false
    },
    "resolution": {
      "enum": ["hourly", "3-hourly"],
      "default": "hourly"
    },
    "includeProbabilistic": {
      "type": "boolean",
      "default": false
    },
    "language": {
      "type": "string",
      "description": "BCP-47 language tag used only for textual summary",
      "default": "en"
    }
  },
  "required": ["location"]
}
```

**Output schema (conceptual)**

```json
{
  "type": "object",
  "properties": {
    "source": {
      "type": "object",
      "properties": {
        "provider": { "const": "MET Norway" },
        "product": { "const": "Locationforecast 2.0" },
        "licenseUri": { "type": "string", "format": "uri" },
        "creditLine": { "type": "string" },
        "cached": { "type": "boolean" },
        "ageSeconds": { "type": "number" }
      }
    },
    "location": {
      "type": "object",
      "properties": {
        "lat": { "type": "number" },
        "lon": { "type": "number" },
        "altitude": { "type": "number" },
        "elevationUsed": { "type": "number" }
      }
    },
    "timeWindow": {
      "type": "object",
      "properties": {
        "from": { "type": "string", "format": "date-time" },
        "to": { "type": "string", "format": "date-time" }
      }
    },
    "hours": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "time": { "type": "string", "format": "date-time" },
          "air_temperature": { "type": "number" },
          "air_temperature_unit": { "const": "C" },
          "wind_speed": { "type": "number" },
          "wind_speed_unit": { "const": "m/s" },
          "wind_direction": { "type": "number" },
          "precipitation_rate": { "type": "number" },
          "precipitation_unit": { "const": "mm/h" },
          "symbol_code": { "type": "string" },
          "air_temperature_p10": { "type": "number" },
          "air_temperature_p90": { "type": "number" }
        },
        "required": ["time", "air_temperature", "wind_speed", "symbol_code"]
      }
    }
  },
  "required": ["source", "location", "timeWindow", "hours"]
}
```

**Behavior**

* Maps to `GET /weatherapi/locationforecast/2.0/compact` on `metno-proxy`.
* Applies optional down-sampling to `3-hourly` if requested.
* Populates `cached` and `ageSeconds` from proxy headers (e.g. `X-Proxy-Cache` and `Age`).
* Validates MET constraints (e.g., coordinates, altitude guidance).([MET Weather API][9])

---

### 6.3 Tool: `weather.get_nowcast`

**Purpose**
Two-hour immediate forecast for Nordic region; optimized for short-term precipitation and “do I get wet in the next 2 hours?”.([api.met.no][7])

**Inputs**

Similar to `get_location_forecast` but:

* `timeWindow` is optional and constrained to **max 2 hours ahead**.
* Fails fast if coordinates are outside Nowcast coverage.

**Output**

* Same normalized structure as `hours` above but only for `<= 2h` and with an extra field `precipitation_intensity_class` (`"none" | "light" | "moderate" | "heavy"`).

---

### 6.4 Tool: `weather.get_air_quality`

**Purpose**
Get air quality forecast and AQI for Norwegian locations.([api.met.no][8])

**Inputs**

```json
{
  "type": "object",
  "properties": {
    "lat": { "type": "number" },
    "lon": { "type": "number" },
    "timeWindow": { "...similar to above..." },
    "areaClass": {
      "enum": ["kommune", "delomrade", "grunnkrets", "fylke"],
      "description": "Optional; if omitted, service default is used."
    },
    "language": { "type": "string", "default": "en" }
  },
  "required": ["lat", "lon"]
}
```

**Output**

* Structured object with:

  * `aqi` (categorical index)
  * `aqi_numeric`
  * `dominant_pollutant`
  * `pollutants`: PM2.5, PM10, NO2, O3, etc. with unit `µg/m³`.
  * `advice` (short model-friendly text for vulnerable groups).

---

### 6.5 Tool: `weather.get_recent_observations`

**Purpose**
Fetch recent observed weather for a point or station, via Frost.([api.met.no][5])

**Inputs**

* `location`: either `{ lat, lon, radiusKm }` or `stationId`.
* `timeWindow`: limited to last N days (e.g., `<= 7`).
* `elements`: e.g., `["air_temperature", "wind_speed", "precipitation_amount"]`.

**Output**

* Normalized time series similar to forecast but with `source: "observations"` and station metadata (name, elevation).

---

### 6.6 Tool: `weather.get_marine_conditions`

**Purpose**
High-level marine summary for coastal regions using Gribfiles (and optionally Locationforecast near coast).([api.met.no][5])

**Inputs**

* `location` (lat, lon) – must be within supported coastal region.
* `timeWindow` (max e.g. 48h).
* `vesselType`: `"kayak" | "small_sailboat" | "motorboat" | "ship"`.
* `language`.

**Output**

* Array of `MarineConditions` by hour:

  * `wind_speed`, `wind_direction`, `wave_height`, `wave_period`, etc.
  * `risk_level` computed from thresholds based on vessel type.
  * `notes`: e.g. “Strong gusts from the west; not recommended for small craft.”

---

### 6.7 Tool: `weather.assess_outdoor_activity_window`

**Purpose**
Opinionated “service” tool: given an activity and time window, compute comfort scores.

**Inputs**

* `activity`: `"running" | "cycling" | "hiking" | "kids_playground" | "commuting" | "custom"`.
* `location`, `timeWindow`, `language`.
* Optional `preferences` (e.g., `minTemp`, `maxTemp`, `maxWind`, `avoidRain`).

**Behavior**

* Internally calls `get_location_forecast` (and optionally `get_nowcast` for next 2h).
* Applies deterministic rules:

  * Running: prefer temperature 5–20°C, wind < 10 m/s, no heavy rain.
  * Kids playground: prefer > 5°C, no heavy rain, moderate wind.
* Returns hourly list of `ComfortScore` + recommended best slots.

**Output**

* `slots: [{ time, score, reason }]`.
* `summary`: recommended time ranges.

---

### 6.8 Tool: `weather.assess_marine_trip_risk`

**Purpose**
Opinionated risk assessment for simple marine trips.

**Inputs**

* `route`: `[{ lat, lon }, ...]` (polyline) or `areaName`.
* `timeWindow`, `vesselType`, `language`.

**Behavior**

* Calls `get_marine_conditions` at key points along route.
* Computes global risk levels (low/medium/high) + location/time hotspots.
* Outputs structured risk report.

---

### 6.9 Tool: `weather.debug_raw_met_response` (optional debug only)

* Returns raw JSON/XML payload (truncated) for advanced debugging.
* Flagged as **debug** via MCP metadata so normal LLM flows ignore it.

---

### 6.10 Tool: `places.resolve_name`

**Purpose**
Resolve a Norwegian place name to one or more candidate locations with coordinates, using the local Kartverket Stedsnavn gazetteer.

**Input schema**

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Norwegian place name to resolve (e.g., 'Bergen', 'Oslo', 'Tromsø')",
      "minLength": 1
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results to return",
      "minimum": 1,
      "maximum": 20,
      "default": 5
    }
  },
  "required": ["query"]
}
```

**Output schema**

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string" },
    "matches": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "ssr_id": { "type": "string" },
          "name": { "type": "string" },
          "lat": { "type": "number" },
          "lon": { "type": "number" },
          "municipality_name": { "type": "string" },
          "municipality_code": { "type": "string" },
          "county_name": { "type": "string" },
          "place_class": { "type": "string" },
          "importance": { "type": "number" },
          "confidence": { "type": "number" }
        },
        "required": ["ssr_id", "name", "lat", "lon", "place_class", "importance", "confidence"]
      }
    },
    "source": {
      "type": "object",
      "properties": {
        "provider": { "const": "Kartverket" },
        "dataset": { "const": "Stedsnavn (SSR)" },
        "licenseUri": { "type": "string" },
        "creditLine": { "type": "string" }
      }
    }
  },
  "required": ["query", "matches", "source"]
}
```

**Behavior (as-built)**

* Queries local SQLite database (`data/places.db`)
* Matching strategy:
  1. Exact match on `primary_name` (confidence = 1.0)
  2. FTS5 full-text search with ranking (confidence = 0.6-0.9)
  3. Results ordered by confidence DESC, then importance DESC
* Norwegian characters (æ, ø, å) handled correctly via unicode61 tokenizer
* Returns empty matches array if no results found (not an error)
* Typical query latency: ~5ms

**Usage Pattern**

When a user mentions a Norwegian place name without coordinates:

1. Call `places.resolve_name` with the place name
2. If exactly one match with confidence ≥ 0.8: use those coordinates
3. If multiple high-confidence matches: ask user to disambiguate using municipality/county
4. If no matches or all low confidence: ask user for clarification or nearby larger place
5. Once coordinates selected, call appropriate `weather.*` tool

---

## 7. MCP Resources

Resources expose static or dynamically generated content per MCP spec.([modelcontextprotocol.io][11])

### 7.1 `metno/license`

**URI**: `metno://license`

Contains:

* License text summary:

  * Data is CC-licensed + MET specific conditions.([api.met.no][1])
* Required credit line (string).
* Link to full license and usage terms.

This resource is **referenced in all tool outputs** via `licenseUri` and `creditLine`.

### 7.2 `metno/products`

**URI**: `metno://products`

JSON content summarizing **which MET APIs** are currently integrated:

* `locationforecast`, `nowcast`, `airqualityforecast`, `gribfiles`, `frost`.
* Version numbers, coverage, links to documentation.([api.met.no][5])

### 7.3 `weather/units`

**URI**: `weather://units`

Specifies:

* Default units for each quantity.
* Any derived quantities (e.g. “feels_like” if added later) and formulas.

### 7.4 `weather/examples`

**URI pattern**: `weather://examples/{language}`

Contains curated example prompts and expected tool invocations for clients or humans to inspect.

### 7.5 `places/license/ssr`

**URI**: `places://license/ssr`

Contains:

* License for Kartverket Stedsnavn (SSR) dataset
* Required credit line: "Place names from Kartverket Stedsnavn (CC BY 4.0)"
* Link to full license: https://kartverk.no/api-og-data/lisens
* Data source: Norwegian Mapping Authority (Kartverket)

### 7.6 `places/gazetteer/info`

**URI**: `places://gazetteer/info`

Metadata about the places database:

* **dataset_version**: Stedsnavn source dataset identifier
* **projection_source**: EUREF89 UTM Zone 33 (EPSG:25833)
* **projection_runtime**: WGS84 (EPSG:4326)
* **record_count**: 28,115 (as-built)
* **build_date**: ISO timestamp of ETL execution
* **place_types**: List of included types with counts
* **coverage**: "Norway only"
* **database_size_mb**: 6.09

---

## 8. MCP Prompts

Prompts let the server expose recommended prompt templates/workflows.([modelcontextprotocol.io][12])

### 8.1 Prompt: `plan_outdoor_event`

* **Arguments**: `locationName` OR `lat`/`lon`, `date`, `timezone`, `activityType`.
* **Instructions**:

  * If `locationName` provided (Norwegian place):
    1. Call `places.resolve_name` to get coordinates
    2. Handle disambiguation if multiple matches
  * If `lat`/`lon` provided: use directly
  * Call `weather.assess_outdoor_activity_window` with `timeWindow` covering `date` (08:00–22:00 local).
  * Present 2–3 best time windows, with explicit mention of temperature, wind, precipitation.
  * Always mention "Forecast from MET Norway's Weather API".
  * If place name was resolved, mention "Location resolved using Kartverket Stedsnavn".

### 8.2 Prompt: `check_marine_trip`

* **Arguments**: `routeDescription`, `latStart`/`lonStart` OR `startPlaceName`, `latEnd`/`lonEnd` OR `endPlaceName`, `departureTime`, `vesselType`.
* **Instructions**:

  * If place names provided: resolve via `places.resolve_name` first
  * Call `weather.assess_marine_trip_risk`.
  * Explain low/medium/high segments.
  * Suggest postponing or adjusting route if high risk.

### 8.3 Prompt: `air_quality_advice`

* **Arguments**: `placeName` OR `lat`/`lon`, `date`, `hasAsthma`, `isPregnant`, `hasChildren`.
* **Instructions**:

  * If Norwegian `placeName` provided: resolve via `places.resolve_name`
  * Call `weather.get_air_quality`.
  * Provide simple, clear advice, especially for vulnerable groups.

---

## 9. Autocompletion (Completion Utilities)

MCP 2025 spec defines **completion** utilities for argument autocomplete.([modelcontextprotocol.io][13])

Design:

* **Completion: `places.location_completions`**

  * Given a partially typed Norwegian place name, return suggestions.
  * Uses internal `places.resolve_name` with fuzzy matching.
  * As-built: Norway-only place name suggestions.

* **Completion for prompts/tools**

  * Provide suggested `activityType` values, `vesselType`, etc.

This is optional v1 but the interfaces should be defined to avoid breaking changes when implemented later.

---

## 10. Error Handling & Contracts

### 10.1 Error Model

Use a structured error object in `structuredContent` and text content for clarity:

```json
{
  "error": {
    "code": "MET_API_UNAVAILABLE",
    "message": "MET Weather API is currently unavailable.",
    "retryable": true,
    "details": {
      "upstreamStatus": 503,
      "requestId": "..."
    }
  }
}
```

Standard codes include:

**Weather errors:**

* `INVALID_INPUT` – Invalid parameters
* `OUT_OF_COVERAGE` – Location outside API coverage (e.g., Nowcast outside Nordic area)
* `RATE_LIMITED` – Rate limit exceeded
* `MET_API_UNAVAILABLE` – Upstream MET API unavailable
* `INTERNAL_ERROR` – Server-side error

**Places errors:**

* `INVALID_INPUT` – Invalid query parameters
* `PLACES_DATABASE_UNAVAILABLE` – SQLite database not found or corrupted
* Note: Empty results (no matches) are NOT errors – returns empty `matches` array

Align these with MCP's general error semantics (JSON-RPC error codes plus additional fields where appropriate).([modelcontextprotocol.io][2])

### 10.2 Upstream Errors

* Map `403` from `api.met.no` to a clear message hinting at User-Agent / ToS issues (though this should not happen via proxy).([MET Weather API][14])
* Map `429`/`503` to `RATE_LIMITED` with `retryAfterSeconds` when available.

---

## 11. Rate Limiting, Caching & Freshness

### 11.1 Proxy Layer

* Nginx `limit_req` for per-client IP rate limiting (as in your current config).
* `proxy_cache` with separate TTLs:

  * 5–10 minutes for Locationforecast and Nowcast (aligned with MET docs and update cadence).([api.met.no][6])
  * 5–15 minutes for Airqualityforecast.
  * Longer TTL for static documentation endpoints if used.

### 11.2 MCP Layer

* Optional **per-session** or **per-API-key** limits:

  * e.g., 60 forecast requests / minute / key.
* When rate-limited, tools must:

  * Return `RATE_LIMITED` structured error.
  * Include `retryAfterSeconds` if known.

### 11.3 Freshness in Responses

* Expose:

  * `cached: boolean`
  * `ageSeconds: number`
  * `generatedAt: ISO timestamp`
* Allow clients to specify `minFreshSeconds` in tool inputs where strong freshness is needed (server may return error if cannot satisfy due to upstream or caching).

---

## 12. Observability & Diagnostics

### 12.1 Logging

* **Per request**:

  * `requestId` (global)
  * `sessionId` (from MCP transport where available)
  * Tool name
  * Input summary (sanitized)
  * Upstream URL (path only, no secrets)
  * `upstreamStatus`, latency, cache status
* **Log format**: structured JSON for easy indexing (e.g. `{"level": "info", "msg": "...", ...}`).

### 12.2 Metrics

* `mcp_tool_calls_total{tool_name, outcome}`
* `mcp_tool_latency_ms_bucket{tool_name}`
* `met_proxy_cache_status_total{status}` (HIT, MISS, STALE)
* Optionally export via Prometheus endpoint or logs.

### 12.3 Health Checks

* MCP-level `health` endpoint for HTTP transport:

  * Checks:

    * Server process alive
    * Can reach `metno-proxy` `/healthz`
  * No direct MCP tool; just HTTP health.

---

## 13. Security & Authentication

### 13.1 Transports

* **stdio**: assumed local / trusted; no auth.
* **Streamable HTTP**:

  * Support `none` and `api-key` auth modes initially.
  * API key via header, e.g. `X-Weather-MCP-Key`.
  * Optional future `jwt` mode (aligning with patterns used by tools like `fastmcp` and other frameworks).([GitHub][15])

### 13.2 Input Validation & Limits

* Strict `zod` validation + schema:

  * Bounds on `lat`, `lon`, `timeWindow` length, item counts.
* Put server-side hard caps (e.g., at most 200 hourly points returned per call) to avoid large payloads.

### 13.3 Privacy

* No personal identifiers stored beyond ephemeral logs.
* If clients pass location names that might include personal data, treat as ephemeral input only (no persistent storage).

---

## 14. Versioning & Compatibility

### 14.1 Protocol Version

* Server targets **MCP spec `2025-06-18`**.
* On `initialize`, advertise supported MCP version(s) following schema reference for protocol negotiation.([modelcontextprotocol.io][16])

### 14.2 API Versioning

* MCP server metadata:

  * `name: "vaer-metno"`
  * `version: "0.1.0"` (semantic versioning).
* **Breaking changes** (e.g., tool renames/removal) require major version bump.
* Prefer additive changes:

  * Add new optional fields/tools.
  * Avoid changing existing fields’ semantics.

---

## 15. Deployment & Configuration

### 15.1 Runtime Choices

* Language: **TypeScript** with `@modelcontextprotocol/sdk` + `zod`.([GitHub][4])
* Node.js: **Node 20+ LTS** (aligning with current MCP server templates).([GitHub][17])

### 15.2 Environment Configuration

* `METNO_PROXY_BASE_URL` (e.g. `http://metno-proxy:80`)
* `METNO_TIMEOUT_MS` (default e.g. 5000)
* `METNO_CONNECT_TIMEOUT_MS` (e.g. 1000–2000)
* `VAER_PORT` (for HTTP transport)
* `VAER_LOG_LEVEL`
* `WEATHER_MCP_RATE_LIMIT_*` (per-tool/per-user qps)
* `VAER_AUTH_MODE` (`none|api-key|jwt`)

### 15.3 Docker / K8s

* Deploy MCP server and `metno-proxy` in same network.
* MCP server only talks to public internet via `metno-proxy`.
* Optionally expose HTTP only internally and use stdio for local dev.

### 15.4 Places ETL Pipeline

The places database (`data/places.db`) is built via an offline ETL pipeline.

**Prerequisites:**

* Docker and Docker Compose
* Kartverket Stedsnavn PostGIS dump: `postgis/Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql` (619 MB)

**Pipeline (as-built):**

```bash
cd scripts/etl
docker compose -f docker-compose.etl.yml up
```

**ETL Steps:**

1. **PostGIS Staging** (`postgis-staging` service)
   * PostgreSQL 18 + PostGIS 3.6 (Debian-based for ARM64 support)
   * Loads Stedsnavn dump (~60 seconds for 619 MB)
   * Database: `stedsnavn_staging` with ~1.09M records

2. **Transformation** (`02_transform.py`)
   * Finds Stedsnavn schema dynamically
   * Joins `sted_posisjon`, `stedsnavn`, `skrivemate`, `kommune` tables
   * Filters to populated place types: by, tettsted, bygdelagBygd, bydel, tettbebyggelse, gard
   * Reprojects from EPSG:25833 (UTM Zone 33) to EPSG:4326 (WGS84)
   * Extracts 36,007 candidate records

3. **SQLite Export** (`03_export_sqlite.py`)
   * Creates `data/places.db` (6.09 MB)
   * Inserts 28,115 unique places
   * Creates FTS5 index with unicode61 tokenizer for Norwegian characters
   * Adds metadata table with build info

**Runtime:**

* Total ETL duration: ~2.3 seconds (after initial PostGIS load)
* Database is read-only at runtime
* Graceful degradation: if `places.db` missing, places tool not registered

---

## 16. Future Extensions (Potential v2 Features)

* Add **MetAlerts** support for weather alerts.([api.met.no][5])
* Add **Sunrise/Sunset** service and integrate into comfort scoring.([api.met.no][18])
* Extend **places** to support other Nordic countries (Sweden, Denmark via external gazetteers)
* Implement **sampling-based workflows** inside server (e.g., automatically choose whether to call Nowcast vs Locationforecast).([GitHub][4])
* Add **preferredPlaceClasses** and **preferredMunicipalityCode** filters to `places.resolve_name` for advanced filtering
* Separate places module into standalone MCP server if demand for non-weather use cases emerges

---

[1]: https://api.met.no/?utm_source=chatgpt.com "Welcome to the MET Weather API"
[2]: https://modelcontextprotocol.io/specification/2025-06-18?utm_source=chatgpt.com "Specification"
[3]: https://modelcontextprotocol.io/specification/2025-06-18/server?utm_source=chatgpt.com "Overview"
[4]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients"
[5]: https://api.met.no/weatherapi/documentation?utm_source=chatgpt.com "Interface documentation"
[6]: https://api.met.no/weatherapi/locationforecast/2.0/documentation?utm_source=chatgpt.com "Locationforecast"
[7]: https://api.met.no/weatherapi/nowcast/2.0/documentation?utm_source=chatgpt.com "Nowcast"
[8]: https://api.met.no/weatherapi/airqualityforecast/0.1/documentation?utm_source=chatgpt.com "Airqualityforecast"
[9]: https://docs.api.met.no/doc/locationforecast/datamodel.html?utm_source=chatgpt.com "Locationforecast data model"
[10]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools?utm_source=chatgpt.com "Tools"
[11]: https://modelcontextprotocol.io/specification/2025-06-18/server/resources?utm_source=chatgpt.com "Resources"
[12]: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts?utm_source=chatgpt.com "Prompts"
[13]: https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion?utm_source=chatgpt.com "Completion"
[14]: https://docs.api.met.no/doc/FAQ.html?utm_source=chatgpt.com "Frequently Asked Questions"
[15]: https://github.com/punkpeye/fastmcp?utm_source=chatgpt.com "punkpeye/fastmcp: A TypeScript framework for building ..."
[16]: https://modelcontextprotocol.io/specification/2025-06-18/schema?utm_source=chatgpt.com "Schema Reference"
[17]: https://github.com/alexanderop/mcp-server-starter-ts?utm_source=chatgpt.com "alexanderop/mcp-server-starter-ts: A minimal TypeScript ..."
[18]: https://api.met.no/changelog?utm_source=chatgpt.com "Changelog"
[19]: https://api.met.no/doc/locationforecast/FAQ?utm_source=chatgpt.com "Locationforecast FAQ"

# Vær Server - Future Roadmap

## Vision for v2 and Beyond

This document outlines planned features, enhancements, and potential extensions beyond the v1 production release. Features are organized by priority based on user value, implementation complexity, and alignment with the project's mission.

**v1 Baseline:**
- 8 tools (7 weather + 1 Norwegian places)
- 6 resources (4 weather + 2 places)
- 3 prompts (all with place name support)
- Production-ready with Docker deployment

---

## Priority Classification

- **P0 (High Priority)** - Natural next steps with clear user value and moderate complexity
- **P1 (Medium Priority)** - Useful enhancements, moderate to high complexity
- **P2 (Low Priority)** - Nice-to-have features, experimental, or requires significant resources

---

## High Priority (P0) - Target for v2.0

### 1. MetAlerts Integration (Weather Alerts)

**Motivation:**
Weather alerts are critical safety information that complements forecast data. Integration enables proactive warnings for severe weather.

**Scope:**
- **New Tool:** `weather.get_alerts`
- **Input:**
  - Location (lat/lon or Norwegian place name)
  - Optional severity filter (minor, moderate, severe, extreme)
  - Optional timeWindow
- **Output:**
  - Active alerts with severity, description, affected areas
  - Validity period (issued, onset, expiry)
  - Event type (wind, rain, snow, avalanche, etc.)
  - Instructions/recommendations
- **Source:** MET Norway MetAlerts 2.0 API
- **Coverage:** Norway
- **Format:** CAP-XML (Common Alerting Protocol)

**Integration Points:**
- Integrate into `assess_outdoor_activity_window`
  - Auto-warn if active alerts for location
  - Reduce comfort score during alert periods
  - Add alert count to assessment response
- Add to `plan_outdoor_event` prompt

**Implementation Notes:**
- API confirmed available: `metalerts/2.0`
- CAP-XML parser needed (or check for JSON alternative)
- Cache alerts for 5-10 minutes (they change infrequently)

**Acceptance Criteria:**
- ✅ Tool returns active alerts with severity
- ✅ Outdoor activity tool warns about alerts
- ✅ Alert descriptions include instructions
- ✅ Cache behavior prevents excessive API calls

**References:**
- API: https://api.met.no/weatherapi/metalerts/2.0/
- Original mention: DESIGN.md line 954

---

### 2. Sunrise/Sunset Service (Daylight Hours)

**Motivation:**
Daylight hours significantly affect outdoor activity comfort. Missing `darkness_ok` factor in v1 comfort scoring. Enables better recommendations for evening/winter activities.

**Scope:**
- **New Tool (Option A):** `weather.get_sun_events`
  - Input: location, date
  - Output: sunrise, sunset, solar noon, civil twilight, nautical twilight, golden hour
  - Source: MET Norway Sunrise 3.0 API
  - Coverage: World

- **Integration (Option B):** Extend existing tools
  - Add daylight info to location forecast response
  - Auto-compute for activity window timeframes

**Recommended Approach:** Option B (tighter integration)

**Integration Points:**
- Add `darkness_ok` boolean to ComfortScore
- `assess_outdoor_activity_window`:
  - Flag activities after sunset with safety warning
  - Reduce score for activities like "kids_playground" after dark
  - Boost score for stargazing/aurora activities after dark
- `plan_outdoor_event` prompt:
  - Display "daylight hours: 06:30-20:15" in planning output

**Implementation Notes:**
- API confirmed available: `sunrise/3.0`
- Simple JSON response, easy integration
- Cache for 24 hours (sunrise times change slowly)

**Acceptance Criteria:**
- ✅ Sunrise/sunset times computed for any location
- ✅ ComfortScore includes darkness factor
- ✅ Evening activities flagged appropriately
- ✅ Prompts display daylight hours

**References:**
- API: https://api.met.no/weatherapi/sunrise/3.0/
- Original mention: DESIGN.md line 955

---

### 3. API Key Authentication (HTTP Transport)

**Motivation:**
Enable controlled access for production HTTP transport deployments. Simple auth sufficient for most use cases (no complex OAuth needed).

**Scope:**
- Single auth mode: API key in `X-Weather-MCP-Key` header
- Simple validation in transport layer
- Environment variable or config file for key storage
- No complex JWT/OAuth (KISS principle)

**Implementation:**
1. Add `VAER_AUTH_MODE=api-key` config option
2. Add `VAER_API_KEY` environment variable (or path to key file)
3. Middleware in HTTP transport to validate header
4. Return `401 Unauthorized` for invalid/missing keys
5. Log authentication failures (structured logging)

**Security Considerations:**
- Keys should be strong random strings (32+ characters)
- Support key rotation (array of valid keys)
- Rate limit authentication failures
- No key logging (sanitize in logger)

**Acceptance Criteria:**
- ✅ Requests without key return 401
- ✅ Requests with invalid key return 401
- ✅ Requests with valid key proceed normally
- ✅ Auth can be disabled (backward compatible)

**References:**
- Original mention: IMPLEMENTATION_PLAN.md lines 1652-1655

---

### 4. Place Name Autocomplete (Completion Utilities)

**Motivation:**
Improve UX in MCP clients that support argument autocomplete (MCP 2025 spec feature). Users type "Ber" → suggest "Bergen", "Berga", "Berdal".

**Scope:**
- **New Completion:** `places.location_completions`
  - Input: Partial Norwegian place name (min 2 chars)
  - Output: Top 5-10 suggestions with confidence scores
  - Uses existing FTS5 fuzzy matching logic
  - Returns same Place format as `resolve_name`

- **Additional Completions:**
  - `activityType` suggestions (running, cycling, hiking, kids_playground, commuting)
  - `vesselType` suggestions (kayak, small_sailboat, motorboat, ship)
  - `language` suggestions (en, no, nb, nn, sv, da)

**Implementation:**
- Reuse PlacesDB FTS5 prefix search
- Order by confidence score (exact > fuzzy)
- Limit to 10 results (avoid overwhelming user)

**Integration with MCP Clients:**
- Clients query completion endpoint with partial input
- Dropdown shows suggestions as user types
- Selecting suggestion fills argument

**Acceptance Criteria:**
- ✅ Typing "Ber" suggests Bergen, Berga, Berdal
- ✅ Typing "Trom" suggests Tromsø, Troms, Tromsnes
- ✅ Activity/vessel type completions work
- ✅ Completions respect MCP spec format

**References:**
- MCP Spec: completion utilities
- Original mention: DESIGN.md lines 715-718

---

### 5. CORS Support (HTTP Transport)

**Motivation:**
Enable browser-based MCP clients to connect to HTTP transport. Required for web-based weather dashboards or integrations.

**Scope:**
- Add CORS headers to HTTP transport responses
- Configure allowed origins via `WEATHER_MCP_CORS_ORIGINS` env var
  - Example: `https://myapp.com,https://dashboard.example.com`
  - Support wildcard: `*` (use with caution)
- Support preflight `OPTIONS` requests
- Headers needed:
  - `Access-Control-Allow-Origin`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, X-Weather-MCP-Key`
  - `Access-Control-Max-Age: 86400`

**Implementation:**
- Express middleware for CORS headers
- Validate origin against whitelist
- Return 403 for disallowed origins

**Acceptance Criteria:**
- ✅ Browser requests from allowed origins succeed
- ✅ Preflight OPTIONS requests handled
- ✅ Disallowed origins return 403
- ✅ CORS can be disabled (default for v2)

**References:**
- Original mention: IMPLEMENTATION_PLAN.md lines 1657-1660

---

## Medium Priority (P1) - Target for v2.1+

### 6. Advanced Place Filtering

**Motivation:**
Disambiguate common place names. Example: "Vik" exists in Sogn og Fjordane, Hordaland, Buskerud. Users should be able to prioritize cities over farms.

**Scope:**
- Add `preferredPlaceClasses` to `places.resolve_name` input
  - Options: `["city", "town", "village", "hamlet", "farm"]`
  - Example: `["city", "town"]` excludes farms/villages
  - Boosts confidence scores for preferred classes

- Add `preferredMunicipalityCode` filter
  - Norwegian municipality codes (4 digits)
  - Example: `"4601"` for Bergen municipality
  - Only returns places in specified municipality
  - Use case: "Find Vik in Bergen municipality"

- Add `preferredCounty` filter
  - County names (Vestland, Viken, etc.)
  - Broader than municipality, narrower than nation

**Implementation:**
- Extend ResolveOptions schema
- Filter results post-query
- Adjust confidence scores (+0.1 for preferred class)

**Acceptance Criteria:**
- ✅ "Vik" with `preferredPlaceClasses: ["city"]` excludes farms
- ✅ "Vik" with `preferredMunicipalityCode: "4601"` only returns Bergen Vik
- ✅ Filtering reduces ambiguity
- ✅ Works with fuzzy search

**References:**
- Original mention: DESIGN.md line 958

---

### 7. Multi-Language Example Resources

**Motivation:**
Support Norwegian users in their native languages. Examples help users understand tool capabilities without reading English documentation.

**Scope:**
- Extend URI template: `weather://examples/{language}`
- Languages to support:
  - `no` (Norwegian Bokmål)
  - `nb` (Norwegian Bokmål, ISO standard)
  - `nn` (Norwegian Nynorsk)
  - `en` (English, already exists)

- Content to translate:
  - Tool descriptions
  - Example input values
  - Expected output summaries
  - Common use cases

**Implementation:**
- Create translation files: `src/resources/examples/`
  - `examples-en.ts`
  - `examples-no.ts`
  - `examples-nb.ts`
  - `examples-nn.ts`
- Dynamically load based on URI language parameter

**Acceptance Criteria:**
- ✅ `weather://examples/no` returns Norwegian Bokmål examples
- ✅ `weather://examples/nn` returns Norwegian Nynorsk examples
- ✅ All 8 tools have translated examples
- ✅ Fallback to English if language not supported

**References:**
- Original mention: IMPLEMENTATION_PLAN.md line 866

---

### 8. Sampling-Based Workflows (Smart Tool Selection)

**Motivation:**
Reduce client complexity by having server intelligently choose best data source. Example: Auto-select Nowcast (more accurate) for next 2 hours, Locationforecast for 2+ hours.

**Scope:**
- **New Tool:** `weather.get_smart_forecast`
  - Input: location, timeWindow
  - Logic:
    - If timeWindow ≤ 2h AND location in Nordic → call Nowcast
    - Otherwise → call Locationforecast
    - Merge results seamlessly
  - Output: Same format as location forecast
  - Transparent to client

- **Benefits:**
  - Client doesn't need to know about API coverage limitations
  - Better accuracy for short-term forecasts (Nowcast)
  - Fallback to global forecast for out-of-coverage

**Alternative Approach:**
- Enhance existing `get_location_forecast` with auto-sampling
- Add `preferHighAccuracy: boolean` flag
- Server decides internally whether to supplement with Nowcast

**Recommended:** New tool (clearer separation, easier testing)

**Acceptance Criteria:**
- ✅ Smart forecast auto-selects Nowcast for Nordic 2h window
- ✅ Falls back to Locationforecast for global or 2h+ window
- ✅ Output format matches location forecast
- ✅ Cache behavior preserved

**References:**
- Original mention: DESIGN.md line 957

---

### 9. Debug Tool (Advanced Users)

**Motivation:**
Advanced users and developers need to inspect raw API responses for debugging, research, or custom integrations.

**Scope:**
- **New Tool:** `weather.debug_raw_met_response`
  - Input: endpoint (locationforecast, nowcast, etc.), location, parameters
  - Output: Truncated raw JSON/XML from upstream API
  - Flagged as debug-only via MCP metadata
  - Not shown in normal LLM tool lists

**Implementation:**
- Bypass normal transformation pipeline
- Return raw response body (limit to 10KB to avoid overflow)
- Include response headers (X-Proxy-Cache, Age, Content-Type)
- Log debug tool usage

**Security Considerations:**
- Don't expose sensitive headers (API keys if any)
- Rate limit debug tool (1 call/minute per client)

**Acceptance Criteria:**
- ✅ Returns raw MET API response
- ✅ Truncates to 10KB
- ✅ Includes cache headers
- ✅ Marked as debug in MCP metadata

**References:**
- Original mention: DESIGN.md lines 502-506

---

## Low Priority (P2) - Experimental / Research

### 10. Standalone Places MCP Server

**Motivation:**
If non-weather use cases emerge (navigation apps, logistics, travel planning), extract places module into independent MCP server.

**Scope:**
- Create new project: `norway-places-mcp`
- Extract `src/places/` module
- Standalone MCP server with:
  - Tool: `places.resolve_name`
  - Resources: `places://license/ssr`, `places://gazetteer/info`
  - Independent deployment
- Vær can:
  - **Option A:** Depend on places MCP as npm package
  - **Option B:** Call places MCP via MCP protocol (server-to-server)

**When to Do This:**
- **Condition:** External demand confirmed (non-weather use cases)
- **Not needed** for v2 or v3 unless demand emerges

**Benefits:**
- Reusable gazetteer service
- Separate release cycles
- Lighter weather MCP server

**Drawbacks:**
- Additional deployment complexity
- Network hop (if Option B)

**Acceptance Criteria:**
- ✅ Standalone places MCP server works independently
- ✅ Vær can integrate via chosen option
- ✅ No functionality lost
- ✅ Documentation updated

**References:**
- Original mention: DESIGN.md line 959

---

### 11. Extended MET API Catalog

**Motivation:**
MET Norway offers 20+ APIs; v1 integrates only 5. Expand coverage based on user demand.

**Available APIs (Not Yet Integrated):**

#### 11.1 Aviation Forecasts
- **API:** `aviationforecast/1.6`
- **Format:** METAR/TAF
- **Use Case:** Flight planning, drone operations, aviation safety
- **Coverage:** Nordic airports
- **Complexity:** Medium (text parsing METAR/TAF format)

#### 11.2 Extreme Weather Probabilities
- **API:** `extremesforecast/1.0`
- **Use Case:** Infrastructure risk assessment, emergency planning
- **Coverage:** Norway
- **Complexity:** Low (JSON, similar to location forecast)

#### 11.3 Satellite Imagery & Radar
- **APIs:** `geosatellite/1.4`, `radar/2.0`, `seaicesatellite/1.0`, `icemap/2.0`
- **Format:** Image/raster data
- **Use Case:** Visual weather analysis, sea ice navigation, storm tracking
- **Coverage:** Various (Nordic, Polar regions)
- **Complexity:** High (image processing, not MCP tool-friendly)
- **Note:** Better suited for web dashboard integration, not LLM tools

#### 11.4 Enhanced Ocean Forecasts
- **API:** `oceanforecast/2.0`
- **Use Case:** Comprehensive ocean model (superior to current gribfiles integration)
- **Coverage:** Nordic seas
- **Complexity:** Low (JSON)
- **Note:** Could replace current `get_marine_conditions` tool

#### 11.5 Lightning Data
- **API:** `lightning/1.0`
- **Use Case:** Outdoor safety, storm tracking, event planning
- **Coverage:** Nordic
- **Complexity:** Low (point data)

#### 11.6 Specialized APIs
- `probabilityforecast/1.0` - Probability distributions for temperature/precipitation
- `verticalprofile/1.0` - Atmospheric vertical profiles (meteorology research)
- `textforecast/2.0` - Human-written regional forecasts (Norwegian text)
- `sigcharts/2.0` - Significant weather charts (aviation)

**Prioritization Strategy:**
1. Conduct user survey to identify demand
2. Prioritize by:
   - User requests
   - Ease of integration (JSON > text > binary)
   - Overlap with existing tools (avoid duplication)
   - API stability and documentation quality

**Acceptance Criteria (per API):**
- ✅ Tool follows v1 patterns (schemas, coverage, attribution)
- ✅ Integration tests pass
- ✅ Documentation updated
- ✅ Cache behavior appropriate

**References:**
- API Catalog: api/apis.json (20+ APIs listed)

---

### 12. Historical Weather Analysis

**Motivation:**
Enable long-term trend analysis, climatology research, agricultural planning.

**Scope:**
- Extend Frost API access beyond "recent observations" (v1 limit: 7 days)
- New Tool: `weather.get_historical_data`
  - Input: location, time range (up to 10 years)
  - Output: Daily/monthly aggregates (avg temp, total precip, etc.)
  - Source: Frost API historical endpoints
- Aggregation: Server-side (reduce response size)

**Challenges:**
- Large data volumes (years of observations)
- Slow queries (Frost API can be slow for large ranges)
- Need pagination or chunking
- Cache TTL unclear (historical data doesn't change)

**Alternative:**
- Point users to MET Norway's official climate data portal
- Document how to use Frost API directly for research

**Acceptance Criteria:**
- ✅ Retrieve 10 years of temperature data
- ✅ Aggregation to monthly/yearly
- ✅ Query completes in < 30 seconds
- ✅ Cache historical data effectively

---

## Version Numbering & Breaking Changes

### Semantic Versioning

- **Major (v2.0):** Breaking changes
  - Tool/resource/prompt renames or removals
  - Schema changes that break existing clients
  - Transport protocol changes

- **Minor (v2.1):** Additive changes
  - New tools/resources/prompts
  - New optional fields in existing schemas
  - Performance improvements
  - Non-breaking enhancements

- **Patch (v2.1.1):** Bug fixes
  - Bug fixes
  - Documentation updates
  - Internal refactoring
  - Security patches

### Deprecation Policy

- Features marked for deprecation:
  - Warning logs added 1 minor version before removal
  - Documented in CHANGELOG
  - Removed in next major version
- Example:
  - v2.1: Tool X marked deprecated (warning logged)
  - v2.2: Tool X still works (warning continues)
  - v3.0: Tool X removed

### No Current Deprecations

All v1 tools/resources/prompts are stable. No breaking changes planned for v2.0.

---

## Contribution Priorities

If contributing to this project, prioritize in this order:

1. **Bug Fixes** - Always welcome
2. **P0 Features** - High user value, clear next steps
3. **Documentation** - Improve guides, examples, troubleshooting
4. **Performance** - Optimize existing features
5. **P1 Features** - Medium priority enhancements
6. **P2 Features** - Experimental, requires discussion first

### Before Contributing a New Feature

1. Check this roadmap for priority
2. Open GitHub issue to discuss scope
3. Get maintainer approval
4. Follow v1 patterns (DRY, KISS, SoC, Readability)
5. Include tests (unit + integration)
6. Update documentation

---

## Feedback & Feature Requests

**To request a feature or vote on priorities:**
- Open GitHub issue with label `enhancement`
- Describe use case and user value
- Provide examples if applicable
- Maintainers will triage and assign priority

**To discuss roadmap:**
- GitHub Discussions (preferred for open dialogue)
- Tag maintainers for visibility

---

## Appendix: API Availability Reference

All future features reference MET Norway APIs. Confirm availability before implementation:

- **MetAlerts 2.0:** ✅ Available (confirmed in apis.json)
- **Sunrise 3.0:** ✅ Available (confirmed in apis.json)
- **AviationForecast 1.6:** ✅ Available
- **ExtremesForecast 1.0:** ✅ Available
- **OceanForecast 2.0:** ✅ Available
- **Lightning 1.0:** ✅ Available
- **Radar 2.0:** ✅ Available
- **GeoSatellite 1.4:** ✅ Available

See `api/apis.json` for full catalog and endpoint details.

---

## References

- **v1 Implementation History:** [history.md](history.md)
- **Design Specification:** [design.md](design.md)
- **API Catalog:** [api/apis.json](../api/apis.json)
- **MCP Specification:** https://modelcontextprotocol.io/docs
- **MET Norway API Docs:** https://api.met.no/doc

---

*This roadmap is a living document. Priorities may shift based on user feedback, API availability, and project resources. Last updated: 2025-11-27*

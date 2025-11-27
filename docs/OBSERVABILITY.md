# Observability Guide

This guide shows how to test and observe the metrics and logging features.

## Quick Start

### 1. Start the HTTP Server

```bash
# Terminal 1: Start the server
METNO_PROXY_BASE_URL=http://localhost:8080 \
VAER_PORT=3100 \
VAER_LOG_LEVEL=debug \
node dist/index.js
```

The server will log to stderr in structured JSON format.

### 2. View Metrics (Empty State)

```bash
# Terminal 2: Check initial metrics
curl -s http://localhost:3100/metrics
```

You should see Prometheus format output with empty counters:
```
# HELP mcp_tool_calls_total Total number of MCP tool calls by tool name and outcome
# TYPE mcp_tool_calls_total counter

# HELP mcp_tool_latency_ms_avg Average latency of MCP tool calls in milliseconds
# TYPE mcp_tool_latency_ms_avg gauge

# HELP met_proxy_cache_status_total Cache status from MET Norway proxy
# TYPE met_proxy_cache_status_total counter

# HELP met_proxy_cache_hit_ratio Ratio of cache hits to total requests
# TYPE met_proxy_cache_hit_ratio gauge
met_proxy_cache_hit_ratio 0.0000
```

### 3. Make Some Tool Calls

#### Using MCP Inspector (Recommended)

```bash
# Terminal 3: Start MCP Inspector
METNO_PROXY_BASE_URL=http://localhost:8080 \
npx @modelcontextprotocol/inspector node dist/index.js
```

Then:
1. Open the Inspector UI in your browser
2. Connect to the server
3. Call some tools:
   - `weather.get_location_forecast` for Oslo (59.911491, 10.757933)
   - `places.resolve_name` for "Bergen"
   - `weather.get_air_quality` for Oslo

#### Using Direct HTTP Calls

**Note**: MCP over HTTP requires specific Accept headers for protocol negotiation.

```bash
# Example: Call location forecast tool
curl -s -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "weather.get_location_forecast",
      "arguments": {
        "location": {"latitude": 59.911491, "longitude": 10.757933},
        "resolution": "hourly",
        "hours": 6
      }
    },
    "id": 1
  }' | jq .

# Example: Resolve a Norwegian place name
curl -s -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "places.resolve_name",
      "arguments": {
        "query": "Bergen"
      }
    },
    "id": 2
  }' | jq .
```

### 4. Observe the Logs

Look at Terminal 1 where the server is running. You'll see structured JSON logs like:

```json
{"timestamp":"2025-11-27T05:30:15.123Z","level":"info","message":"Tool call started","context":{"requestId":"a1b2c3d4-...","toolName":"weather.get_location_forecast","inputSummary":{"location":{"latitude":59.911491,"longitude":10.757933},"resolution":"hourly"}}}

{"timestamp":"2025-11-27T05:30:15.234Z","level":"debug","message":"Upstream API call","context":{"requestId":"a1b2c3d4-...","upstreamUrl":"http://localhost:8080/weatherapi/locationforecast/2.0/compact","upstreamStatus":200,"latencyMs":98,"cacheStatus":"MISS"}}

{"timestamp":"2025-11-27T05:30:15.250Z","level":"info","message":"Tool call completed","context":{"requestId":"a1b2c3d4-...","toolName":"weather.get_location_forecast","latencyMs":127,"outcome":"success"}}
```

**Key Log Fields**:
- `requestId` - Unique ID for correlation across logs
- `toolName` - Which tool was called
- `inputSummary` - Sanitized input (no sensitive data)
- `upstreamUrl` - API endpoint called
- `upstreamStatus` - HTTP status code
- `latencyMs` - Duration in milliseconds
- `cacheStatus` - HIT/MISS/EXPIRED
- `outcome` - success/error

### 5. View Metrics (After Tool Calls)

```bash
# Check metrics again
curl -s http://localhost:3100/metrics
```

Now you should see populated metrics:

```
# HELP mcp_tool_calls_total Total number of MCP tool calls by tool name and outcome
# TYPE mcp_tool_calls_total counter
mcp_tool_calls_total{tool_name="weather.get_location_forecast",outcome="success"} 1
mcp_tool_calls_total{tool_name="places.resolve_name",outcome="success"} 1

# HELP mcp_tool_latency_ms_avg Average latency of MCP tool calls in milliseconds
# TYPE mcp_tool_latency_ms_avg gauge
mcp_tool_latency_ms_avg{tool_name="weather.get_location_forecast"} 127.00
mcp_tool_latency_ms_avg{tool_name="places.resolve_name"} 8.50

# HELP mcp_tool_latency_ms_count Total number of latency measurements
# TYPE mcp_tool_latency_ms_count counter
mcp_tool_latency_ms_count{tool_name="weather.get_location_forecast"} 1
mcp_tool_latency_ms_count{tool_name="places.resolve_name"} 1

# HELP met_proxy_cache_status_total Cache status from MET Norway proxy
# TYPE met_proxy_cache_status_total counter
met_proxy_cache_status_total{status="MISS"} 1

# HELP met_proxy_cache_hit_ratio Ratio of cache hits to total requests
# TYPE met_proxy_cache_hit_ratio gauge
met_proxy_cache_hit_ratio 0.0000
```

### 6. Watch Metrics in Real-Time

```bash
# Continuously poll metrics (update every 2 seconds)
watch -n 2 'curl -s http://localhost:3100/metrics | grep -E "(mcp_tool_calls_total|mcp_tool_latency|cache)"'
```

## Advanced Usage

### JSON Log Analysis

Filter logs by tool name:
```bash
# Save logs to file
node dist/index.js 2> server.log

# Filter by tool name
cat server.log | jq 'select(.context.toolName == "weather.get_location_forecast")'

# Find slow requests (> 1000ms)
cat server.log | jq 'select(.context.latencyMs > 1000)'

# Group by outcome
cat server.log | jq 'select(.message == "Tool call completed") | .context.outcome' | sort | uniq -c
```

### Visualizing Cache Hit Ratio

```bash
# Calculate cache hit ratio from logs
cat server.log | \
  jq -r 'select(.context.cacheStatus) | .context.cacheStatus' | \
  awk '{cache[$1]++} END {for (status in cache) print status": "cache[status]}'
```

### Prometheus Integration (Future)

The `/metrics` endpoint is compatible with Prometheus scraping. To integrate:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'vaer'
    static_configs:
      - targets: ['localhost:3100']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

Then query in Prometheus:
```promql
# Tool call rate
rate(mcp_tool_calls_total[5m])

# Average latency by tool
mcp_tool_latency_ms_avg

# Cache hit ratio
met_proxy_cache_hit_ratio
```

## Metrics Reference

### Tool Call Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `mcp_tool_calls_total` | counter | Total number of tool calls | `tool_name`, `outcome` |
| `mcp_tool_latency_ms_avg` | gauge | Average latency in ms | `tool_name` |
| `mcp_tool_latency_ms_count` | counter | Number of latency measurements | `tool_name` |

### Cache Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `met_proxy_cache_status_total` | counter | Cache status counts | `status` (HIT/MISS/EXPIRED) |
| `met_proxy_cache_hit_ratio` | gauge | Ratio of cache hits (0.0-1.0) | none |

### Log Event Types

| Event | Level | When | Key Fields |
|-------|-------|------|------------|
| Tool call started | info | Tool invoked | `requestId`, `toolName`, `inputSummary` |
| Tool call completed | info | Tool finished | `requestId`, `toolName`, `latencyMs`, `outcome` |
| Upstream API call | debug | Proxy request | `requestId`, `upstreamUrl`, `upstreamStatus`, `cacheStatus`, `latencyMs` |

## Troubleshooting

### No metrics appearing

1. Make sure you're calling tools via the MCP protocol (not just hitting health/metrics endpoints)
2. Check that the server started successfully
3. Verify tool calls are completing (check logs)

### Missing requestId in logs

- RequestId is only added to tool calls wrapped with `wrapTool()`
- Server startup logs won't have requestId (expected)

### Cache status always showing MISS

- First call to any endpoint will be MISS
- Wait 10 minutes and call again to see HIT
- Make sure metno-proxy is running and caching

### Logs not appearing

- Logs go to stderr (not stdout)
- Try: `node dist/index.js 2>&1 | tee server.log`
- Check log level: `VAER_LOG_LEVEL=debug`

## Example Testing Session

```bash
# 1. Start server with debug logging
METNO_PROXY_BASE_URL=http://localhost:8080 \
VAER_PORT=3100 \
VAER_LOG_LEVEL=debug \
node dist/index.js 2>&1 | tee server.log &

# 2. Check health
curl -s http://localhost:3100/health | jq .

# 3. Check empty metrics
curl -s http://localhost:3100/metrics | head -20

# 4. Make some tool calls
curl -s -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"places.resolve_name","arguments":{"query":"Oslo"}},"id":1}' \
  | jq '.result.content[0].text'

# 5. View metrics with data
curl -s http://localhost:3100/metrics

# 6. Analyze logs
cat server.log | jq 'select(.message == "Tool call completed") | {tool: .context.toolName, latency: .context.latencyMs, outcome: .context.outcome}'

# 7. Cleanup
pkill -f "node dist/index.js"
```

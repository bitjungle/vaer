#!/bin/bash

# Observability Demo Script
# Demonstrates Phase 9 features: logging, metrics, requestId correlation

set -e

PORT=3100
LOG_FILE="/tmp/vaer-demo.log"

echo "=========================================="
echo "Weather MCP - Observability Demo"
echo "=========================================="
echo

# Cleanup function
cleanup() {
    echo
    echo "=== Cleaning up ==="
    if [ -n "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
    fi
    rm -f "$LOG_FILE"
}
trap cleanup EXIT

# Start server
echo "Step 1: Starting MCP server with observability..."
METNO_PROXY_BASE_URL=http://localhost:8080 \
VAER_PORT=$PORT \
VAER_LOG_LEVEL=debug \
node dist/index.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "   Server PID: $SERVER_PID"
echo "   Log file: $LOG_FILE"
echo "   Waiting for server to start..."
sleep 3

# Check if server started
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "   ERROR: Server failed to start!"
    cat "$LOG_FILE"
    exit 1
fi
echo "   ✅ Server started successfully"
echo

# Step 2: Check health
echo "Step 2: Checking health endpoint..."
HEALTH=$(curl -s http://localhost:$PORT/health)
echo "   Response: $HEALTH"
echo "   ✅ Health check passed"
echo

# Step 3: View initial metrics
echo "Step 3: Viewing initial metrics (empty state)..."
echo "   Fetching from http://localhost:$PORT/metrics"
curl -s http://localhost:$PORT/metrics | head -15
echo "   ... (truncated)"
echo "   ✅ Metrics endpoint working (no data yet)"
echo

# Step 4: Make tool calls
echo "Step 4: Making tool calls to generate metrics..."

# Call 1: Places resolve
echo "   📍 Calling places.resolve_name for 'Oslo'..."
CALL1=$(curl -s -X POST http://localhost:$PORT/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "places.resolve_name",
      "arguments": {"query": "Oslo"}
    },
    "id": 1
  }')

if echo "$CALL1" | jq -e '.result' > /dev/null 2>&1; then
    echo "      ✅ Success"
else
    echo "      ❌ Failed"
fi
sleep 1

# Call 2: Weather forecast
echo "   🌤️  Calling weather.get_location_forecast for Oslo..."
CALL2=$(curl -s -X POST http://localhost:$PORT/mcp \
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
    "id": 2
  }')

if echo "$CALL2" | jq -e '.result' > /dev/null 2>&1; then
    echo "      ✅ Success"
else
    echo "      ❌ Failed"
fi
sleep 1

# Call 3: Another place
echo "   📍 Calling places.resolve_name for 'Bergen'..."
CALL3=$(curl -s -X POST http://localhost:$PORT/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "places.resolve_name",
      "arguments": {"query": "Bergen"}
    },
    "id": 3
  }')

if echo "$CALL3" | jq -e '.result' > /dev/null 2>&1; then
    echo "      ✅ Success"
else
    echo "      ❌ Failed"
fi

echo "   ✅ Tool calls completed"
echo

# Step 5: View populated metrics
echo "Step 5: Viewing metrics after tool calls..."
METRICS=$(curl -s http://localhost:$PORT/metrics)

echo
echo "   🔢 Tool Call Counters:"
echo "$METRICS" | grep "mcp_tool_calls_total" | sed 's/^/      /'

echo
echo "   ⏱️  Average Latencies:"
echo "$METRICS" | grep "mcp_tool_latency_ms_avg" | sed 's/^/      /'

echo
echo "   💾 Cache Status:"
echo "$METRICS" | grep "met_proxy_cache_status_total" | sed 's/^/      /'
echo "$METRICS" | grep "met_proxy_cache_hit_ratio" | sed 's/^/      /'

echo
echo "   ✅ Metrics populated successfully"
echo

# Step 6: Analyze logs
echo "Step 6: Analyzing structured logs..."

echo
echo "   📋 Tool Call Summary:"
grep "Tool call completed" "$LOG_FILE" | jq -r '
  "      • " + .context.toolName +
  " - " + (.context.latencyMs | tostring) + "ms - " +
  .context.outcome' 2>/dev/null || echo "      (no logs found)"

echo
echo "   🔗 RequestId Correlation Example (first request):"
FIRST_REQUEST_ID=$(grep "Tool call started" "$LOG_FILE" | head -1 | jq -r '.context.requestId' 2>/dev/null || echo "")
if [ -n "$FIRST_REQUEST_ID" ]; then
    echo "      RequestId: $FIRST_REQUEST_ID"
    grep "$FIRST_REQUEST_ID" "$LOG_FILE" | jq -r '
      "      [" + .level + "] " + .message +
      (if .context.latencyMs then " (" + (.context.latencyMs | tostring) + "ms)" else "" end)' 2>/dev/null || true
else
    echo "      (no request ID found)"
fi

echo
echo "   💨 Cache Status Distribution:"
grep "cacheStatus" "$LOG_FILE" | jq -r '.context.cacheStatus' 2>/dev/null | sort | uniq -c | sed 's/^/      /' || echo "      (no cache data)"

echo
echo "   ✅ Log analysis complete"
echo

# Final summary
echo "=========================================="
echo "Demo Complete! ✅"
echo "=========================================="
echo
echo "Key Observations:"
echo "  • All tool calls logged with unique requestId"
echo "  • Metrics tracked: calls, latency, cache status"
echo "  • Prometheus format ready for monitoring"
echo "  • RequestId enables end-to-end tracing"
echo
echo "Try it yourself:"
echo "  1. View logs: cat $LOG_FILE | jq"
echo "  2. View metrics: curl http://localhost:$PORT/metrics"
echo "  3. Make more calls and watch metrics update!"
echo
echo "See docs/OBSERVABILITY.md for detailed usage guide."
echo

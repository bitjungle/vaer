#!/bin/bash

# Comprehensive test for Phase 9 observability features

set -e

PORT=3100

echo "=== Starting MCP server on port $PORT ==="
METNO_PROXY_BASE_URL=http://localhost:8080 VAER_PORT=$PORT node dist/index.js > /tmp/server-output.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo
echo "=== Test 1: Health endpoint ==="
curl -s http://localhost:$PORT/health | jq .
echo

echo
echo "=== Test 2: Initial metrics (should be empty) ==="
curl -s http://localhost:$PORT/metrics | grep -E "(mcp_tool|met_proxy)"
echo

echo
echo "=== Test 3: Call weather.get_location_forecast tool ==="
CALL_RESPONSE=$(curl -s -X POST http://localhost:$PORT/mcp \
  -H 'Content-Type: application/json' \
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
  }')

echo "Response status: $(echo "$CALL_RESPONSE" | jq -r 'if .result then "SUCCESS" else "ERROR" end')"
echo "Has structured content: $(echo "$CALL_RESPONSE" | jq -r 'if .result.structuredContent then "YES" else "NO" end')"
echo

echo
echo "=== Test 4: Metrics after tool call ==="
echo "Tool call metrics:"
curl -s http://localhost:$PORT/metrics | grep "mcp_tool_calls_total"
echo
echo "Latency metrics:"
curl -s http://localhost:$PORT/metrics | grep "mcp_tool_latency"
echo
echo "Cache metrics:"
curl -s http://localhost:$PORT/metrics | grep "met_proxy_cache"
echo

echo
echo "=== Test 5: Server logs (last 20 lines) ==="
echo "Looking for: Tool call started, Tool call completed, Upstream API call"
tail -20 /tmp/server-output.log | jq -r 'select(.message | test("Tool call|Upstream|completed")) | "\(.level | ascii_upcase): \(.message) - requestId: \(.context.requestId // "N/A")"' 2>/dev/null || echo "No matching logs found"
echo

echo
echo "=== Cleanup ==="
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
rm -f /tmp/server-output.log

echo
echo "=== All tests complete! ==="

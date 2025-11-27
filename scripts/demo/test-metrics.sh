#!/bin/bash

# Test script for Phase 9 observability features

set -e

PORT=3100

echo "Starting server..."
METNO_PROXY_BASE_URL=http://localhost:8080 VAER_PORT=$PORT node dist/index.js &
SERVER_PID=$!

# Wait for server to start
sleep 2

echo "=== Testing health endpoint ==="
curl -s http://localhost:$PORT/health
echo
echo

echo "=== Testing initial metrics endpoint ==="
curl -s http://localhost:$PORT/metrics | head -20
echo
echo

echo "=== Making a test tool call (tools/list) ==="
RESPONSE=$(curl -s -X POST http://localhost:$PORT/mcp \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }')

TOOL_COUNT=$(echo "$RESPONSE" | jq -r '.result.tools | length')
echo "Tool count: $TOOL_COUNT"
echo

echo "=== Checking metrics after tool call ==="
curl -s http://localhost:$PORT/metrics
echo
echo

echo "=== Cleaning up ==="
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo "=== Test complete ==="

# MCP Client Configuration Examples

This directory contains example configurations for connecting various MCP clients to the Vær server.

## Prerequisites

1. **Running metno-proxy**: The proxy must be running before starting the MCP server.
   ```bash
   # Option A: Run proxy standalone
   cd /path/to/vaer
   make run

   # Option B: Run full stack with docker-compose
   make up
   ```

2. **Built Vær Server**: Build the TypeScript code.
   ```bash
   npm install
   npm run build
   ```

3. **(Optional) Frost API Credentials**: Get from https://frost.met.no/auth/requestCredentials.html for weather observations.

4. **Places Database**: Included in the repository (`data/places.db`). No setup required.
   - For Docker deployments, the database is baked into the image during build.
   - Developers who need to regenerate it can see [ETL Pipeline](../../docs/etl-pipeline.md).

## Configuration Files

### `claude-desktop.json`
Configuration for Claude Desktop app (stdio transport via local Node.js).

**Setup:**
1. Edit `claude-desktop.json` and update `/path/to/vaer` with your actual path
2. Copy to Claude Desktop config location:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`
3. Restart Claude Desktop

**Usage in Claude Desktop:**
- Ask: "What's the weather forecast for Oslo, Norway?"
- Ask: "Is it safe to go sailing in Stavanger tomorrow?"
- Ask: "When is the best time for outdoor activities in Bergen this week?"

### `claude-desktop-docker.json`
Configuration for Claude Desktop app using Docker containers.

**Setup:**
1. Start the full stack: `make up`
2. Build the vaer image if not already built: `docker compose build vaer`
3. Copy to Claude Desktop config location (see above)
4. Restart Claude Desktop

**Advantages:**
- No need to install Node.js locally
- Isolated environment
- Easier dependency management

**Note**: The MCP server connects to metno-proxy via Docker's internal network.

### `vscode-continue.json`
Configuration for VS Code with the Continue extension.

**Setup:**
1. Install Continue extension in VS Code
2. Edit `vscode-continue.json` and update `/path/to/vaer`
3. Copy contents to Continue settings:
   - Open VS Code Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
   - Search for "Continue: Open config.json"
   - Merge the `mcpServers` section
4. Reload VS Code window

**Usage in Continue:**
- In chat: "What's the current weather in Trondheim?"
- In chat: "Check marine conditions for a boat trip from Oslo to Drøbak"

## Environment Variables

All configurations support these environment variables:

### Required
- **`METNO_PROXY_BASE_URL`**: URL to the metno-proxy
  - Local development: `http://localhost:8080`
  - Docker network: `http://metno-proxy:80`

### Optional
- **`FROST_CLIENT_ID`**: Frost API client ID for weather observations
- **`METNO_TIMEOUT_MS`**: HTTP timeout to proxy (default: 5000ms)
- **`VAER_LOG_LEVEL`**: Logging level: `info`, `debug`, `warn` (default: `info`)

### HTTP Transport (Not typically used with MCP clients)
- **`VAER_PORT`**: Enable HTTP transport on specified port (e.g., 3000)
- **`VAER_AUTH_MODE`**: Authentication mode: `none`, `api-key`, `jwt`
- **`VAER_API_KEY`**: API key if `api-key` auth is enabled

## Testing Your Configuration

### Test Proxy Connection
```bash
# Health check
curl http://localhost:8080/healthz

# Sample forecast request
curl "http://localhost:8080/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75"
```

### Test MCP Server (Command Line)
```bash
# Start server manually
METNO_PROXY_BASE_URL=http://localhost:8080 node dist/index.js

# Test with MCP Inspector
METNO_PROXY_BASE_URL=http://localhost:8080 npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### "Unable to reach MET Weather API"
- Ensure metno-proxy is running: `make test-health`
- Check `METNO_PROXY_BASE_URL` is correct
- Verify network connectivity

### "PlacesDB not available"
- This is a warning, not an error
- The server works without places.db, but place name resolution is disabled
- places.db is included in the repository and baked into Docker images
- If missing: `git pull origin main` to get the latest code

### "METNO_PROXY_BASE_URL environment variable is required"
- Set the environment variable in your client config
- Check that the MCP client is passing env vars correctly

### Docker Network Issues
- Ensure containers are on the same network: `docker network ls`
- Check docker-compose network name: `vaer_vaer-network`
- Use internal Docker hostnames: `metno-proxy` not `localhost`

## Advanced Configurations

### Custom User-Agent for metno-proxy
When rebuilding metno-proxy, override the User-Agent:
```bash
make build USER_AGENT="your-service/1.0 your@email.com"
```

### Multiple MCP Servers
You can run multiple instances of vaer (e.g., dev/prod):
```json
{
  "mcpServers": {
    "vaer-dev": {
      "command": "node",
      "args": ["/path/to/dev/vaer/dist/index.js"],
      "env": {
        "METNO_PROXY_BASE_URL": "http://localhost:8080"
      }
    },
    "vaer-prod": {
      "command": "node",
      "args": ["/path/to/prod/vaer/dist/index.js"],
      "env": {
        "METNO_PROXY_BASE_URL": "https://prod-proxy.example.com"
      }
    }
  }
}
```

## See Also

- [Main README](../../README.md) — Project overview and architecture
- [Getting Started](../../docs/getting-started.md) — Production deployment guide
- [API Documentation](../../docs/design.md) — Tool schemas and API details
- [MCP Specification](https://modelcontextprotocol.io/docs) — Official MCP docs

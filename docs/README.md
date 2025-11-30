# VÆR Documentation

Welcome to the VÆR documentation. Choose a guide based on what you want to do:

---

## Quick Links

| Guide | Audience | Description |
|-------|----------|-------------|
| [Getting Started](getting-started.md) | Deployers | Deploy VÆR with Docker Compose |
| [Development](development.md) | Developers | Local setup, testing, contributing |
| [Design](design.md) | Architects | Architecture, API schemas, tool specs |

---

## All Documentation

### Deployment & Operations

- **[Getting Started](getting-started.md)** — Quick deployment guide for operators
- **[Docker on Linux](docker-linux.md)** — Installing Docker CE on Ubuntu/Debian servers
- **[Metno Proxy](metno-proxy.md)** — Nginx reverse proxy configuration for MET Norway API
- **[Observability](observability.md)** — Metrics, logging, and debugging

### Development

- **[Development](development.md)** — Local development setup, testing, contributing
- **[ETL Pipeline](etl-pipeline.md)** — Regenerating the places database (developer-only)
- **[Design](design.md)** — Architecture, MCP tools, schemas, error handling

### Project

- **[History](history.md)** — Implementation history and architectural decisions
- **[Roadmap](roadmap.md)** — Future features and planned improvements

---

## Quick Start

### For Deployers

```bash
git clone https://github.com/bitjungle/vaer.git
cd vaer
make compose-build && make up
curl http://localhost:3000/health
```

See [Getting Started](getting-started.md) for details.

### For Developers

```bash
git clone https://github.com/bitjungle/vaer.git
cd vaer
npm install
npm run build
METNO_PROXY_BASE_URL=http://localhost:8080 npm run dev
```

See [Development](development.md) for details.

---

## External Resources

- [MET Norway API Documentation](https://api.met.no/)
- [MCP Specification](https://modelcontextprotocol.io/)
- [Kartverket Stedsnavn](https://www.kartverket.no/api-og-data/api-og-dataoversikt/sentral-felles-kartdatabase)

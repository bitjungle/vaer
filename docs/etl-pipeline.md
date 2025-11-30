# Places Database ETL Pipeline

> **Note for deployers**: You don't need to run this pipeline. The `data/places.db` database is included in the repository and will be available after `git clone`. This guide is for **developers** who want to regenerate the database from Kartverket source data.

---

## Overview

The ETL (Extract-Transform-Load) pipeline processes Kartverket's Stedsnavn (Norwegian Place Names Register) into a SQLite database for use by the Vær server.

- **Input**: PostGIS dump from Kartverket Stedsnavn (~619 MB)
- **Output**: SQLite database `data/places.db` (~6 MB) with FTS5 full-text search
- **Records**: 28,115 Norwegian places

The pipeline:
1. Loads the PostGIS dump into a temporary PostgreSQL/PostGIS database
2. Extracts and transforms place data (reprojection, filtering, normalization)
3. Exports to SQLite with FTS5 indexes for fast lookups

---

## When to Run the ETL

You should run the ETL pipeline when:

- Kartverket releases updated Stedsnavn data and you want to refresh the database
- You need to modify the place filtering or transformation logic
- You're developing or debugging the places module

You do **not** need to run the ETL for:

- Normal deployment (places.db is in the repo)
- Testing the server (places.db is already built)
- Production use (just use the included database)

---

## Prerequisites

### Required

- Docker and Docker Compose v2+
- Kartverket Stedsnavn PostGIS dump file

### Download Stedsnavn Data

1. Visit: https://www.kartverket.no/api-og-data/api-og-dataoversikt/sentral-felles-kartdatabase
2. Download: **Basisdata → Stedsnavn → PostGIS format**
   - Geografisk område: **Hele landet** (whole country)
   - Projeksjon: **EUREF89 UTM sone 33, 2d** (EPSG:25833)
   - Format: **PostGIS**
3. Place the `.sql` file in: `postgis/Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql`

The file is ~619 MB and is excluded from git via `.gitignore`.

---

## Running the ETL

```bash
cd scripts/etl

# 1. Build Docker images (first time only)
make build

# 2. Run complete ETL pipeline
make run

# 3. Verify output
make verify
```

**Expected output**: `data/places.db` (~6 MB, 28,115 records)

### Makefile Commands

| Command | Description |
|---------|-------------|
| `make build` | Build ETL Docker image (Python 3.13 + GDAL + PostGIS client) |
| `make run` | Run complete ETL pipeline with verification |
| `make verify` | Verify output database integrity |
| `make logs` | View ETL container logs |
| `make clean` | Remove containers and volumes |
| `make inspect-schema` | Investigate PostGIS schema (debugging) |

---

## Pipeline Stages

### Stage 1: Load PostGIS Dump

- Starts PostgreSQL 17 + PostGIS container
- Loads Stedsnavn dump into staging database
- **Duration**: 30-60 seconds

### Stage 2: Transform Data

Script: `scripts/02_transform.py`

- Reprojects coordinates from EPSG:25833 (UTM Zone 33) to EPSG:4326 (WGS84)
- Filters to populated places: cities, towns, villages, farms, etc.
- Normalizes place names (preserves Norwegian characters: æøå)
- Calculates importance scores
- Detects administrative centers (county seats, municipality centers)
- **Duration**: 5-15 seconds
- **Output**: `/data/places_staging.csv`

### Stage 3: Export to SQLite

Script: `scripts/03_export_sqlite.py`

- Creates SQLite database with schema
- Imports CSV data
- Builds FTS5 full-text search index
- Adds metadata (build date, record count, license)
- Optimizes database (ANALYZE, VACUUM)
- Verifies integrity with test queries
- **Duration**: 3-10 seconds
- **Output**: `/data/places.db`

**Total ETL runtime**: < 2 minutes

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `places` | Main place records (28,115 rows) |
| `places_fts` | FTS5 full-text search index |
| `_metadata` | Build information and licensing |

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `ssr_id` | TEXT | Original Stedsnavn identifier |
| `primary_name` | TEXT | Place name (Norwegian, UTF-8) |
| `alt_names` | JSON | Alternative names array |
| `lat`, `lon` | REAL | WGS84 coordinates |
| `place_class` | TEXT | city/town/village/hamlet/farm/place |
| `municipality_code` | TEXT | 4-digit kommune code |
| `municipality_name` | TEXT | Kommune name |
| `county_name` | TEXT | Fylke name |
| `is_county_seat` | BOOLEAN | Fylkeshovedstad |
| `is_municipality_seat` | BOOLEAN | Kommunesenter |
| `importance_score` | REAL | Calculated importance (0-10) |

### Indexes

- Primary name (case-insensitive)
- Municipality code
- County name
- Place class
- Location (lat/lon)
- Importance score
- FTS5 full-text index on names and administrative areas

---

## Troubleshooting

### PostGIS dump not found

```bash
ls -lh postgis/
# Should show: Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql (~619 MB)
```

If missing, download from Kartverket (see Prerequisites).

### ETL fails during transformation

```bash
# Check container logs
make logs

# Inspect PostGIS schema
make inspect-schema
```

### Norwegian characters broken

The pipeline uses UTF-8 throughout. Verify:

```bash
sqlite3 data/places.db "SELECT primary_name FROM places WHERE primary_name LIKE '%ø%' LIMIT 5;"
# Should show: Tromsø, Bodø, etc. with proper characters
```

### Re-running ETL

To update place names data:

```bash
cd scripts/etl

# 1. Download new Stedsnavn dump (if available)
# 2. Clean up previous run
make clean

# 3. Run ETL again
make run
```

---

## Docker Architecture

```
ETL Network (etl-net)
├── postgis-staging
│   ├── Image: postgis/postgis:17-alpine
│   ├── Volume: postgis/ → /postgis (PostGIS dump)
│   └── Volume: postgis_data (temporary staging DB)
│
└── etl-runner
    ├── Image: python:3.13-slim + GDAL
    ├── Volume: data/ → /data (output SQLite)
    └── Volume: scripts/ → /scripts (ETL scripts)
```

All services run on an isolated `etl-net` network. The staging PostgreSQL database is temporary and deleted after ETL completes.

---

## License

Place name data from **Kartverket Stedsnavn** is licensed under:

- **CC BY 4.0** (Creative Commons Attribution 4.0 International)
- License: https://creativecommons.org/licenses/by/4.0/
- Attribution: "Place name data from Kartverket Stedsnavn"

---

## See Also

- [Development Guide](development.md) — Local development setup
- [Design Documentation](design.md) — Places module architecture
- [scripts/etl/](../scripts/etl/) — ETL source code

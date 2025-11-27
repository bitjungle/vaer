# Stedsnavn ETL Pipeline

This directory contains the ETL (Extract-Transform-Load) pipeline for processing Kartverket's Stedsnavn (Norwegian Place Names Register) data into a SQLite database for use by the Vær server.

## Overview

**Input**: PostGIS dump from Kartverket Stedsnavn
**Output**: SQLite database (`data/places.db`) with FTS5 full-text search

The pipeline:
1. Loads the PostGIS dump into a staging PostgreSQL database
2. Extracts and transforms place data (reprojection, filtering, normalization)
3. Exports to SQLite with FTS5 indexes for fast lookups

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
3. Place the `.sql` file in: `../../postgis/Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql`

## Quick Start

```bash
cd scripts/etl

# 1. Build Docker image
make build

# 2. Run ETL pipeline
make run

# 3. Verify output
make verify
```

**Expected output**: `../../data/places.db` (20-50 MB)

## Makefile Commands

- `make build` - Build ETL Docker image (Python 3.13 + GDAL + PostGIS client)
- `make run` - Run complete ETL pipeline (includes automatic verification)
- `make verify` - Verify output database integrity
- `make logs` - View ETL container logs
- `make clean` - Remove containers and volumes
- `make inspect-schema` - Investigate PostGIS schema (for debugging)

## Pipeline Stages

### Stage 1: Load PostGIS Dump
- Starts PostgreSQL 17 + PostGIS container
- Loads Stedsnavn dump into staging database
- **Duration**: 30-60 seconds (depends on dataset size)

### Stage 2: Transform Data
Script: `scripts/02_transform.py`

- Reprojects coordinates from EPSG:25833 (UTM Zone 33) to EPSG:4326 (WGS84)
- Filters to populated places (cities, towns, villages, etc.)
- Normalizes place names (preserves Norwegian characters: æøå)
- Calculates importance scores
- Detects administrative centers
- **Duration**: 5-15 seconds for ~50k records
- **Output**: `/data/places_staging.csv`

### Stage 3: Export to SQLite
Script: `scripts/03_export_sqlite.py`

- Creates SQLite database with schema
- Imports CSV data
- Builds FTS5 full-text search index
- Adds metadata (build date, record count, etc.)
- Optimizes database (ANALYZE, VACUUM)
- Verifies integrity with test queries
- **Duration**: 3-10 seconds
- **Output**: `/data/places.db`

## Output Database

### Schema
- **places** table: Main place records (~10k-50k Norwegian places)
- **places_fts** table: FTS5 full-text search index
- **_metadata** table: Build information and licensing

### Fields
- `ssr_id`: Original Stedsnavn identifier
- `primary_name`: Place name (Norwegian, UTF-8)
- `alt_names`: Alternative names (JSON array)
- `lat`, `lon`: WGS84 coordinates (6 decimal places)
- `place_class`: city/town/village/hamlet/farm/place
- `municipality_code`: 4-digit kommune code
- `municipality_name`: Kommune name
- `county_name`: Fylke name
- `is_county_seat`: Boolean (fylkeshovedstad)
- `is_municipality_seat`: Boolean (kommunesenter)
- `importance_score`: Calculated importance (0-10)

### Indexes
- Primary name (case-insensitive)
- Municipality code
- County name
- Place class
- Location (lat/lon)
- Importance score
- **FTS5 full-text index** on names and administrative areas

## Performance

- **ETL Runtime**: < 2 minutes total
- **Database Size**: 20-50 MB (compressed with VACUUM)
- **Memory Usage**: < 500 MB peak during ETL

## Troubleshooting

### PostGIS dump not found
```bash
ls -lh ../../postgis/
# Should show: Basisdata_0000_Norge_25833_Stedsnavn_PostGIS.sql
```

### ETL fails during transformation
```bash
# Check PostGIS container logs
make logs

# Inspect PostGIS schema
make inspect-schema
```

### Norwegian characters broken
The pipeline uses UTF-8 throughout. Verify:
```bash
sqlite3 ../../data/places.db "SELECT primary_name FROM places WHERE primary_name LIKE '%ø%' LIMIT 5;"
# Should show: Tromsø, Bodø, etc. with proper characters
```

### Database size too large (>100 MB)
Reduce included place types in `scripts/02_transform.py`:
```python
INCLUDED_TYPES = [
    'By', 'Tettsted', 'Bygd'  # Only cities, towns, villages
]
```

## Re-running ETL

To update place names data:

```bash
# 1. Download new Stedsnavn dump (if available)
# 2. Clean up previous run
make clean

# 3. Run ETL again
make run
```

The staging PostgreSQL container and volumes are temporary and will be removed.

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

All services run on isolated `etl-net` network. Output database is written to shared `data/` volume.

## License

Place name data from **Kartverket Stedsnavn** is licensed under:
- **CC BY 4.0** (Creative Commons Attribution 4.0 International)
- License: https://creativecommons.org/licenses/by/4.0/
- Attribution required: "Place name data from Kartverket Stedsnavn"

## Support

For issues with:
- **ETL pipeline**: Check logs with `make logs`, see Troubleshooting section
- **Stedsnavn data**: Visit https://www.kartverket.no/
- **Vær server**: See main project README

.PHONY: help build run verify clean logs inspect-schema

help:
	@echo "Stedsnavn ETL Pipeline - Make Commands"
	@echo ""
	@echo "  make build         Build ETL Docker image"
	@echo "  make run           Run complete ETL pipeline"
	@echo "  make verify        Verify output database"
	@echo "  make logs          View ETL logs"
	@echo "  make clean         Remove containers and volumes"
	@echo "  make inspect-schema Run PostGIS schema investigation"
	@echo ""

build:
	@echo "Building ETL Docker image..."
	docker compose -f docker-compose.etl.yml build

run:
	@echo "Running ETL pipeline..."
	docker compose -f docker-compose.etl.yml up --abort-on-container-exit
	@echo ""
	@echo "ETL complete. Verifying output..."
	@$(MAKE) verify

verify:
	@echo "Verifying places.db..."
	@if [ ! -f ../../data/places.db ]; then \
		echo "✗ places.db not found"; \
		exit 1; \
	fi
	@ls -lh ../../data/places.db
	@sqlite3 ../../data/places.db "SELECT COUNT(*) as places_count FROM places;" || echo "✗ Failed to query database"
	@sqlite3 ../../data/places.db "SELECT COUNT(*) as fts_count FROM places_fts;" || echo "✗ Failed to query FTS"
	@sqlite3 ../../data/places.db "SELECT value FROM _metadata WHERE key='build_date';" || echo "✗ Failed to read metadata"
	@echo "✓ Database verification complete"

logs:
	docker compose -f docker-compose.etl.yml logs -f

clean:
	@echo "Cleaning up ETL containers and volumes..."
	docker compose -f docker-compose.etl.yml down -v
	@echo "✓ Cleanup complete"

inspect-schema:
	@echo "Inspecting PostGIS schema..."
	@echo "Starting PostGIS container..."
	docker compose -f docker-compose.etl.yml up -d postgis-staging
	@echo "Waiting for PostgreSQL to be ready..."
	@sleep 5
	@echo "Running investigation script..."
	docker compose -f docker-compose.etl.yml exec postgis-staging psql -U postgres -d stedsnavn_staging -f /scripts/01_investigate_schema.sql

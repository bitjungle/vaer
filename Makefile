# Project settings
IMAGE_NAME ?= metno-proxy
IMAGE_TAG ?= latest
CONTAINER_NAME ?= metno-proxy
PORT ?= 8080
TZ ?= Europe/Oslo

# User-Agent for api.met.no (can be overridden per dev/CI)
USER_AGENT ?= bitjungle-weather-service/1.0 devel@bitjungle.com

DOCKER_RUN_FLAGS ?= -p $(PORT):80 -e TZ=$(TZ)

# Derived vars
IMAGE := $(IMAGE_NAME):$(IMAGE_TAG)

.PHONY: help \
        up down ps compose-build compose-logs compose-restart \
        build run stop rm restart logs shell clean \
        test test-unit test-integration test-coverage test-health test-forecast

help:
	@echo "Full stack (Docker Compose):"
	@echo "  up               Start all services (metno-proxy + vaer)"
	@echo "  down             Stop and remove all services"
	@echo "  ps               Show running services"
	@echo "  compose-build    Rebuild all Docker images"
	@echo "  compose-logs     Tail logs for all services"
	@echo "  compose-restart  Rebuild and restart all services"
	@echo ""
	@echo "Proxy only (for local vaer development):"
	@echo "  build            Build metno-proxy Docker image"
	@echo "  run              Run metno-proxy container (detached)"
	@echo "  stop             Stop metno-proxy container"
	@echo "  restart          Rebuild and restart metno-proxy"
	@echo "  shell            Shell into running metno-proxy"
	@echo "  clean            Stop and remove metno-proxy"
	@echo ""
	@echo "Testing:"
	@echo "  test             Run all tests"
	@echo "  test-unit        Run unit tests only"
	@echo "  test-integration Run integration tests (requires metno-proxy)"
	@echo "  test-coverage    Run tests with coverage report"
	@echo "  test-health      Curl proxy /healthz endpoint"
	@echo "  test-forecast    Sample forecast call via proxy"

build:
	docker build --build-arg METNO_USER_AGENT="$(USER_AGENT)" -t $(IMAGE) ./nginx

run:
	docker run -d --name $(CONTAINER_NAME) $(DOCKER_RUN_FLAGS) $(IMAGE)

stop:
	-docker stop $(CONTAINER_NAME)

rm:
	-docker rm $(CONTAINER_NAME)

restart: stop rm build run

logs:
	docker logs -f $(CONTAINER_NAME)

shell:
	docker exec -it $(CONTAINER_NAME) sh

test-health:
	curl -i http://localhost:$(PORT)/healthz || true

# Example forecast request for Oslo-ish coordinates
test-forecast:
	curl -i "http://localhost:$(PORT)/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75"

clean: stop rm

# ============================================================================
# Docker Compose targets (full stack)
# ============================================================================

up:
	docker compose up -d

down:
	docker compose down

ps:
	docker compose ps

compose-build:
	docker compose build

compose-logs:
	docker compose logs -f

compose-restart: down compose-build up

# ============================================================================
# Test targets
# ============================================================================

test:
	npm test

test-unit:
	npm run test:unit

test-integration:
	METNO_PROXY_BASE_URL=http://localhost:$(PORT) npm run test:integration

test-coverage:
	npm run test:coverage

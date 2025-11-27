# syntax=docker/dockerfile:1

# ============================================================================
# Build Stage: Compile TypeScript and install dependencies
# ============================================================================
FROM node:24-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# ============================================================================
# Production Stage: Minimal runtime image
# ============================================================================
FROM node:24-alpine AS production

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
# Rebuild native modules for production environment
RUN npm ci --omit=dev && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy runtime data directory (places.db if exists)
COPY data ./data

# Create non-root user
RUN addgroup -g 1001 -S weather && \
    adduser -S -u 1001 -G weather weather && \
    chown -R weather:weather /app

# Switch to non-root user
USER weather

# Set default environment variables
ENV NODE_ENV=production \
    METNO_TIMEOUT_MS=5000 \
    WEATHER_MCP_LOG_LEVEL=info

# Expose HTTP transport port (optional, only if WEATHER_MCP_PORT is set)
EXPOSE 3000

# Healthcheck for HTTP transport (if enabled)
# Note: stdio transport doesn't support healthchecks
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD if [ -n "$WEATHER_MCP_PORT" ]; then \
          wget --no-verbose --tries=1 --spider http://localhost:${WEATHER_MCP_PORT}/health || exit 1; \
        fi

# Default command: run via node (not npm) for proper signal handling
CMD ["node", "dist/index.js"]

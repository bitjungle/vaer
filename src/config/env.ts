/**
 * Configuration management for Vær MCP Server
 * Loads and validates environment variables
 */

export interface ServerConfig {
  // Proxy configuration
  metnoProxyBaseUrl: string;
  metnoTimeoutMs: number;
  metnoConnectTimeoutMs: number;

  // Frost API configuration
  frostClientId?: string;
  frostBaseUrl?: string;
  frostTimeoutMs: number;

  // Server configuration
  weatherMcpPort?: number;
  weatherMcpLogLevel: 'debug' | 'info' | 'warn' | 'error';
  weatherMcpAuthMode: 'none' | 'api-key' | 'jwt';
  weatherMcpApiKey?: string;

  // Server metadata
  serverName: string;
  serverVersion: string;
  mcpProtocolVersion: string;

  // Places database (Phase 7)
  placesDbPath: string;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  // Required: Proxy base URL
  const metnoProxyBaseUrl = process.env.METNO_PROXY_BASE_URL;
  if (!metnoProxyBaseUrl) {
    throw new Error(
      'METNO_PROXY_BASE_URL is required. Set it to http://localhost:8080 (dev) or http://metno-proxy:80 (docker)'
    );
  }

  // Validate proxy URL format
  try {
    new URL(metnoProxyBaseUrl);
  } catch {
    throw new Error(`Invalid METNO_PROXY_BASE_URL: ${metnoProxyBaseUrl}`);
  }

  // Optional: Timeouts
  const metnoTimeoutMs = parseInt(process.env.METNO_TIMEOUT_MS || '5000', 10);
  const metnoConnectTimeoutMs = parseInt(process.env.METNO_CONNECT_TIMEOUT_MS || '2000', 10);

  // Optional: Frost API configuration
  const frostClientId = process.env.FROST_CLIENT_ID;
  const frostBaseUrl = process.env.FROST_BASE_URL;
  const frostTimeoutMs = parseInt(process.env.FROST_TIMEOUT_MS || '10000', 10);

  // Optional: HTTP transport port
  const weatherMcpPort = process.env.VAER_PORT
    ? parseInt(process.env.VAER_PORT, 10)
    : undefined;

  // Log level
  const weatherMcpLogLevel = (process.env.VAER_LOG_LEVEL || 'info') as ServerConfig['weatherMcpLogLevel'];
  if (!['debug', 'info', 'warn', 'error'].includes(weatherMcpLogLevel)) {
    throw new Error(`Invalid VAER_LOG_LEVEL: ${weatherMcpLogLevel}`);
  }

  // Auth mode
  const weatherMcpAuthMode = (process.env.VAER_AUTH_MODE || 'none') as ServerConfig['weatherMcpAuthMode'];
  if (!['none', 'api-key', 'jwt'].includes(weatherMcpAuthMode)) {
    throw new Error(`Invalid VAER_AUTH_MODE: ${weatherMcpAuthMode}`);
  }

  // API key (required if auth mode is api-key)
  const weatherMcpApiKey = process.env.VAER_API_KEY;
  if (weatherMcpAuthMode === 'api-key' && !weatherMcpApiKey) {
    throw new Error('VAER_API_KEY is required when VAER_AUTH_MODE=api-key');
  }

  // Places database path (Phase 7)
  const placesDbPath = process.env.PLACES_DB_PATH || './data/places.db';

  return {
    metnoProxyBaseUrl,
    metnoTimeoutMs,
    metnoConnectTimeoutMs,
    frostClientId,
    frostBaseUrl,
    frostTimeoutMs,
    weatherMcpPort,
    weatherMcpLogLevel,
    weatherMcpAuthMode,
    weatherMcpApiKey,
    serverName: 'vaer-metno',
    serverVersion: '0.1.0',
    mcpProtocolVersion: '2024-11-05',
    placesDbPath,
  };
}

// Singleton config instance
let configInstance: ServerConfig | null = null;

/**
 * Get the current configuration (loads on first call)
 */
export function getConfig(): ServerConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

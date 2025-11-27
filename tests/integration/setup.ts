/**
 * Shared setup for integration tests
 * Validates environment and provides shared client instances
 */

import { beforeAll } from 'vitest';
import { ProxyClient } from '../../src/domain/proxy-client.js';
import { FrostClient} from '../../src/domain/frost-client.js';

// Shared instances
export let proxyClient: ProxyClient;
export let frostClient: FrostClient;

// Environment configuration
export const config = {
  metnoProxyBaseUrl: process.env.METNO_PROXY_BASE_URL || '',
  frostClientId: process.env.FROST_CLIENT_ID,
};

beforeAll(async () => {
  // Verify required environment variables
  if (!config.metnoProxyBaseUrl) {
    throw new Error(
      'METNO_PROXY_BASE_URL environment variable is required for integration tests. ' +
      'Example: METNO_PROXY_BASE_URL=http://localhost:8080 npm run test:integration'
    );
  }

  // Initialize ProxyClient
  proxyClient = new ProxyClient(config.metnoProxyBaseUrl, 5000);

  // Verify proxy is reachable
  const healthy = await proxyClient.healthCheck();
  if (!healthy) {
    throw new Error(
      `metno-proxy is not reachable at ${config.metnoProxyBaseUrl}. ` +
      'Please ensure metno-proxy is running (e.g., make run in metno-proxy/)'
    );
  }

  // Initialize FrostClient (optional)
  frostClient = new FrostClient({
    baseUrl: 'https://frost.met.no',
    clientId: config.frostClientId,
    timeout: 10000,
  });
});

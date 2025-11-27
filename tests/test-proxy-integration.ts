/**
 * Integration test for Phase 2: Proxy Integration Layer
 *
 * Tests the ProxyClient against a running metno-proxy instance.
 *
 * Usage: METNO_PROXY_BASE_URL=http://localhost:8080 tsx test-proxy-integration.ts
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import { logger } from '../src/domain/logger.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;

  if (!baseUrl) {
    console.error('Error: METNO_PROXY_BASE_URL environment variable is required');
    process.exit(1);
  }

  logger.info('Starting proxy integration test', { baseUrl });

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Health check
  console.log('\n=== Test 1: Health Check ===');
  try {
    const healthy = await client.healthCheck();
    console.log(`✓ Health check: ${healthy ? 'PASS' : 'FAIL'}`);
    if (!healthy) {
      console.error('Proxy health check failed. Is metno-proxy running?');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Health check failed:', error);
    process.exit(1);
  }

  // Test 2: Fetch Oslo forecast (verify cache headers)
  console.log('\n=== Test 2: Fetch Location Forecast (Oslo) ===');
  try {
    const response = await client.fetch(
      '/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75'
    );

    console.log(`✓ Status: ${response.status}`);
    console.log(`✓ Cached: ${response.cache.cached}`);
    console.log(`✓ Age: ${response.cache.ageSeconds ?? 'N/A'} seconds`);
    console.log(`✓ Data type: ${response.data && typeof response.data === 'object' ? 'object' : typeof response.data}`);

    // Verify response structure
    if (response.data && typeof response.data === 'object' && 'properties' in response.data) {
      console.log('✓ Response has expected structure (properties field present)');
    } else {
      console.warn('⚠ Response structure unexpected');
    }
  } catch (error) {
    console.error('✗ Forecast fetch failed:', error);
    process.exit(1);
  }

  // Test 3: Fetch again to test cache
  console.log('\n=== Test 3: Fetch Again (Should be Cached) ===');
  try {
    const response = await client.fetch(
      '/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75'
    );

    console.log(`✓ Status: ${response.status}`);
    console.log(`✓ Cached: ${response.cache.cached}`);
    console.log(`✓ Age: ${response.cache.ageSeconds ?? 'N/A'} seconds`);

    if (response.cache.cached) {
      console.log('✓ Response was served from cache');
    } else {
      console.warn('⚠ Response was not cached (may be first request or cache expired)');
    }
  } catch (error) {
    console.error('✗ Cached fetch failed:', error);
    process.exit(1);
  }

  // Test 4: Test 404 error handling
  console.log('\n=== Test 4: Error Handling (404) ===');
  try {
    await client.fetch('/nonexistent-endpoint');
    console.error('✗ Should have thrown an error for 404');
    process.exit(1);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      console.log(`✓ Error caught: ${error.code}`);
      console.log(`✓ Message: ${error.message}`);
      console.log(`✓ Retryable: ${error.retryable}`);
    } else {
      console.error('✗ Error has unexpected structure:', error);
      process.exit(1);
    }
  }

  console.log('\n=== All Tests Passed ===\n');
  logger.info('Proxy integration test completed successfully');
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

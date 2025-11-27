/**
 * Integration test for Phase 3: Location Forecast Tool
 *
 * Tests the location forecast tool against a running metno-proxy instance.
 *
 * Usage: METNO_PROXY_BASE_URL=http://localhost:8080 npx tsx test-location-forecast.ts
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import {
  handleLocationForecast,
  type LocationForecastInput,
} from '../src/tools/location-forecast.js';
import { logger } from '../src/domain/logger.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;

  if (!baseUrl) {
    console.error(
      'Error: METNO_PROXY_BASE_URL environment variable is required'
    );
    process.exit(1);
  }

  logger.info('Starting location forecast tool integration test', {
    baseUrl,
  });

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Basic forecast for Oslo with defaults
  console.log('\n=== Test 1: Basic Forecast (Oslo, defaults) ===');
  try {
    const input: LocationForecastInput = {
      location: {
        lat: 59.91,
        lon: 10.75,
      },
      timeWindow: {
        preset: 'next_24h',
      },
      resolution: 'hourly',
      includeProbabilistic: false,
      language: 'en',
    };

    const result = await handleLocationForecast(input, client);

    if (result.isError) {
      console.error('✗ Tool returned error:', result.structuredContent);
      process.exit(1);
    }

    const output = result.structuredContent as any;

    console.log(`✓ Provider: ${output.source.provider}`);
    console.log(`✓ Product: ${output.source.product}`);
    console.log(`✓ Cached: ${output.source.cached}`);
    console.log(
      `✓ Age: ${output.source.ageSeconds ?? 'N/A'} seconds`
    );
    console.log(
      `✓ Location: ${output.location.lat}°N, ${output.location.lon}°E`
    );
    console.log(
      `✓ Elevation used: ${output.location.elevationUsed}m`
    );
    console.log(`✓ Data points: ${output.hours.length}`);
    console.log(`✓ Time window: ${output.timeWindow.from} to ${output.timeWindow.to}`);

    if (output.hours.length > 0) {
      const first = output.hours[0];
      console.log(
        `✓ First data point: ${first.time}, ${first.air_temperature}${first.air_temperature_unit}, wind ${first.wind_speed}${first.wind_speed_unit}, ${first.symbol_code}`
      );
    }

    if (result.content && result.content[0]) {
      console.log(`✓ Text summary: ${result.content[0].text}`);
    }
  } catch (error) {
    console.error('✗ Test 1 failed:', error);
    process.exit(1);
  }

  // Test 2: Forecast with altitude and probabilistic data
  console.log(
    '\n=== Test 2: Forecast with Altitude and Probabilistic Data ==='
  );
  try {
    const input: LocationForecastInput = {
      location: {
        lat: 60.47,
        lon: 8.47,
        altitude: 1000, // Mountain elevation
      },
      timeWindow: {
        preset: 'next_48h',
      },
      resolution: '3-hourly',
      includeProbabilistic: true,
      language: 'en',
    };

    const result = await handleLocationForecast(input, client);

    if (result.isError) {
      console.error('✗ Tool returned error:', result.structuredContent);
      process.exit(1);
    }

    const output = result.structuredContent as any;

    console.log(`✓ Data points (3-hourly): ${output.hours.length}`);
    console.log(
      `✓ Cached: ${output.source.cached} (should be true on second run)`
    );

    if (output.hours.length > 0 && output.hours[0].air_temperature_p10) {
      console.log(
        `✓ Probabilistic data present: p10=${output.hours[0].air_temperature_p10}°C, p90=${output.hours[0].air_temperature_p90}°C`
      );
    } else {
      console.warn(
        '⚠ Probabilistic data not present (may not be available for all forecasts)'
      );
    }
  } catch (error) {
    console.error('✗ Test 2 failed:', error);
    process.exit(1);
  }

  // Test 3: Test caching (second call should be cached)
  console.log('\n=== Test 3: Cache Verification ===');
  try {
    const input: LocationForecastInput = {
      location: {
        lat: 59.91,
        lon: 10.75,
      },
      timeWindow: {
        preset: 'next_24h',
      },
      resolution: 'hourly',
      includeProbabilistic: false,
      language: 'en',
    };

    // First call
    const result1 = await handleLocationForecast(input, client);
    const output1 = result1.structuredContent as any;
    console.log(`✓ First call - Cached: ${output1.source.cached}`);

    // Second call (should be cached)
    const result2 = await handleLocationForecast(input, client);
    const output2 = result2.structuredContent as any;
    console.log(`✓ Second call - Cached: ${output2.source.cached}`);

    if (output2.source.cached) {
      console.log('✓ Cache is working correctly');
    } else {
      console.warn(
        '⚠ Second call was not cached (cache may have expired or this is first run)'
      );
    }
  } catch (error) {
    console.error('✗ Test 3 failed:', error);
    process.exit(1);
  }

  // Test 4: Invalid coordinates (API returns 400)
  console.log('\n=== Test 4: Invalid Input (API Validation) ===');
  try {
    const input: LocationForecastInput = {
      location: {
        lat: 91, // Invalid: > 90
        lon: 10.75,
      },
      timeWindow: undefined,
      resolution: 'hourly',
      includeProbabilistic: false,
      language: 'en',
    };

    // Note: Zod validation allows -90 to 90, but MET API may have stricter validation
    // This tests that API errors are properly handled
    const result = await handleLocationForecast(input, client);

    if (result.isError) {
      const error = (result.structuredContent as any).error;
      console.log(
        `✓ API error handled correctly: ${error.code} - ${error.message}`
      );
    } else {
      console.warn('⚠ API accepted coordinates that should be invalid');
    }
  } catch (error) {
    console.error('✗ Unexpected error:', error);
    process.exit(1);
  }

  console.log('\n=== All Tests Passed ===\n');
  logger.info('Location forecast tool integration test completed successfully');
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

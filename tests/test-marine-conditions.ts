/**
 * Quick test for Marine Conditions tool
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import { handleMarineConditions } from '../src/tools/marine-conditions.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;
  if (!baseUrl) {
    console.error('Error: METNO_PROXY_BASE_URL required');
    process.exit(1);
  }

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Oslo Fjord (coastal Norway, should work)
  console.log('\n=== Test 1: Oslo Fjord (Coastal Norway) ===');
  try {
    const result = await handleMarineConditions(
      {
        location: { lat: 59.9, lon: 10.7 },
        vesselType: 'kayak',
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Provider: ${output.source.provider}`);
      console.log(`✓ Vessel type: ${output.vesselType}`);
      console.log(`✓ Data points: ${output.hours.length}`);
      console.log(`✓ Summary: ${result.content[0].text}`);

      if (output.hours.length > 0) {
        const first = output.hours[0];
        console.log(
          `✓ First point: ${first.time}, wave height ${first.wave_height}m, ${first.risk_level} risk`
        );
      }
    } else {
      console.error('✗ Unexpected error');
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 2: Different vessel types
  console.log('\n=== Test 2: Different Vessel Types ===');
  for (const vesselType of ['small_sailboat', 'motorboat', 'ship'] as const) {
    try {
      const result = await handleMarineConditions(
        {
          location: { lat: 59.9, lon: 10.7 },
          vesselType,
          language: 'en',
        },
        client
      );

      if (!result.isError) {
        const output = result.structuredContent as any;
        const first = output.hours[0];
        console.log(
          `✓ ${vesselType}: ${first.risk_level} risk (wave: ${first.wave_height}m)`
        );
      }
    } catch (error) {
      console.error(`✗ ${vesselType} test failed:`, error);
      process.exit(1);
    }
  }

  // Test 3: Outside coastal Norway (should fail with coverage error)
  console.log('\n=== Test 3: Outside Coastal Norway ===');
  try {
    const result = await handleMarineConditions(
      {
        location: { lat: 40.71, lon: -74.01 }, // New York
        vesselType: 'kayak',
        language: 'en',
      },
      client
    );

    if (result.isError) {
      const error = (result.structuredContent as any).error;
      console.log(`✓ Coverage error: ${error.code}`);
      console.log(`✓ Message: ${error.message}`);
    } else {
      console.error('✗ Should have failed with coverage error');
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  console.log('\n=== Tests Passed ===\n');
}

main().catch(console.error);

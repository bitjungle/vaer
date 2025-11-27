/**
 * Quick test for Recent Observations tool
 *
 * Note: This test requires FROST_CLIENT_ID environment variable to be set
 */

import { FrostClient } from '../src/domain/frost-client.js';
import { handleRecentObservations } from '../src/tools/recent-observations.js';

async function main() {
  const frostClientId = process.env.FROST_CLIENT_ID;

  if (!frostClientId) {
    console.error('Error: FROST_CLIENT_ID required for observations');
    console.error(
      'Get your client ID from https://frost.met.no/auth/requestCredentials.html'
    );
    console.error('Then set it: export FROST_CLIENT_ID=your-client-id');
    process.exit(1);
  }

  const client = new FrostClient({
    clientId: frostClientId,
    timeout: 15000,
  });

  // Test 1: Station-based query (Oslo-Blindern)
  console.log('\n=== Test 1: Station-based Query (Oslo-Blindern) ===');
  try {
    const result = await handleRecentObservations(
      {
        location: { stationId: 'SN18700' }, // Oslo-Blindern
        elements: ['air_temperature', 'wind_speed'],
        maxDays: 1,
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Provider: ${output.source.provider}`);
      console.log(`✓ Observations: ${output.observations.length}`);
      console.log(`✓ Summary: ${result.content[0].text}`);

      if (output.observations.length > 0) {
        const first = output.observations[0];
        console.log(
          `✓ Latest: ${first.time}, station ${first.stationName || first.stationId}`
        );
        if (first.air_temperature !== undefined) {
          console.log(`  Temperature: ${first.air_temperature}°C`);
        }
        if (first.wind_speed !== undefined) {
          console.log(`  Wind: ${first.wind_speed} m/s`);
        }
      }
    } else {
      console.error('✗ Unexpected error:', result.structuredContent);
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 2: Coordinate-based query (near Oslo)
  console.log('\n=== Test 2: Coordinate-based Query (Near Oslo) ===');
  try {
    const result = await handleRecentObservations(
      {
        location: { lat: 59.91, lon: 10.75, radiusKm: 20 },
        elements: ['air_temperature', 'wind_speed', 'precipitation_amount'],
        maxDays: 1,
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Observations: ${output.observations.length}`);

      // Count unique stations
      const stations = new Set(output.observations.map((o: any) => o.stationId));
      console.log(`✓ Stations found: ${stations.size}`);

      if (output.observations.length > 0) {
        const first = output.observations[0];
        console.log(
          `✓ Latest from: ${first.stationName || first.stationId}`
        );
      }
    } else {
      console.error('✗ Unexpected error:', result.structuredContent);
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 3: No stations found (remote ocean location)
  console.log('\n=== Test 3: No Stations Found (Remote Location) ===');
  try {
    const result = await handleRecentObservations(
      {
        location: { lat: 70.0, lon: 20.0, radiusKm: 5 }, // Remote Arctic
        elements: ['air_temperature'],
        maxDays: 1,
        language: 'en',
      },
      client
    );

    if (result.isError) {
      const error = (result.structuredContent as any).error;
      console.log(`✓ Coverage error: ${error.code}`);
      console.log(`✓ Message: ${error.message}`);
    } else {
      console.log('⚠ Found stations (may vary depending on location)');
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  console.log('\n=== Tests Passed ===\n');
}

main().catch(console.error);

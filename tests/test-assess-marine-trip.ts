/**
 * Integration test for Assess Marine Trip Risk tool
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import { handleAssessMarineTrip } from '../src/tools/assess-marine-trip.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;
  if (!baseUrl) {
    console.error('Error: METNO_PROXY_BASE_URL required');
    process.exit(1);
  }

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Short trip in Oslo Fjord (kayak)
  console.log('\n=== Test 1: Short Oslo Fjord Trip (Kayak) ===');
  try {
    const result = await handleAssessMarineTrip(
      {
        route: [
          { lat: 59.9, lon: 10.7, name: 'Oslo Harbor' },
          { lat: 59.85, lon: 10.75, name: 'Nesodden' },
        ],
        vesselType: 'kayak',
        timeWindow: { preset: 'next_24h' },
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Route: ${output.route.length} waypoints`);
      console.log(`✓ Vessel: ${output.vesselType}`);
      console.log(`✓ Overall risk: ${output.overall_risk}`);
      console.log(`✓ Waypoints assessed: ${output.waypoint_assessments.length}`);
      console.log(`✓ Hotspots: ${output.hotspots.length}`);
      console.log(`✓ Recommendation: ${output.recommendation}`);
      console.log(`✓ Summary:\n${result.content[0].text}`);
    } else {
      console.error('✗ Unexpected error');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 2: Different vessel types
  console.log('\n=== Test 2: Different Vessel Types ===');
  for (const vesselType of ['small_sailboat', 'motorboat', 'ship'] as const) {
    try {
      const result = await handleAssessMarineTrip(
        {
          route: [
            { lat: 59.9, lon: 10.7 },
            { lat: 59.85, lon: 10.75 },
          ],
          vesselType,
          timeWindow: { preset: 'next_24h' },
          language: 'en',
        },
        client
      );

      if (!result.isError) {
        const output = result.structuredContent as any;
        console.log(`✓ ${vesselType}: ${output.overall_risk} risk, ${output.hotspots.length} hotspots`);
      }
    } catch (error) {
      console.error(`✗ ${vesselType} test failed:`, error);
      process.exit(1);
    }
  }

  // Test 3: Longer route with multiple waypoints
  console.log('\n=== Test 3: Multi-Waypoint Route ===');
  try {
    const result = await handleAssessMarineTrip(
      {
        route: [
          { lat: 59.9, lon: 10.7, name: 'Oslo' },
          { lat: 59.88, lon: 10.72, name: 'Hovedøya' },
          { lat: 59.85, lon: 10.75, name: 'Nesodden' },
          { lat: 59.82, lon: 10.77, name: 'South Point' },
        ],
        vesselType: 'small_sailboat',
        timeWindow: { preset: 'next_48h' },
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Route: ${output.route.length} waypoints`);
      console.log(`✓ Sampled: ${output.waypoint_assessments.length} waypoints assessed`);
      console.log(`✓ Overall risk: ${output.overall_risk}`);

      // Show waypoint max risks
      for (const assessment of output.waypoint_assessments) {
        const name = assessment.waypoint.name || `${assessment.waypoint.lat.toFixed(2)}°N`;
        console.log(`  - ${name}: ${assessment.max_risk} risk (${assessment.high_risk_hours} high-risk hours)`);
      }
    } else {
      console.error('✗ Unexpected error');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 4: Out of coverage (should fail gracefully)
  console.log('\n=== Test 4: Out of Coverage ===');
  try {
    const result = await handleAssessMarineTrip(
      {
        route: [
          { lat: 40.71, lon: -74.01, name: 'New York' },
          { lat: 40.72, lon: -74.0, name: 'Manhattan' },
        ],
        vesselType: 'kayak',
        timeWindow: { preset: 'next_24h' },
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

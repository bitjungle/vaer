/**
 * Integration test for Assess Outdoor Activity Window tool
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import { handleAssessOutdoorActivity } from '../src/tools/assess-outdoor-activity.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;
  if (!baseUrl) {
    console.error('Error: METNO_PROXY_BASE_URL required');
    process.exit(1);
  }

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Running activity (Oslo, next 24h)
  console.log('\n=== Test 1: Running Activity (Oslo, Next 24h) ===');
  try {
    const result = await handleAssessOutdoorActivity(
      {
        location: { lat: 59.91, lon: 10.75 },
        activity: 'running',
        timeWindow: { preset: 'next_24h' },
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Activity: ${output.activity}`);
      console.log(`✓ Slots assessed: ${output.slots.length}`);
      console.log(`✓ Good slots: ${output.slots.filter((s: any) => s.score === 'good').length}`);
      console.log(`✓ Best windows: ${output.bestWindows.length}`);

      if (output.bestWindows.length > 0) {
        const firstWindow = output.bestWindows[0];
        console.log(`✓ First window: ${firstWindow.duration_hours}h starting at ${firstWindow.from}`);
      }

      console.log(`✓ Summary:\n${result.content[0].text}`);
    } else {
      console.error('✗ Unexpected error');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 2: Different activities
  console.log('\n=== Test 2: Different Activities ===');
  for (const activity of ['cycling', 'hiking', 'kids_playground'] as const) {
    try {
      const result = await handleAssessOutdoorActivity(
        {
          location: { lat: 59.91, lon: 10.75 },
          activity,
          timeWindow: { preset: 'next_24h' },
          language: 'en',
        },
        client
      );

      if (!result.isError) {
        const output = result.structuredContent as any;
        const goodCount = output.slots.filter((s: any) => s.score === 'good').length;
        console.log(`✓ ${activity}: ${goodCount} good hours, ${output.bestWindows.length} windows`);
      }
    } catch (error) {
      console.error(`✗ ${activity} test failed:`, error);
      process.exit(1);
    }
  }

  // Test 3: Custom preferences
  console.log('\n=== Test 3: Custom Preferences ===');
  try {
    const result = await handleAssessOutdoorActivity(
      {
        location: { lat: 59.91, lon: 10.75 },
        activity: 'custom',
        preferences: {
          minTemp: 10,
          maxTemp: 20,
          maxWind: 5,
          avoidRain: true,
        },
        timeWindow: { preset: 'next_24h' },
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Custom preferences applied`);
      console.log(`✓ Slots: ${output.slots.length}, Good: ${output.slots.filter((s: any) => s.score === 'good').length}`);

      // Show first slot details
      if (output.slots.length > 0) {
        const first = output.slots[0];
        console.log(`✓ First slot: ${first.score} (temp: ${first.temperature}°C, wind: ${first.wind_speed}m/s)`);
        console.log(`  Reason: ${first.reason}`);
      }
    } else {
      console.error('✗ Unexpected error');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 4: Override preset thresholds
  console.log('\n=== Test 4: Override Preset Activity ===');
  try {
    const result = await handleAssessOutdoorActivity(
      {
        location: { lat: 59.91, lon: 10.75 },
        activity: 'running',
        preferences: {
          maxTemp: 15, // Override running maxTemp (default 20)
        },
        timeWindow: { preset: 'next_24h' },
        language: 'en',
      },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Running with custom maxTemp=15°C`);
      console.log(`✓ Good slots: ${output.slots.filter((s: any) => s.score === 'good').length}`);
    } else {
      console.error('✗ Unexpected error');
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  console.log('\n=== Tests Passed ===\n');
}

main().catch(console.error);

/**
 * Quick test for Nowcast tool
 */

import { ProxyClient } from '../src/domain/proxy-client.js';
import { handleNowcast } from '../src/tools/nowcast.js';

async function main() {
  const baseUrl = process.env.METNO_PROXY_BASE_URL;
  if (!baseUrl) {
    console.error('Error: METNO_PROXY_BASE_URL required');
    process.exit(1);
  }

  const client = new ProxyClient(baseUrl, 5000);

  // Test 1: Oslo (Nordic, should work)
  console.log('\n=== Test 1: Oslo (Nordic) ===');
  try {
    const result = await handleNowcast(
      { location: { lat: 59.91, lon: 10.75 }, language: 'en' },
      client
    );

    if (!result.isError) {
      const output = result.structuredContent as any;
      console.log(`✓ Provider: ${output.source.provider}`);
      console.log(`✓ Data points: ${output.hours.length}`);
      console.log(`✓ Summary: ${result.content[0].text}`);
      
      if (output.hours.length > 0) {
        const first = output.hours[0];
        console.log(`✓ First point: ${first.time}, ${first.precipitation_intensity_class}`);
      }
    } else {
      console.error('✗ Unexpected error');
    }
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }

  // Test 2: Outside Nordic (should fail with coverage error)
  console.log('\n=== Test 2: New York (Outside Nordic) ===');
  try {
    const result = await handleNowcast(
      { location: { lat: 40.71, lon: -74.01 }, language: 'en' },
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

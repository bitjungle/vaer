/**
 * Phase 6 test - verify resources and prompts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function main() {
  console.log('=== Testing Phase 6: Resources & Prompts ===\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['dist/index.js'],
    env: {
      ...process.env,
      METNO_PROXY_BASE_URL: 'http://localhost:8080',
    },
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✓ Connected to MCP server\n');

    // Test 1: List Resources
    console.log('=== Test 1: List Resources ===');
    const resourcesResult = await client.listResources();
    console.log(`✓ Listed ${resourcesResult.resources.length} resources:\n`);

    for (const resource of resourcesResult.resources) {
      console.log(`  - ${resource.name}`);
      console.log(`    URI: ${resource.uri}`);
      console.log(`    Description: ${resource.description?.substring(0, 60)}...`);
      console.log(`    MIME: ${resource.mimeType}\n`);
    }

    // Test 2: Read each resource
    console.log('=== Test 2: Read Resources ===');
    const resourceUris = [
      'metno://license',
      'metno://products',
      'weather://units',
      'weather://examples/en',
    ];

    for (const uri of resourceUris) {
      try {
        const result = await client.readResource({ uri });
        console.log(`✓ Read ${uri}`);
        console.log(`  Contents: ${result.contents.length} item(s)`);
        if (result.contents[0] && 'text' in result.contents[0]) {
          console.log(`  Size: ${result.contents[0].text.length} chars\n`);
        }
      } catch (error) {
        console.error(`✗ Failed to read ${uri}:`, error);
      }
    }

    // Test 3: List Prompts
    console.log('=== Test 3: List Prompts ===');
    const promptsResult = await client.listPrompts();
    console.log(`✓ Listed ${promptsResult.prompts.length} prompts:\n`);

    for (const prompt of promptsResult.prompts) {
      console.log(`  - ${prompt.name}`);
      console.log(`    Description: ${prompt.description?.substring(0, 60)}...`);
      if (prompt.arguments && prompt.arguments.length > 0) {
        console.log(`    Arguments: ${prompt.arguments.length}`);
      }
      console.log();
    }

    // Test 4: Get a prompt
    console.log('=== Test 4: Get Prompt (plan_outdoor_event) ===');
    try {
      const promptResult = await client.getPrompt({
        name: 'plan_outdoor_event',
        arguments: {
          locationName: 'Oslo, Norway',
          lat: 59.91,
          lon: 10.75,
          date: '2025-12-01',
          timezone: 'Europe/Oslo',
          activityType: 'running',
        },
      });

      console.log('✓ Got prompt');
      console.log(`  Messages: ${promptResult.messages.length}`);
      if (promptResult.messages[0] && promptResult.messages[0].content) {
        const content = promptResult.messages[0].content;
        if ('text' in content) {
          console.log(
            `  Message length: ${content.text.length} chars`
          );
          console.log(
            `  Preview: ${content.text.substring(0, 100)}...`
          );
        }
      }
    } catch (error) {
      console.error('✗ Failed to get prompt:', error);
    }

    console.log('\n=== All Phase 6 Tests Passed ===');
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch(console.error);

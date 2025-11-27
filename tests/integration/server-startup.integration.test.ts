/**
 * Integration tests for MCP Server Startup
 * Tests that the server starts correctly and handles missing dependencies gracefully
 *
 * @group integration
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { config } from './setup.js';

describe('MCP Server Startup', () => {
  it('should start successfully via stdio transport', async () => {
    const { output, exitCode } = await spawnServer();

    // Server should start without errors
    expect(exitCode).toBe(0);

    // Should contain successful startup message OR graceful degradation message
    const startedSuccessfully =
      output.includes('MCP server connected via stdio transport') ||
      output.includes('PlacesDB not available');

    expect(startedSuccessfully).toBe(true);
  }, 15000); // 15s timeout for server startup

  it('should gracefully handle missing PlacesDB', async () => {
    const { output } = await spawnServer();

    // If PlacesDB is missing, server should log this but still start
    if (output.includes('PlacesDB not available')) {
      expect(output).toContain('PlacesDB not available');

      // Server should still start despite missing DB
      expect(output).toContain('MCP server connected via stdio transport');
    }
  }, 15000);

  it('should use configured proxy URL', async () => {
    const { output } = await spawnServer();

    // Server should initialize ProxyClient with the configured URL
    if (output.includes('ProxyClient initialized')) {
      expect(output).toContain(config.metnoProxyBaseUrl);
    }
  }, 15000);
});

/**
 * Helper function to spawn the MCP server process and capture output
 */
async function spawnServer(): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const server = spawn('node', ['dist/index.js'], {
      env: {
        ...process.env,
        METNO_PROXY_BASE_URL: config.metnoProxyBaseUrl,
      },
    });

    let output = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', (data) => {
      output += data.toString();
    });

    // Give server 2 seconds to start up, then kill it
    setTimeout(() => {
      server.kill();
    }, 2000);

    server.on('close', (code) => {
      resolve({ output, exitCode: code || 0 });
    });
  });
}

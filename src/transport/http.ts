/**
 * HTTP transport for Weather MCP Server (Phase 8)
 * Handles communication via HTTP using StreamableHTTPServerTransport
 */

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { logger } from '../domain/logger.js';
import { metrics } from '../domain/metrics.js';
import type { ServerConfig } from '../config/env.js';
import { createMcpServer } from '../server.js';

/**
 * Start the MCP server with HTTP transport
 * Uses Express + StreamableHTTPServerTransport in stateless mode
 */
export async function startHttpServer(config: ServerConfig): Promise<void> {
  const port = config.weatherMcpPort;
  if (!port) {
    throw new Error('WEATHER_MCP_PORT must be set for HTTP transport');
  }

  logger.info('Initializing MCP server with HTTP transport', { port });

  // Create the MCP server once (reused across requests)
  const server: McpServer = createMcpServer(config);

  // Create Express app
  const app = express();
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', transport: 'http' });
  });

  // Metrics endpoint - Prometheus format (Phase 9)
  app.get('/metrics', (_req, res) => {
    const prometheusText = metrics.exportPrometheus();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(prometheusText);
  });

  // MCP endpoint - stateless mode
  app.post('/mcp', async (req, res) => {
    // In stateless mode, create a new transport for each request to prevent
    // request ID collisions. Different clients may use the same JSON-RPC request IDs,
    // which would cause responses to be routed to the wrong HTTP connections if
    // the transport state is shared.
    try {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
        enableJsonResponse: true,
      });

      // Clean up transport when response completes
      res.on('close', () => {
        transport.close();
      });

      // Connect server to transport
      await server.connect(transport);

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('Error handling MCP request', { error });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  // Start server
  app.listen(port, () => {
    logger.info('MCP server listening on HTTP transport', {
      port,
      endpoint: `http://localhost:${port}/mcp`,
      health: `http://localhost:${port}/health`,
      metrics: `http://localhost:${port}/metrics`,
      capabilities: {
        tools: true,
        resources: true,
        prompts: true,
      },
    });
  }).on('error', (error) => {
    logger.error('HTTP server error', { error });
    process.exit(1);
  });
}

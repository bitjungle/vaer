/**
 * Stdio transport for Weather MCP Server
 * Handles communication via standard input/output streams
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../domain/logger.js';
import type { ServerConfig } from '../config/env.js';
import { createMcpServer } from '../server.js';

/**
 * Start the MCP server with stdio transport
 */
export async function startStdioServer(config: ServerConfig): Promise<McpServer> {
  logger.info('Initializing MCP server with stdio transport');

  // Create the MCP server with all tools, resources, and prompts
  const server = createMcpServer(config);

  logger.info('Connecting to stdio transport');

  // Create and connect the stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server connected via stdio transport', {
    capabilities: {
      tools: true,
      resources: true,
      prompts: true,
    },
  });

  return server;
}

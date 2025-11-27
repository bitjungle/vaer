/**
 * Weather MCP Server
 * Entry point for the Model Context Protocol server
 */

import { getConfig } from './config/env.js';
import { logger } from './domain/logger.js';
import { startStdioServer } from './transport/stdio.js';
import { startHttpServer } from './transport/http.js';

/**
 * Main entry point
 */
async function main() {
  try {
    // Load configuration
    const config = getConfig();

    // Set log level from config
    logger.setLevel(config.weatherMcpLogLevel);

    logger.info('Starting Weather MCP Server', {
      version: config.serverVersion,
      logLevel: config.weatherMcpLogLevel,
    });

    // Choose transport based on configuration (Phase 8)
    if (config.weatherMcpPort) {
      // HTTP transport
      logger.info('Using HTTP transport', { port: config.weatherMcpPort });
      await startHttpServer(config);
      // HTTP server runs indefinitely, no need to store server reference

      // Setup graceful shutdown for HTTP
      const shutdown = () => {
        logger.info('Shutdown signal received');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } else {
      // Stdio transport (default)
      logger.info('Using stdio transport');
      const server = await startStdioServer(config);

      // Setup graceful shutdown for stdio
      const shutdown = async () => {
        logger.info('Shutdown signal received, closing server...');
        try {
          await server.close();
          logger.info('Server closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        }
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    }

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.logError(error, { context: 'uncaughtException' });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      logger.error('Unhandled promise rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
      });
      process.exit(1);
    });

    logger.info('Weather MCP Server is ready');
  } catch (error) {
    if (error instanceof Error) {
      logger.logError(error, { context: 'startup' });
    } else {
      logger.error('Unknown error during startup', { error: String(error) });
    }
    process.exit(1);
  }
}

// Start the server
main();

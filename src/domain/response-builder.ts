/**
 * Response builder for MCP tool responses
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { WeatherError } from './types.js';

/**
 * Build a successful tool response
 *
 * Ensures both structured content and text summary are included,
 * as required by the MCP specification and DESIGN.md.
 *
 * @param structuredContent - Machine-readable structured data
 * @param textSummary - Human-readable text summary
 * @returns MCP CallToolResult with both content types
 */
export function buildToolResponse(
  structuredContent: Record<string, unknown>,
  textSummary: string
): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: textSummary,
      },
    ],
    structuredContent,
  };
}

/**
 * Build an error tool response
 *
 * Formats a WeatherError into an MCP tool response with both
 * structured error content and text description.
 *
 * @param error - Structured weather error
 * @returns MCP CallToolResult with error information
 */
export function buildErrorResponse(error: WeatherError): CallToolResult {
  const textSummary = error.details?.retryAfterSeconds
    ? `${error.message} Retry after ${error.details.retryAfterSeconds} seconds.`
    : error.message;

  return {
    content: [
      {
        type: 'text',
        text: textSummary,
      },
    ],
    structuredContent: {
      error,
    },
    isError: true,
  };
}

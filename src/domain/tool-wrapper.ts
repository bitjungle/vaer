/**
 * Tool Wrapper Utility (Phase 9)
 * Wraps tool handlers with observability instrumentation
 * Provides requestId generation, logging, metrics, and timing
 * DRY - all instrumentation in one place
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runWithContext, generateRequestId } from './request-context.js';
import { logger } from './logger.js';
import { metrics } from './metrics.js';

/**
 * Tool handler function type
 */
export type ToolHandler = (...args: unknown[]) => Promise<CallToolResult>;

/**
 * Wrap a tool handler with observability instrumentation
 *
 * Automatically adds:
 * - RequestId generation and context
 * - Start/end logging with timing
 * - Metrics collection (calls, latency)
 * - Error tracking
 * - Cache status tracking (extracted from response)
 */
export function wrapTool(toolName: string, handler: ToolHandler): ToolHandler {
  return async (...args: unknown[]): Promise<CallToolResult> => {
    // Generate requestId for this tool call
    const requestId = generateRequestId();
    const startTime = Date.now();

    // Run within request context (automatically propagates to all async operations)
    return runWithContext(
      { requestId, toolName, startTime },
      async () => {
        try {
          // Log tool start
          logger.logToolStart(toolName, args[0], requestId);

          // Call actual tool handler
          const result = await handler(...args);

          // Calculate latency
          const latencyMs = Date.now() - startTime;

          // Determine outcome
          const outcome: 'success' | 'error' = result.isError ? 'error' : 'success';

          // Extract error code if present
          const firstContent = result.content[0];
          const errorText = firstContent && 'text' in firstContent ? firstContent.text : undefined;
          const errorCode = result.isError && errorText
            ? extractErrorCode(errorText)
            : undefined;

          // Log tool end
          logger.logToolEnd(toolName, latencyMs, outcome, requestId, errorCode);

          // Record metrics
          metrics.incrementToolCall(toolName, outcome);
          metrics.recordLatency(toolName, latencyMs);

          // Extract and record cache status if present in structured content
          if (!result.isError && result.structuredContent) {
            const cacheStatus = extractCacheStatus(result.structuredContent);
            if (cacheStatus) {
              metrics.incrementCacheStatus(cacheStatus);
            }
          }

          return result;
        } catch (error) {
          // Handle unexpected errors (tool handlers should return CallToolResult, not throw)
          const latencyMs = Date.now() - startTime;

          logger.logToolEnd(toolName, latencyMs, 'error', requestId, 'INTERNAL_ERROR');
          logger.logError(error as Error, {
            requestId,
            toolName,
            context: 'tool_wrapper',
          });

          metrics.incrementToolCall(toolName, 'error');
          metrics.recordLatency(toolName, latencyMs);

          // Re-throw to let SDK handle it
          throw error;
        }
      }
    );
  };
}

/**
 * Extract error code from error response text
 * Looks for pattern like "Error: ERROR_CODE" or "[ERROR_CODE]"
 */
function extractErrorCode(text: string): string | undefined {
  // Try to extract error code from common patterns
  const patterns = [
    /Error:\s*(\w+)/,           // "Error: INVALID_INPUT"
    /\[(\w+)\]/,                 // "[OUT_OF_COVERAGE]"
    /code:\s*"?(\w+)"?/i,        // "code: RATE_LIMITED" or "code": "RATE_LIMITED"
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Extract cache status from structured content
 * Looks for source.cached boolean and converts to status
 */
function extractCacheStatus(
  structuredContent: Record<string, unknown>
): 'HIT' | 'MISS' | undefined {
  const source = structuredContent.source as Record<string, unknown> | undefined;
  if (!source) {
    return undefined;
  }

  const cached = source.cached;
  if (typeof cached === 'boolean') {
    return cached ? 'HIT' : 'MISS';
  }

  return undefined;
}

/**
 * Request Context Module (Phase 9)
 * Provides automatic requestId propagation using AsyncLocalStorage
 * No need to thread requestId through function signatures
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
  toolName?: string;
  startTime?: number;
}

// AsyncLocalStorage instance for request context
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function with request context
 * Automatically propagates context to all async operations
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current request context
 * Returns undefined if not running within a context
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Get the current requestId
 * Returns undefined if not running within a context
 */
export function getRequestId(): string | undefined {
  return getContext()?.requestId;
}

/**
 * Generate a new requestId
 */
export function generateRequestId(): string {
  return randomUUID();
}

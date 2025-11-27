/**
 * HTTP client for communicating with metno-proxy
 */

import { randomUUID } from 'node:crypto';
import type { ProxyResponse } from './types.js';
import { parseCacheHeaders } from './cache-parser.js';
import { handleHttpError, handleNetworkError } from './error-handler.js';
import { logger } from './logger.js';
import { getRequestId } from './request-context.js';

/**
 * Options for proxy client fetch requests
 */
export interface FetchOptions {
  /** HTTP method (default: GET) */
  method?: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Request ID for tracking (auto-generated if not provided) */
  requestId?: string;
}

/**
 * HTTP client for calling metno-proxy
 */
export class ProxyClient {
  private readonly baseUrl: string;
  private readonly defaultTimeout: number;

  /**
   * Create a new ProxyClient
   *
   * @param baseUrl - Base URL of the metno-proxy (e.g., http://localhost:8080)
   * @param defaultTimeout - Default timeout in milliseconds (default: 5000)
   */
  constructor(baseUrl: string, defaultTimeout = 5000) {
    // Ensure baseUrl doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.defaultTimeout = defaultTimeout;

    logger.info('ProxyClient initialized', {
      baseUrl: this.baseUrl,
      defaultTimeout: this.defaultTimeout,
    });
  }

  /**
   * Fetch data from the proxy
   *
   * @param path - API path (e.g., /weatherapi/locationforecast/2.0/compact)
   * @param options - Fetch options
   * @returns Proxy response with parsed data and metadata
   * @throws WeatherError on HTTP errors or network failures
   */
  async fetch<T = unknown>(
    path: string,
    options: FetchOptions = {}
  ): Promise<ProxyResponse<T>> {
    const requestId = options.requestId || randomUUID();
    const timeout = options.timeout || this.defaultTimeout;
    const url = `${this.baseUrl}${path}`;
    const startTime = Date.now();

    logger.debug('Proxy request starting', {
      requestId,
      url,
      method: options.method || 'GET',
    });

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;

      // Parse cache metadata from headers
      const cache = parseCacheHeaders(response.headers);

      // Log upstream API call for observability
      const contextRequestId = getRequestId();
      logger.logUpstreamCall(
        url,
        response.status,
        latency,
        cache.status as 'HIT' | 'MISS' | 'EXPIRED' | undefined,
        contextRequestId || requestId
      );

      logger.info('Proxy request completed', {
        requestId,
        url,
        status: response.status,
        latency,
        cached: cache.cached,
        ageSeconds: cache.ageSeconds,
      });

      // Handle HTTP errors
      if (!response.ok) {
        throw handleHttpError(
          response.status,
          response.statusText,
          response.headers,
          requestId
        );
      }

      // Parse response body as JSON
      const data = (await response.json()) as T;

      return {
        data,
        status: response.status,
        headers: response.headers,
        cache,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      // Re-throw WeatherError as-is (already handled by handleHttpError)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        throw error;
      }

      // Handle network errors (connection refused, timeout, etc.)
      if (error instanceof Error) {
        logger.error('Proxy request failed', {
          requestId,
          url,
          error: error.message,
          latency,
        });

        // Check if it's a timeout
        if (error.name === 'AbortError') {
          throw handleNetworkError(
            new Error(`Request timeout after ${timeout}ms`),
            requestId
          );
        }

        throw handleNetworkError(error, requestId);
      }

      // Unknown error type
      logger.error('Proxy request failed with unknown error', {
        requestId,
        url,
        error: String(error),
        latency,
      });

      throw handleNetworkError(
        new Error('Unknown error occurred'),
        requestId
      );
    }
  }

  /**
   * Perform a health check against the proxy
   *
   * @returns True if proxy is healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Health endpoint returns plain text, not JSON
      const url = `${this.baseUrl}/healthz`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      logger.debug('Health check completed', {
        url,
        status: response.status,
      });

      return response.status === 200;
    } catch (error) {
      logger.warn('Proxy health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/**
 * Frost API Client
 * Handles HTTP communication with MET Norway's Frost API for observation data
 *
 * Note: Frost API is separate from api.met.no and requires authentication
 */

import { randomUUID } from 'crypto';
import { logger } from './logger.js';
import { handleHttpError, createWeatherError } from './error-handler.js';
import type { CacheMetadata } from './types.js';

/**
 * Frost API response wrapper
 */
export interface FrostResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  // Frost doesn't use proxy caching like api.met.no
  cache: CacheMetadata;
}

/**
 * Frost API client configuration
 */
export interface FrostClientConfig {
  baseUrl?: string;
  clientId?: string;
  timeout?: number;
}

/**
 * Fetch options for Frost requests
 */
export interface FrostFetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  requestId?: string;
}

/**
 * Frost API Client
 *
 * Handles authenticated requests to Frost API (frost.met.no)
 * Frost uses Basic Auth with client ID as username (no password)
 */
export class FrostClient {
  private readonly baseUrl: string;
  private readonly clientId?: string;
  private readonly defaultTimeout: number;

  constructor(config: FrostClientConfig = {}) {
    this.baseUrl = config.baseUrl || 'https://frost.met.no';
    this.clientId = config.clientId;
    this.defaultTimeout = config.timeout || 10000; // 10s default (Frost can be slow)

    if (!this.clientId) {
      logger.warn('Frost client initialized without authentication', {
        note: 'Some endpoints may return 401 Unauthorized',
      });
    }

    logger.debug('Frost client initialized', {
      baseUrl: this.baseUrl,
      hasAuth: !!this.clientId,
      timeout: this.defaultTimeout,
    });
  }

  /**
   * Make an HTTP request to Frost API
   */
  async fetch<T = unknown>(
    path: string,
    options: FrostFetchOptions = {}
  ): Promise<FrostResponse<T>> {
    const requestId = options.requestId || randomUUID();
    const timeout = options.timeout || this.defaultTimeout;

    // Build full URL
    const url = `${this.baseUrl}${path}`;

    // Build headers with authentication
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...options.headers,
    };

    // Add Basic Auth if client ID is configured
    if (this.clientId) {
      // Frost uses Basic Auth with client ID as username, no password
      const auth = Buffer.from(`${this.clientId}:`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    logger.debug('Frost API request', {
      requestId,
      method: options.method || 'GET',
      url,
      hasAuth: !!this.clientId,
    });

    const startTime = Date.now();

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Frost doesn't use proxy caching
      const cache: CacheMetadata = {
        cached: false,
      };

      logger.debug('Frost API response', {
        requestId,
        status: response.status,
        duration,
      });

      // Handle non-OK responses
      if (!response.ok) {
        throw handleHttpError(
          response.status,
          response.statusText,
          response.headers,
          requestId
        );
      }

      // Parse JSON response
      const data = (await response.json()) as T;

      return {
        data,
        status: response.status,
        headers: response.headers,
        cache,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Handle abort/timeout
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Frost API timeout', {
          requestId,
          url,
          timeout,
          duration,
        });

        throw createWeatherError(
          'MET_API_UNAVAILABLE',
          `Frost API request timed out after ${timeout}ms.`,
          { requestId, timeout }
        );
      }

      // Re-throw WeatherError as-is
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        throw error;
      }

      // Log and wrap unexpected errors
      logger.error('Frost API fetch error', {
        requestId,
        url,
        error: error instanceof Error ? error.message : String(error),
        duration,
      });

      throw createWeatherError(
        'MET_API_UNAVAILABLE',
        'Failed to fetch data from Frost API.',
        {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Check if Frost API is available
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Frost doesn't have a dedicated health endpoint
      // We can check a simple endpoint like sources
      const response = await fetch(`${this.baseUrl}/sources/v0.jsonld?limit=1`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return response.status === 200 || response.status === 401; // 401 means API is up but needs auth
    } catch (error) {
      logger.warn('Frost health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

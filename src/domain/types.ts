/**
 * Common types for Weather MCP Server
 */

/**
 * Standard error codes for weather tools
 */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'OUT_OF_COVERAGE'
  | 'RATE_LIMITED'
  | 'MET_API_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * Structured error object returned in tool responses
 */
export interface WeatherError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: {
    upstreamStatus?: number;
    requestId?: string;
    retryAfterSeconds?: number;
    [key: string]: unknown;
  };
}

/**
 * Cache metadata extracted from proxy response headers
 */
export interface CacheMetadata {
  /** Whether the response came from cache */
  cached: boolean;
  /** Age of cached response in seconds (undefined if not cached) */
  ageSeconds?: number;
}

/**
 * Source metadata included in all tool responses
 */
export interface SourceMetadata {
  provider: string;
  product: string;
  licenseUri: string;
  creditLine: string;
  cached: boolean;
  ageSeconds?: number;
}

/**
 * License and attribution information
 */
export interface Attribution {
  licenseUri: string;
  creditLine: string;
}

/**
 * Response from proxy client
 */
export interface ProxyResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
  cache: CacheMetadata;
}

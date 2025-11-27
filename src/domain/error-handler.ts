/**
 * Error handling and mapping for Weather MCP Server
 */

import type { ErrorCode, WeatherError } from './types.js';
import { logger } from './logger.js';

/**
 * Map HTTP status codes to weather error codes
 *
 * @param status - HTTP status code from upstream
 * @returns Appropriate error code
 */
export function mapHttpStatusToErrorCode(status: number): ErrorCode {
  if (status === 400 || status === 404) {
    return 'INVALID_INPUT';
  }
  if (status === 403) {
    // User-Agent or ToS issue (should not happen via proxy)
    return 'INTERNAL_ERROR';
  }
  if (status === 429 || status === 503) {
    return 'RATE_LIMITED';
  }
  if (status >= 500) {
    return 'MET_API_UNAVAILABLE';
  }
  // Default to internal error for unexpected status codes
  return 'INTERNAL_ERROR';
}

/**
 * Create a structured weather error
 *
 * @param code - Error code
 * @param message - Human-readable error message
 * @param details - Additional error details
 * @returns Structured error object
 */
export function createWeatherError(
  code: ErrorCode,
  message: string,
  details?: WeatherError['details']
): WeatherError {
  const retryable =
    code === 'RATE_LIMITED' || code === 'MET_API_UNAVAILABLE';

  return {
    code,
    message,
    retryable,
    details,
  };
}

/**
 * Handle HTTP errors from proxy and create appropriate weather error
 *
 * @param status - HTTP status code
 * @param statusText - HTTP status text
 * @param headers - Response headers (for Retry-After)
 * @param requestId - Optional request ID for tracking
 * @returns Structured error object
 */
export function handleHttpError(
  status: number,
  statusText: string,
  headers?: Headers,
  requestId?: string
): WeatherError {
  const code = mapHttpStatusToErrorCode(status);

  // Build error message based on error code
  let message: string;
  switch (code) {
    case 'INVALID_INPUT':
      message = `Invalid input parameters: ${statusText}`;
      break;
    case 'RATE_LIMITED':
      message = 'Rate limit exceeded. Please try again later.';
      break;
    case 'MET_API_UNAVAILABLE':
      message = 'MET Weather API is currently unavailable.';
      break;
    case 'INTERNAL_ERROR':
      if (status === 403) {
        message =
          'Configuration error: User-Agent or Terms of Service issue.';
      } else {
        message = 'An internal error occurred.';
      }
      break;
    default:
      message = `Unexpected error: ${statusText}`;
  }

  // Extract Retry-After header for rate limiting
  const details: WeatherError['details'] = {
    upstreamStatus: status,
  };

  if (requestId) {
    details.requestId = requestId;
  }

  if (code === 'RATE_LIMITED' && headers) {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        details.retryAfterSeconds = seconds;
      }
    }
  }

  logger.warn('HTTP error from proxy', {
    status,
    statusText,
    code,
    requestId,
  });

  return createWeatherError(code, message, details);
}

/**
 * Handle network errors (connection refused, timeout, etc.)
 *
 * @param error - Error object
 * @param requestId - Optional request ID for tracking
 * @returns Structured error object
 */
export function handleNetworkError(
  error: Error,
  requestId?: string
): WeatherError {
  logger.error('Network error calling proxy', {
    error: error.message,
    requestId,
  });

  return createWeatherError(
    'MET_API_UNAVAILABLE',
    'Unable to reach MET Weather API. Please try again later.',
    {
      requestId,
      networkError: error.message,
    }
  );
}

/**
 * Create an out-of-coverage error
 *
 * @param message - Specific coverage error message
 * @param location - Location that was out of coverage
 * @returns Structured error object
 */
export function createOutOfCoverageError(
  message: string,
  location: { lat: number; lon: number }
): WeatherError {
  return createWeatherError('OUT_OF_COVERAGE', message, {
    location,
  });
}

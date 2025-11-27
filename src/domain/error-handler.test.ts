/**
 * Unit tests for error-handler
 * Tests error mapping and structured error creation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapHttpStatusToErrorCode,
  createWeatherError,
  handleHttpError,
  handleNetworkError,
  createOutOfCoverageError,
} from './error-handler.js';

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from './logger.js';

describe('mapHttpStatusToErrorCode', () => {
  it('should map 400 to INVALID_INPUT', () => {
    expect(mapHttpStatusToErrorCode(400)).toBe('INVALID_INPUT');
  });

  it('should map 404 to INVALID_INPUT', () => {
    expect(mapHttpStatusToErrorCode(404)).toBe('INVALID_INPUT');
  });

  it('should map 403 to INTERNAL_ERROR', () => {
    expect(mapHttpStatusToErrorCode(403)).toBe('INTERNAL_ERROR');
  });

  it('should map 429 to RATE_LIMITED', () => {
    expect(mapHttpStatusToErrorCode(429)).toBe('RATE_LIMITED');
  });

  it('should map 503 to RATE_LIMITED', () => {
    expect(mapHttpStatusToErrorCode(503)).toBe('RATE_LIMITED');
  });

  it('should map 500 to MET_API_UNAVAILABLE', () => {
    expect(mapHttpStatusToErrorCode(500)).toBe('MET_API_UNAVAILABLE');
  });

  it('should map 502 to MET_API_UNAVAILABLE', () => {
    expect(mapHttpStatusToErrorCode(502)).toBe('MET_API_UNAVAILABLE');
  });

  it('should map 504 to MET_API_UNAVAILABLE', () => {
    expect(mapHttpStatusToErrorCode(504)).toBe('MET_API_UNAVAILABLE');
  });

  it('should map unknown status to INTERNAL_ERROR', () => {
    expect(mapHttpStatusToErrorCode(418)).toBe('INTERNAL_ERROR'); // I'm a teapot
    expect(mapHttpStatusToErrorCode(401)).toBe('INTERNAL_ERROR'); // Unauthorized
    expect(mapHttpStatusToErrorCode(405)).toBe('INTERNAL_ERROR'); // Method Not Allowed
  });
});

describe('createWeatherError', () => {
  it('should create error with correct structure', () => {
    const error = createWeatherError('INVALID_INPUT', 'Test message');

    expect(error).toEqual({
      code: 'INVALID_INPUT',
      message: 'Test message',
      retryable: false,
      details: undefined,
    });
  });

  it('should mark RATE_LIMITED as retryable', () => {
    const error = createWeatherError('RATE_LIMITED', 'Rate limited');

    expect(error.retryable).toBe(true);
  });

  it('should mark MET_API_UNAVAILABLE as retryable', () => {
    const error = createWeatherError('MET_API_UNAVAILABLE', 'API down');

    expect(error.retryable).toBe(true);
  });

  it('should mark INVALID_INPUT as not retryable', () => {
    const error = createWeatherError('INVALID_INPUT', 'Bad input');

    expect(error.retryable).toBe(false);
  });

  it('should mark INTERNAL_ERROR as not retryable', () => {
    const error = createWeatherError('INTERNAL_ERROR', 'Internal error');

    expect(error.retryable).toBe(false);
  });

  it('should mark OUT_OF_COVERAGE as not retryable', () => {
    const error = createWeatherError('OUT_OF_COVERAGE', 'Out of coverage');

    expect(error.retryable).toBe(false);
  });

  it('should include details when provided', () => {
    const error = createWeatherError('RATE_LIMITED', 'Rate limited', {
      upstreamStatus: 429,
      retryAfterSeconds: 60,
    });

    expect(error.details).toEqual({
      upstreamStatus: 429,
      retryAfterSeconds: 60,
    });
  });
});

describe('handleHttpError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle 400 error', () => {
    const error = handleHttpError(400, 'Bad Request', new Headers(), 'req-123');

    expect(error.code).toBe('INVALID_INPUT');
    expect(error.message).toContain('Invalid input parameters');
    expect(error.details?.upstreamStatus).toBe(400);
    expect(error.details?.requestId).toBe('req-123');
  });

  it('should handle 404 error', () => {
    const error = handleHttpError(404, 'Not Found', new Headers());

    expect(error.code).toBe('INVALID_INPUT');
    expect(error.message).toContain('Invalid input parameters');
  });

  it('should handle 429 rate limit error', () => {
    const error = handleHttpError(429, 'Too Many Requests', new Headers());

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toContain('Rate limit exceeded');
    expect(error.retryable).toBe(true);
  });

  it('should extract Retry-After header for rate limit', () => {
    const headers = new Headers({ 'Retry-After': '120' });
    const error = handleHttpError(429, 'Too Many Requests', headers);

    expect(error.details?.retryAfterSeconds).toBe(120);
  });

  it('should handle invalid Retry-After header', () => {
    const headers = new Headers({ 'Retry-After': 'invalid' });
    const error = handleHttpError(429, 'Too Many Requests', headers);

    expect(error.details?.retryAfterSeconds).toBeUndefined();
  });

  it('should handle 503 service unavailable', () => {
    const error = handleHttpError(503, 'Service Unavailable', new Headers());

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
  });

  it('should handle 500 internal server error', () => {
    const error = handleHttpError(500, 'Internal Server Error', new Headers());

    expect(error.code).toBe('MET_API_UNAVAILABLE');
    expect(error.message).toContain('MET Weather API is currently unavailable');
    expect(error.retryable).toBe(true);
  });

  it('should handle 403 forbidden with specific message', () => {
    const error = handleHttpError(403, 'Forbidden', new Headers());

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toContain('User-Agent or Terms of Service');
    expect(error.retryable).toBe(false);
  });

  it('should log HTTP error', () => {
    handleHttpError(500, 'Internal Server Error', new Headers(), 'req-123');

    expect(logger.warn).toHaveBeenCalledWith(
      'HTTP error from proxy',
      expect.objectContaining({
        status: 500,
        statusText: 'Internal Server Error',
        code: 'MET_API_UNAVAILABLE',
        requestId: 'req-123',
      })
    );
  });
});

describe('handleNetworkError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle connection error', () => {
    const networkError = new Error('Connection refused');
    const error = handleNetworkError(networkError, 'req-123');

    expect(error.code).toBe('MET_API_UNAVAILABLE');
    expect(error.message).toContain('Unable to reach MET Weather API');
    expect(error.retryable).toBe(true);
    expect(error.details?.requestId).toBe('req-123');
    expect(error.details?.networkError).toBe('Connection refused');
  });

  it('should log network error', () => {
    const networkError = new Error('Connection timeout');
    handleNetworkError(networkError, 'req-456');

    expect(logger.error).toHaveBeenCalledWith(
      'Network error calling proxy',
      expect.objectContaining({
        error: 'Connection timeout',
        requestId: 'req-456',
      })
    );
  });

  it('should handle error without request ID', () => {
    const networkError = new Error('DNS lookup failed');
    const error = handleNetworkError(networkError);

    expect(error.code).toBe('MET_API_UNAVAILABLE');
    expect(error.details?.requestId).toBeUndefined();
    expect(error.details?.networkError).toBe('DNS lookup failed');
  });
});

describe('createOutOfCoverageError', () => {
  it('should create out of coverage error', () => {
    const location = { lat: 0, lon: 0 };
    const error = createOutOfCoverageError(
      'Location is outside Nordic region',
      location
    );

    expect(error.code).toBe('OUT_OF_COVERAGE');
    expect(error.message).toBe('Location is outside Nordic region');
    expect(error.retryable).toBe(false);
    expect(error.details?.location).toEqual(location);
  });

  it('should include location in details', () => {
    const location = { lat: 59.91, lon: 10.75 };
    const error = createOutOfCoverageError('Out of bounds', location);

    expect(error.details).toEqual({ location });
  });
});

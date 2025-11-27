/**
 * Unit tests for response-builder
 * Tests MCP tool response formatting
 */

import { describe, it, expect } from 'vitest';
import { buildToolResponse, buildErrorResponse } from './response-builder.js';
import type { WeatherError } from './types.js';

describe('buildToolResponse', () => {
  it('should build response with text and structured content', () => {
    const structuredContent = {
      forecast: [{ temperature: 20 }],
      source: { provider: 'MET Norway' },
    };
    const textSummary = 'Temperature is 20°C';

    const result = buildToolResponse(structuredContent, textSummary);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Temperature is 20°C',
        },
      ],
      structuredContent,
    });
  });

  it('should handle empty structured content', () => {
    const result = buildToolResponse({}, 'Empty response');

    expect(result.structuredContent).toEqual({});
    expect(result.content[0].text).toBe('Empty response');
  });

  it('should handle multi-line text summary', () => {
    const textSummary = 'Line 1\nLine 2\nLine 3';
    const result = buildToolResponse({ data: 'test' }, textSummary);

    expect(result.content[0].text).toBe(textSummary);
  });
});

describe('buildErrorResponse', () => {
  it('should build error response with basic error', () => {
    const error: WeatherError = {
      code: 'INVALID_INPUT',
      message: 'Invalid coordinates provided',
      retryable: false,
    };

    const result = buildErrorResponse(error);

    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Invalid coordinates provided',
        },
      ],
      structuredContent: {
        error,
      },
      isError: true,
    });
  });

  it('should include retry-after in text summary when present', () => {
    const error: WeatherError = {
      code: 'RATE_LIMITED',
      message: 'Rate limit exceeded',
      retryable: true,
      details: {
        retryAfterSeconds: 60,
      },
    };

    const result = buildErrorResponse(error);

    expect(result.content[0].text).toBe(
      'Rate limit exceeded Retry after 60 seconds.'
    );
    expect(result.isError).toBe(true);
  });

  it('should handle error without retry-after', () => {
    const error: WeatherError = {
      code: 'MET_API_UNAVAILABLE',
      message: 'Service temporarily unavailable',
      retryable: true,
      details: {
        upstreamStatus: 503,
      },
    };

    const result = buildErrorResponse(error);

    expect(result.content[0].text).toBe('Service temporarily unavailable');
  });

  it('should handle error without details', () => {
    const error: WeatherError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      retryable: false,
    };

    const result = buildErrorResponse(error);

    expect(result.content[0].text).toBe('An unexpected error occurred');
    expect(result.structuredContent.error).toEqual(error);
  });
});

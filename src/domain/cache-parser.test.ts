/**
 * Unit tests for cache-parser
 * Tests parsing of proxy cache headers
 */

import { describe, it, expect } from 'vitest';
import { parseCacheHeaders } from './cache-parser.js';

describe('parseCacheHeaders', () => {
  describe('X-Proxy-Cache header parsing', () => {
    it('should mark HIT as cached', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'HIT' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(true);
    });

    it('should mark EXPIRED as cached', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'EXPIRED' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(true);
    });

    it('should mark MISS as not cached', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'MISS' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(false);
    });

    it('should mark BYPASS as not cached', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'BYPASS' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(false);
    });

    it('should handle case-insensitive cache status', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'hit' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(true);
    });

    it('should default to not cached when header is missing', () => {
      const headers = new Headers();
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(false);
    });

    it('should default to not cached for unknown cache status', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'UNKNOWN' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(false);
    });
  });

  describe('Age header parsing', () => {
    it('should parse valid Age header', () => {
      const headers = new Headers({ Age: '120' });
      const result = parseCacheHeaders(headers);

      expect(result.ageSeconds).toBe(120);
    });

    it('should parse Age header with value 0', () => {
      const headers = new Headers({ Age: '0' });
      const result = parseCacheHeaders(headers);

      expect(result.ageSeconds).toBe(0);
    });

    it('should return undefined for missing Age header', () => {
      const headers = new Headers();
      const result = parseCacheHeaders(headers);

      expect(result.ageSeconds).toBeUndefined();
    });

    it('should return undefined for invalid Age header', () => {
      const headers = new Headers({ Age: 'invalid' });
      const result = parseCacheHeaders(headers);

      expect(result.ageSeconds).toBeUndefined();
    });

    it('should return undefined for negative Age header', () => {
      const headers = new Headers({ Age: '-10' });
      const result = parseCacheHeaders(headers);

      expect(result.ageSeconds).toBeUndefined();
    });

    it('should parse Age header with decimal (truncated to integer)', () => {
      const headers = new Headers({ Age: '120.5' });
      const result = parseCacheHeaders(headers);

      // parseInt truncates decimals
      expect(result.ageSeconds).toBe(120);
    });
  });

  describe('Combined headers', () => {
    it('should parse both headers correctly', () => {
      const headers = new Headers({
        'X-Proxy-Cache': 'HIT',
        Age: '300',
      });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(true);
      expect(result.ageSeconds).toBe(300);
    });

    it('should handle HIT with missing Age', () => {
      const headers = new Headers({ 'X-Proxy-Cache': 'HIT' });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(true);
      expect(result.ageSeconds).toBeUndefined();
    });

    it('should handle MISS with Age present', () => {
      const headers = new Headers({
        'X-Proxy-Cache': 'MISS',
        Age: '0',
      });
      const result = parseCacheHeaders(headers);

      expect(result.cached).toBe(false);
      expect(result.ageSeconds).toBe(0);
    });
  });
});

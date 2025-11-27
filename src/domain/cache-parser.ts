/**
 * Cache header parser for metno-proxy responses
 */

import type { CacheMetadata } from './types.js';

/**
 * Parse cache metadata from proxy response headers
 *
 * Extracts information about cache status and age from:
 * - X-Proxy-Cache header (HIT, MISS, EXPIRED, BYPASS)
 * - Age header (seconds since response was generated)
 *
 * @param headers - Response headers from proxy
 * @returns Cache metadata object
 */
export function parseCacheHeaders(headers: Headers): CacheMetadata {
  const proxyCacheHeader = headers.get('X-Proxy-Cache');
  const ageHeader = headers.get('Age');

  // Map X-Proxy-Cache values to cached boolean and status
  // HIT = from cache, MISS = not cached, EXPIRED = was cached but stale, BYPASS = cache disabled
  let cached = false;
  let status: 'HIT' | 'MISS' | 'EXPIRED' | 'BYPASS' | undefined;
  if (proxyCacheHeader) {
    const value = proxyCacheHeader.toUpperCase() as 'HIT' | 'MISS' | 'EXPIRED' | 'BYPASS';
    if (['HIT', 'MISS', 'EXPIRED', 'BYPASS'].includes(value)) {
      status = value;
    }
    cached = value === 'HIT' || value === 'EXPIRED';
  }

  // Parse Age header to get cache age in seconds
  let ageSeconds: number | undefined;
  if (ageHeader) {
    const parsed = parseInt(ageHeader, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      ageSeconds = parsed;
    }
  }

  return {
    cached,
    ageSeconds,
    status,
  };
}

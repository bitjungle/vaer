/**
 * Unit tests for attribution
 * Tests MET Norway attribution and source metadata
 */

import { describe, it, expect } from 'vitest';
import { getAttribution, buildSourceMetadata } from './attribution.js';
import type { CacheMetadata } from './types.js';

describe('getAttribution', () => {
  it('should return MET Norway attribution', () => {
    const attribution = getAttribution();

    expect(attribution).toEqual({
      licenseUri: 'https://api.met.no/doc/License',
      creditLine: 'Data from MET Norway Weather API (https://api.met.no/)',
    });
  });

  it('should return consistent attribution on multiple calls', () => {
    const attr1 = getAttribution();
    const attr2 = getAttribution();

    expect(attr1).toEqual(attr2);
  });
});

describe('buildSourceMetadata', () => {
  it('should build source metadata with cached response', () => {
    const cache: CacheMetadata = {
      cached: true,
      ageSeconds: 120,
    };

    const metadata = buildSourceMetadata('Locationforecast 2.0', cache);

    expect(metadata).toEqual({
      provider: 'MET Norway',
      product: 'Locationforecast 2.0',
      licenseUri: 'https://api.met.no/doc/License',
      creditLine: 'Data from MET Norway Weather API (https://api.met.no/)',
      cached: true,
      ageSeconds: 120,
    });
  });

  it('should build source metadata with non-cached response', () => {
    const cache: CacheMetadata = {
      cached: false,
    };

    const metadata = buildSourceMetadata('Nowcast 2.0', cache);

    expect(metadata).toEqual({
      provider: 'MET Norway',
      product: 'Nowcast 2.0',
      licenseUri: 'https://api.met.no/doc/License',
      creditLine: 'Data from MET Norway Weather API (https://api.met.no/)',
      cached: false,
      ageSeconds: undefined,
    });
  });

  it('should handle zero age seconds', () => {
    const cache: CacheMetadata = {
      cached: true,
      ageSeconds: 0,
    };

    const metadata = buildSourceMetadata('Air Quality Forecast 0.1', cache);

    expect(metadata.ageSeconds).toBe(0);
    expect(metadata.cached).toBe(true);
  });

  it('should include product name correctly', () => {
    const cache: CacheMetadata = { cached: false };

    const metadata1 = buildSourceMetadata('Product A', cache);
    const metadata2 = buildSourceMetadata('Product B', cache);

    expect(metadata1.product).toBe('Product A');
    expect(metadata2.product).toBe('Product B');
  });
});

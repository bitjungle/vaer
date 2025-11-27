/**
 * Integration tests for ProxyClient
 * Tests communication with metno-proxy
 *
 * @group integration
 */

import { describe, it, expect } from 'vitest';
import { proxyClient } from './setup.js';

describe('ProxyClient Integration', () => {
  describe('Health Check', () => {
    it('should successfully connect to metno-proxy', async () => {
      const healthy = await proxyClient.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('Fetching Weather Data', () => {
    const osloForecastPath = '/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75';

    it('should fetch Oslo forecast successfully', async () => {
      const response = await proxyClient.fetch(osloForecastPath);

      // Verify response structure
      expect(response.status).toBe(200);
      expect(response.data).toBeDefined();
      expect(typeof response.data).toBe('object');
      expect(response.data).toHaveProperty('properties');
    });

    it('should include cache metadata in response', async () => {
      const response = await proxyClient.fetch(osloForecastPath);

      // Verify cache headers are parsed
      expect(response.cache).toBeDefined();
      expect(typeof response.cache.cached).toBe('boolean');

      // Cache status may be undefined if header not present
      if (response.cache.status) {
        expect(response.cache.status).toMatch(/^(HIT|MISS|EXPIRED|BYPASS)$/);
      }

      // Age may be undefined for first request
      if (response.cache.ageSeconds !== undefined) {
        expect(typeof response.cache.ageSeconds).toBe('number');
        expect(response.cache.ageSeconds).toBeGreaterThanOrEqual(0);
      }
    });

    it('should serve subsequent requests from cache', async () => {
      // First request (may be MISS)
      const response1 = await proxyClient.fetch(osloForecastPath);

      // Second request (should be HIT if within cache TTL)
      const response2 = await proxyClient.fetch(osloForecastPath);

      // At least one should be from cache
      // (first might be cached if proxy was warm)
      const anyCached = response1.cache.cached || response2.cache.cached;
      expect(anyCached).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw WeatherError for 404 Not Found', async () => {
      await expect(
        proxyClient.fetch('/nonexistent-endpoint')
      ).rejects.toMatchObject({
        code: 'INVALID_INPUT', // 404 maps to INVALID_INPUT
        message: expect.any(String),
        retryable: expect.any(Boolean),
      });
    });

    it('should include error context in WeatherError', async () => {
      try {
        await proxyClient.fetch('/invalid/path');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('retryable');
        // requestId is generated internally but not exposed in error
      }
    });
  });
});

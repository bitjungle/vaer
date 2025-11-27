/**
 * Nowcast Tool
 * Provides 2-hour short-term precipitation forecasts for Nordic region using MET Norway's Nowcast API
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildSourceMetadata } from '../domain/attribution.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError, createOutOfCoverageError } from '../domain/error-handler.js';
import { isNordic } from '../domain/coverage-validator.js';
import { logger } from '../domain/logger.js';
import {
  CoordinateSchema,
  LanguageSchema,
  type Coordinate,
} from '../domain/schemas/common.js';

/**
 * Precipitation intensity classification
 */
export const PrecipitationIntensity = z.enum([
  'none',
  'light',
  'moderate',
  'heavy',
]);

export type PrecipitationIntensityType = z.infer<typeof PrecipitationIntensity>;

/**
 * Tool input schema
 */
export const NowcastInputSchema = z.object({
  location: CoordinateSchema,
  language: LanguageSchema,
});

export type NowcastInput = z.infer<typeof NowcastInputSchema>;

/**
 * Nowcast data point schema (similar to weather point but with precipitation_intensity_class)
 */
export const NowcastPointSchema = z.object({
  time: z.string().datetime(),
  air_temperature: z.number().optional(),
  air_temperature_unit: z.literal('C').optional(),
  precipitation_rate: z.number().optional(),
  precipitation_unit: z.literal('mm/h').optional(),
  precipitation_intensity_class: PrecipitationIntensity,
  symbol_code: z.string(),
});

export type NowcastPoint = z.infer<typeof NowcastPointSchema>;

/**
 * Tool output schema
 */
export const NowcastOutputSchema = z.object({
  source: z.object({
    provider: z.literal('MET Norway'),
    product: z.literal('Nowcast 2.0'),
    licenseUri: z.string().url(),
    creditLine: z.string(),
    cached: z.boolean(),
    ageSeconds: z.number().optional(),
  }),
  location: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  timeWindow: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  hours: z.array(NowcastPointSchema),
});

export type NowcastOutput = z.infer<typeof NowcastOutputSchema>;

/**
 * MET API Nowcast response types (compact format)
 */
interface MetNowcastInstant {
  details: {
    air_temperature?: number;
    precipitation_rate?: number;
  };
}

interface MetNowcastNext1Hours {
  summary?: {
    symbol_code: string;
  };
  details?: {
    precipitation_amount?: number;
    precipitation_rate?: number;
  };
}

interface MetNowcastTimeseries {
  time: string;
  data: {
    instant: MetNowcastInstant;
    next_1_hours?: MetNowcastNext1Hours;
  };
}

interface MetNowcastResponse {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number, number];
  };
  properties: {
    meta: {
      updated_at: string;
      units: Record<string, string>;
    };
    timeseries: MetNowcastTimeseries[];
  };
}

/**
 * Classify precipitation intensity
 */
function classifyPrecipitation(
  precipitationRate: number | undefined
): PrecipitationIntensityType {
  if (!precipitationRate || precipitationRate === 0) {
    return 'none';
  }
  if (precipitationRate < 2.5) {
    return 'light';
  }
  if (precipitationRate < 10) {
    return 'moderate';
  }
  return 'heavy';
}

/**
 * Transform MET API response to normalized nowcast points
 */
function transformMetResponse(
  metResponse: MetNowcastResponse
): NowcastPoint[] {
  const points: NowcastPoint[] = [];
  const now = new Date();
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  for (const entry of metResponse.properties.timeseries) {
    const time = new Date(entry.time);

    // Constrain to 2 hours
    if (time > twoHoursLater) {
      continue;
    }

    const instant = entry.data.instant.details;
    const next1h = entry.data.next_1_hours;

    // Get precipitation rate from next_1_hours or instant
    const precipitationRate =
      next1h?.details?.precipitation_rate ?? instant.precipitation_rate;

    // Get symbol code
    const symbolCode = next1h?.summary?.symbol_code ?? 'unknown';

    const point: NowcastPoint = {
      time: entry.time,
      air_temperature: instant.air_temperature,
      air_temperature_unit:
        instant.air_temperature !== undefined ? 'C' : undefined,
      precipitation_rate: precipitationRate,
      precipitation_unit: precipitationRate !== undefined ? 'mm/h' : undefined,
      precipitation_intensity_class: classifyPrecipitation(precipitationRate),
      symbol_code: symbolCode,
    };

    points.push(point);
  }

  return points;
}

/**
 * Generate human-readable text summary
 */
function generateSummary(
  location: Coordinate,
  hours: NowcastPoint[]
): string {
  if (hours.length === 0) {
    return `No nowcast data available for ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E.`;
  }

  // Analyze precipitation
  const precipitationPoints = hours.filter(
    (h) => h.precipitation_intensity_class !== 'none'
  );

  if (precipitationPoints.length === 0) {
    return `No precipitation expected in the next 2 hours at ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E.`;
  }

  // Find max intensity
  const intensities = precipitationPoints.map(
    (p) => p.precipitation_intensity_class
  );
  const hasHeavy = intensities.includes('heavy');
  const hasModerate = intensities.includes('moderate');

  let intensityDescription: string;
  if (hasHeavy) {
    intensityDescription = 'heavy';
  } else if (hasModerate) {
    intensityDescription = 'moderate';
  } else {
    intensityDescription = 'light';
  }

  const startTime = new Date(precipitationPoints[0].time);
  const minutesUntil = Math.round(
    (startTime.getTime() - Date.now()) / (1000 * 60)
  );

  if (minutesUntil <= 0) {
    return `${intensityDescription.charAt(0).toUpperCase() + intensityDescription.slice(1)} precipitation ongoing or starting soon at ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E. Expected to continue for next ${precipitationPoints.length} intervals.`;
  }

  return `${intensityDescription.charAt(0).toUpperCase() + intensityDescription.slice(1)} precipitation expected in ${minutesUntil} minutes at ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E. Duration: ${precipitationPoints.length} intervals.`;
}

/**
 * Nowcast Tool Handler
 */
export async function handleNowcast(
  input: NowcastInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Nowcast tool called', {
      location: input.location,
    });

    // Coverage validation: Nowcast is Nordic only
    if (!isNordic(input.location.lat, input.location.lon)) {
      logger.warn('Location outside Nowcast coverage', {
        location: input.location,
      });

      return buildErrorResponse(
        createOutOfCoverageError(
          'Nowcast is only available for the Nordic region (roughly 55-72°N, 4-32°E). For global forecasts, use weather.get_location_forecast instead.',
          input.location
        )
      );
    }

    // Build API URL
    const params = new URLSearchParams({
      lat: input.location.lat.toString(),
      lon: input.location.lon.toString(),
    });

    const path = `/weatherapi/nowcast/2.0/compact?${params.toString()}`;

    // Call MET API via proxy
    const response = await proxyClient.fetch<MetNowcastResponse>(path);

    // Transform response (constrains to 2 hours)
    const hours = transformMetResponse(response.data);

    // Calculate time window
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Build structured output
    const sourceMetadata = buildSourceMetadata('Nowcast 2.0', response.cache);

    const output: NowcastOutput = {
      source: {
        provider: 'MET Norway' as const,
        product: 'Nowcast 2.0' as const,
        licenseUri: sourceMetadata.licenseUri,
        creditLine: sourceMetadata.creditLine,
        cached: sourceMetadata.cached,
        ageSeconds: sourceMetadata.ageSeconds,
      },
      location: {
        lat: input.location.lat,
        lon: input.location.lon,
      },
      timeWindow: {
        from: now.toISOString(),
        to: twoHoursLater.toISOString(),
      },
      hours,
    };

    // Generate text summary
    const summary = generateSummary(input.location, hours);

    logger.info('Nowcast tool completed', {
      location: input.location,
      dataPoints: hours.length,
      cached: response.cache.cached,
    });

    return buildToolResponse(output, summary);
  } catch (error) {
    logger.error('Nowcast tool error', {
      error: error instanceof Error ? error.message : String(error),
      location: input.location,
    });

    // Re-throw WeatherError as-is
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error
    ) {
      return buildErrorResponse(error as any);
    }

    // Wrap unexpected errors
    return buildErrorResponse(
      createWeatherError(
        'INTERNAL_ERROR',
        'An unexpected error occurred while fetching nowcast data.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

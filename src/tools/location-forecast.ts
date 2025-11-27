/**
 * Location Forecast Tool
 * Provides hourly weather forecasts for any location on Earth using MET Norway's Locationforecast API
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildSourceMetadata } from '../domain/attribution.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError } from '../domain/error-handler.js';
import { logger } from '../domain/logger.js';
import {
  CoordinateSchema,
  TimeWindowSchema,
  LanguageSchema,
  type Coordinate,
  type TimeWindow,
  type TimeWindowPresetType,
} from '../domain/schemas/common.js';

/**
 * Tool input schema
 */
export const LocationForecastInputSchema = z.object({
  location: CoordinateSchema,
  timeWindow: TimeWindowSchema,
  resolution: z
    .enum(['hourly', '3-hourly'])
    .default('hourly')
    .describe('Time resolution for forecast data'),
  includeProbabilistic: z
    .boolean()
    .default(false)
    .describe(
      'Include probabilistic forecasts (10th and 90th percentiles)'
    ),
  language: LanguageSchema,
});

export type LocationForecastInput = z.infer<
  typeof LocationForecastInputSchema
>;

/**
 * Weather data point schema
 */
export const WeatherPointSchema = z.object({
  time: z.string().datetime(),
  air_temperature: z.number(),
  air_temperature_unit: z.literal('C'),
  wind_speed: z.number(),
  wind_speed_unit: z.literal('m/s'),
  wind_direction: z.number().optional(),
  wind_direction_unit: z.literal('degrees').optional(),
  precipitation_rate: z.number().optional(),
  precipitation_unit: z.literal('mm/h').optional(),
  relative_humidity: z.number().optional(),
  relative_humidity_unit: z.literal('%').optional(),
  cloud_area_fraction: z.number().optional(),
  cloud_area_fraction_unit: z.literal('%').optional(),
  symbol_code: z.string(),
  air_temperature_p10: z.number().optional(),
  air_temperature_p90: z.number().optional(),
});

export type WeatherPoint = z.infer<typeof WeatherPointSchema>;

/**
 * Tool output schema
 */
export const LocationForecastOutputSchema = z.object({
  source: z.object({
    provider: z.literal('MET Norway'),
    product: z.literal('Locationforecast 2.0'),
    licenseUri: z.string().url(),
    creditLine: z.string(),
    cached: z.boolean(),
    ageSeconds: z.number().optional(),
  }),
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    altitude: z.number().optional(),
    elevationUsed: z.number().optional(),
  }),
  timeWindow: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  hours: z.array(WeatherPointSchema),
});

export type LocationForecastOutput = z.infer<
  typeof LocationForecastOutputSchema
>;

/**
 * MET API Locationforecast response types (compact format)
 */
interface MetInstant {
  details: {
    air_temperature?: number;
    wind_speed?: number;
    wind_from_direction?: number;
    relative_humidity?: number;
    cloud_area_fraction?: number;
    air_temperature_percentile_10?: number;
    air_temperature_percentile_90?: number;
  };
}

interface MetNext1Hours {
  summary?: {
    symbol_code: string;
  };
  details?: {
    precipitation_amount?: number;
  };
}

interface MetTimeseries {
  time: string;
  data: {
    instant: MetInstant;
    next_1_hours?: MetNext1Hours;
    next_6_hours?: MetNext1Hours;
    next_12_hours?: MetNext1Hours;
  };
}

interface MetLocationForecastResponse {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number, number]; // [lon, lat, elevation]
  };
  properties: {
    meta: {
      updated_at: string;
      units: Record<string, string>;
    };
    timeseries: MetTimeseries[];
  };
}

/**
 * Resolve time window preset to absolute times
 */
function resolveTimeWindow(
  timeWindow: TimeWindow | undefined
): { from: string; to: string } {
  const now = new Date();

  if (!timeWindow || !timeWindow.preset) {
    // Default: next 48 hours
    const from = now.toISOString();
    const to = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    return { from, to };
  }

  const preset = timeWindow.preset;
  const from = now.toISOString();

  let hours: number;
  switch (preset as TimeWindowPresetType) {
    case 'next_24h':
      hours = 24;
      break;
    case 'next_48h':
      hours = 48;
      break;
    case 'next_7d':
      hours = 7 * 24;
      break;
    case 'full_available':
      hours = 10 * 24; // MET provides ~10 days
      break;
    default:
      hours = 48;
  }

  const to = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  return { from, to };
}

/**
 * Transform MET API response to normalized weather points
 */
function transformMetResponse(
  metResponse: MetLocationForecastResponse,
  timeWindow: { from: string; to: string },
  resolution: 'hourly' | '3-hourly',
  includeProbabilistic: boolean
): WeatherPoint[] {
  const fromTime = new Date(timeWindow.from);
  const toTime = new Date(timeWindow.to);

  const points: WeatherPoint[] = [];

  for (const entry of metResponse.properties.timeseries) {
    const time = new Date(entry.time);

    // Filter by time window
    if (time < fromTime || time > toTime) {
      continue;
    }

    const instant = entry.data.instant.details;
    const next1h = entry.data.next_1_hours;

    // Get symbol code from next_1_hours, fallback to next_6_hours or next_12_hours
    const symbolCode =
      next1h?.summary?.symbol_code ||
      entry.data.next_6_hours?.summary?.symbol_code ||
      entry.data.next_12_hours?.summary?.symbol_code ||
      'unknown';

    // Convert precipitation amount (mm) to rate (mm/h)
    // MET gives precipitation_amount for next 1 hour period
    const precipitationRate = next1h?.details?.precipitation_amount;

    const point: WeatherPoint = {
      time: entry.time,
      air_temperature: instant.air_temperature ?? 0,
      air_temperature_unit: 'C',
      wind_speed: instant.wind_speed ?? 0,
      wind_speed_unit: 'm/s',
      wind_direction: instant.wind_from_direction,
      wind_direction_unit:
        instant.wind_from_direction !== undefined ? 'degrees' : undefined,
      precipitation_rate: precipitationRate,
      precipitation_unit: precipitationRate !== undefined ? 'mm/h' : undefined,
      relative_humidity: instant.relative_humidity,
      relative_humidity_unit:
        instant.relative_humidity !== undefined ? '%' : undefined,
      cloud_area_fraction: instant.cloud_area_fraction,
      cloud_area_fraction_unit:
        instant.cloud_area_fraction !== undefined ? '%' : undefined,
      symbol_code: symbolCode,
    };

    // Add probabilistic data if requested
    if (includeProbabilistic) {
      point.air_temperature_p10 = instant.air_temperature_percentile_10;
      point.air_temperature_p90 = instant.air_temperature_percentile_90;
    }

    points.push(point);
  }

  // Down-sample to 3-hourly if requested
  if (resolution === '3-hourly') {
    return points.filter((_, index) => index % 3 === 0);
  }

  return points;
}

/**
 * Generate human-readable text summary
 */
function generateSummary(
  location: Coordinate,
  timeWindow: { from: string; to: string },
  hours: WeatherPoint[]
): string {
  if (hours.length === 0) {
    return `No forecast data available for ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E.`;
  }

  const temps = hours.map((h) => h.air_temperature);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const avgWindSpeed = (
    hours.reduce((sum, h) => sum + h.wind_speed, 0) / hours.length
  ).toFixed(1);

  const fromDate = new Date(timeWindow.from);
  const toDate = new Date(timeWindow.to);
  const durationHours = Math.round(
    (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60)
  );

  return `Forecast for ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E covering ${durationHours} hours: temperatures ${minTemp.toFixed(1)}°C to ${maxTemp.toFixed(1)}°C, average wind speed ${avgWindSpeed} m/s. ${hours.length} data points available.`;
}

/**
 * Location Forecast Tool Handler
 */
export async function handleLocationForecast(
  input: LocationForecastInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Location forecast tool called', {
      location: input.location,
      resolution: input.resolution,
    });

    // Resolve time window
    const timeWindow = resolveTimeWindow(input.timeWindow);

    // Build API URL
    const params = new URLSearchParams({
      lat: input.location.lat.toString(),
      lon: input.location.lon.toString(),
    });

    if (input.location.altitude !== undefined) {
      params.append('altitude', input.location.altitude.toString());
    }

    const path = `/weatherapi/locationforecast/2.0/compact?${params.toString()}`;

    // Call MET API via proxy
    const response = await proxyClient.fetch<MetLocationForecastResponse>(
      path
    );

    // Extract elevation used
    const elevationUsed = response.data.geometry.coordinates[2];

    // Transform response
    const hours = transformMetResponse(
      response.data,
      timeWindow,
      input.resolution,
      input.includeProbabilistic
    );

    // Build source metadata
    const sourceMetadata = buildSourceMetadata(
      'Locationforecast 2.0',
      response.cache
    );

    // Build structured output
    const output: LocationForecastOutput = {
      source: {
        provider: 'MET Norway' as const,
        product: 'Locationforecast 2.0' as const,
        licenseUri: sourceMetadata.licenseUri,
        creditLine: sourceMetadata.creditLine,
        cached: sourceMetadata.cached,
        ageSeconds: sourceMetadata.ageSeconds,
      },
      location: {
        lat: input.location.lat,
        lon: input.location.lon,
        altitude: input.location.altitude,
        elevationUsed,
      },
      timeWindow,
      hours,
    };

    // Generate text summary
    const summary = generateSummary(input.location, timeWindow, hours);

    logger.info('Location forecast tool completed', {
      location: input.location,
      dataPoints: hours.length,
      cached: response.cache.cached,
    });

    return buildToolResponse(output, summary);
  } catch (error) {
    logger.error('Location forecast tool error', {
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
        'An unexpected error occurred while fetching forecast data.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

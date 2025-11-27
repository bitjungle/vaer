/**
 * Air Quality Tool
 * Provides air quality forecasts and AQI for Norwegian locations using MET Norway's Air Quality API
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildSourceMetadata } from '../domain/attribution.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError, createOutOfCoverageError } from '../domain/error-handler.js';
import { isNorway } from '../domain/coverage-validator.js';
import { logger } from '../domain/logger.js';
import {
  CoordinateSchema,
  TimeWindowSchema,
  LanguageSchema,
  type Coordinate,
} from '../domain/schemas/common.js';

/**
 * AQI (Air Quality Index) categories
 */
export const AQICategory = z.enum([
  'good',
  'fair',
  'moderate',
  'poor',
  'very_poor',
]);

export type AQICategoryType = z.infer<typeof AQICategory>;

/**
 * Area class for air quality data
 */
export const AreaClass = z.enum([
  'kommune',
  'delomrade',
  'grunnkrets',
  'fylke',
]);

export type AreaClassType = z.infer<typeof AreaClass>;

/**
 * Tool input schema
 */
export const AirQualityInputSchema = z.object({
  location: CoordinateSchema,
  timeWindow: TimeWindowSchema,
  areaClass: AreaClass.optional().describe(
    'Area classification for aggregation (optional)'
  ),
  language: LanguageSchema,
});

export type AirQualityInput = z.infer<typeof AirQualityInputSchema>;

/**
 * Pollutant data schema
 */
export const PollutantSchema = z.object({
  value: z.number(),
  unit: z.literal('µg/m³'),
});

export type Pollutant = z.infer<typeof PollutantSchema>;

/**
 * Air quality data point schema
 */
export const AirQualityPointSchema = z.object({
  time: z.string().datetime(),
  aqi: AQICategory,
  aqi_numeric: z.number().optional(),
  dominant_pollutant: z.string().optional(),
  pm25: PollutantSchema.optional(),
  pm10: PollutantSchema.optional(),
  no2: PollutantSchema.optional(),
  o3: PollutantSchema.optional(),
  advice: z.string().optional(),
});

export type AirQualityPoint = z.infer<typeof AirQualityPointSchema>;

/**
 * Tool output schema
 */
export const AirQualityOutputSchema = z.object({
  source: z.object({
    provider: z.literal('MET Norway'),
    product: z.literal('Air Quality Forecast 0.1'),
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
  hours: z.array(AirQualityPointSchema),
});

export type AirQualityOutput = z.infer<typeof AirQualityOutputSchema>;

/**
 * MET API Air Quality response types
 */
interface MetAirQualityData {
  time: string;
  variables: {
    AQI?: {
      value: number;
      units: string;
    };
    AQI_no2?: {
      value: number;
      units: string;
    };
    AQI_o3?: {
      value: number;
      units: string;
    };
    AQI_pm10?: {
      value: number;
      units: string;
    };
    AQI_pm25?: {
      value: number;
      units: string;
    };
    pm25_concentration?: {
      value: number;
      units: string;
    };
    pm10_concentration?: {
      value: number;
      units: string;
    };
    no2_concentration?: {
      value: number;
      units: string;
    };
    o3_concentration?: {
      value: number;
      units: string;
    };
  };
}

interface MetAirQualityResponse {
  data: {
    time: MetAirQualityData[];
  };
}

/**
 * Map numeric AQI to category
 */
function mapAQIToCategory(aqi: number): AQICategoryType {
  if (aqi <= 1) return 'good';
  if (aqi <= 2) return 'fair';
  if (aqi <= 3) return 'moderate';
  if (aqi <= 4) return 'poor';
  return 'very_poor';
}

/**
 * Determine dominant pollutant from AQI values
 */
function getDominantPollutant(variables: MetAirQualityData['variables']): string | undefined {
  const pollutants = [
    { name: 'PM2.5', aqi: variables.AQI_pm25?.value },
    { name: 'PM10', aqi: variables.AQI_pm10?.value },
    { name: 'NO2', aqi: variables.AQI_no2?.value },
    { name: 'O3', aqi: variables.AQI_o3?.value },
  ];

  const sorted = pollutants
    .filter((p) => p.aqi !== undefined)
    .sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0));

  return sorted.length > 0 ? sorted[0].name : undefined;
}

/**
 * Generate advice based on AQI category
 */
function generateAdvice(category: AQICategoryType): string {
  switch (category) {
    case 'good':
      return 'Air quality is satisfactory. No health implications.';
    case 'fair':
      return 'Air quality is acceptable. Unusually sensitive individuals may experience minor symptoms.';
    case 'moderate':
      return 'Sensitive groups (children, elderly, respiratory conditions) should reduce prolonged outdoor activities.';
    case 'poor':
      return 'Everyone may begin to experience health effects. Sensitive groups should avoid outdoor activities.';
    case 'very_poor':
      return 'Health alert: everyone may experience serious health effects. Avoid outdoor activities.';
  }
}

/**
 * Transform MET API response to normalized air quality points
 */
function transformMetResponse(
  metResponse: MetAirQualityResponse,
  timeWindow?: { from: string; to: string }
): AirQualityPoint[] {
  const points: AirQualityPoint[] = [];

  const fromTime = timeWindow ? new Date(timeWindow.from) : undefined;
  const toTime = timeWindow ? new Date(timeWindow.to) : undefined;

  for (const entry of metResponse.data.time) {
    const time = new Date(entry.time);

    // Filter by time window if provided
    if (fromTime && time < fromTime) continue;
    if (toTime && time > toTime) continue;

    const aqiNumeric = entry.variables.AQI?.value;
    if (aqiNumeric === undefined) continue;

    const category = mapAQIToCategory(aqiNumeric);
    const dominantPollutant = getDominantPollutant(entry.variables);

    const point: AirQualityPoint = {
      time: entry.time,
      aqi: category,
      aqi_numeric: aqiNumeric,
      dominant_pollutant: dominantPollutant,
      pm25: entry.variables.pm25_concentration
        ? { value: entry.variables.pm25_concentration.value, unit: 'µg/m³' }
        : undefined,
      pm10: entry.variables.pm10_concentration
        ? { value: entry.variables.pm10_concentration.value, unit: 'µg/m³' }
        : undefined,
      no2: entry.variables.no2_concentration
        ? { value: entry.variables.no2_concentration.value, unit: 'µg/m³' }
        : undefined,
      o3: entry.variables.o3_concentration
        ? { value: entry.variables.o3_concentration.value, unit: 'µg/m³' }
        : undefined,
      advice: generateAdvice(category),
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
  hours: AirQualityPoint[]
): string {
  if (hours.length === 0) {
    return `No air quality data available for ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E.`;
  }

  const currentPoint = hours[0];
  const worstPoint = hours.reduce((worst, point) =>
    (point.aqi_numeric ?? 0) > (worst.aqi_numeric ?? 0) ? point : worst
  );

  let summary = `Air quality at ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E: currently ${currentPoint.aqi}`;

  if (currentPoint.dominant_pollutant) {
    summary += ` (dominant pollutant: ${currentPoint.dominant_pollutant})`;
  }

  if (worstPoint.aqi !== currentPoint.aqi) {
    summary += `. Worst forecast: ${worstPoint.aqi}`;
  }

  summary += `. ${currentPoint.advice}`;

  return summary;
}

/**
 * Air Quality Tool Handler
 */
export async function handleAirQuality(
  input: AirQualityInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Air quality tool called', {
      location: input.location,
    });

    // Coverage validation: Air quality is Norway only
    if (!isNorway(input.location.lat, input.location.lon)) {
      logger.warn('Location outside air quality coverage', {
        location: input.location,
      });

      return buildErrorResponse(
        createOutOfCoverageError(
          'Air quality forecasts are only available for Norway (roughly 58-71°N, 4-31°E).',
          input.location
        )
      );
    }

    // Build API URL
    const params = new URLSearchParams({
      lat: input.location.lat.toString(),
      lon: input.location.lon.toString(),
    });

    if (input.areaClass) {
      params.append('areaclass', input.areaClass);
    }

    const path = `/weatherapi/airqualityforecast/0.1/?${params.toString()}`;

    // Call MET API via proxy
    const response = await proxyClient.fetch<MetAirQualityResponse>(path);

    // Resolve time window
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const timeWindow = input.timeWindow?.preset
      ? { from: now.toISOString(), to: tomorrow.toISOString() }
      : undefined;

    // Transform response
    const hours = transformMetResponse(response.data, timeWindow);

    // Build structured output
    const sourceMetadata = buildSourceMetadata(
      'Air Quality Forecast 0.1',
      response.cache
    );

    const output: AirQualityOutput = {
      source: {
        provider: 'MET Norway' as const,
        product: 'Air Quality Forecast 0.1' as const,
        licenseUri: sourceMetadata.licenseUri,
        creditLine: sourceMetadata.creditLine,
        cached: sourceMetadata.cached,
        ageSeconds: sourceMetadata.ageSeconds,
      },
      location: {
        lat: input.location.lat,
        lon: input.location.lon,
      },
      timeWindow: timeWindow ?? {
        from: now.toISOString(),
        to: tomorrow.toISOString(),
      },
      hours,
    };

    // Generate text summary
    const summary = generateSummary(input.location, hours);

    logger.info('Air quality tool completed', {
      location: input.location,
      dataPoints: hours.length,
      cached: response.cache.cached,
    });

    return buildToolResponse(output, summary);
  } catch (error) {
    logger.error('Air quality tool error', {
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
        'An unexpected error occurred while fetching air quality data.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

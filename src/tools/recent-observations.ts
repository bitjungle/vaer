/**
 * Recent Observations Tool
 * Provides recent observed weather data using MET Norway's Frost API
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { FrostClient } from '../domain/frost-client.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError } from '../domain/error-handler.js';
import { logger } from '../domain/logger.js';
import { LanguageSchema } from '../domain/schemas/common.js';

/**
 * Location specification (either coordinates with radius OR station ID)
 */
export const ObservationLocationSchema = z.union([
  z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radiusKm: z.number().min(0).max(100).default(10),
  }),
  z.object({
    stationId: z.string().describe('Station ID (e.g., SN18700 for Oslo-Blindern)'),
  }),
]);

export type ObservationLocation = z.infer<typeof ObservationLocationSchema>;

/**
 * Weather elements to observe
 */
export const WeatherElement = z.enum([
  'air_temperature',
  'wind_speed',
  'wind_from_direction',
  'precipitation_amount',
  'relative_humidity',
  'air_pressure_at_sea_level',
]);

export type WeatherElementType = z.infer<typeof WeatherElement>;

/**
 * Tool input schema
 */
export const RecentObservationsInputSchema = z.object({
  location: ObservationLocationSchema,
  elements: z.array(WeatherElement).default(['air_temperature', 'wind_speed']),
  maxDays: z.number().min(1).max(7).default(1).describe('Maximum days of historical data'),
  language: LanguageSchema,
});

export type RecentObservationsInput = z.infer<typeof RecentObservationsInputSchema>;

/**
 * Observation data point schema
 */
export const ObservationPointSchema = z.object({
  time: z.string().datetime(),
  stationId: z.string(),
  stationName: z.string().optional(),
  elevation: z.number().optional(),
  air_temperature: z.number().optional(),
  air_temperature_unit: z.literal('°C').optional(),
  wind_speed: z.number().optional(),
  wind_speed_unit: z.literal('m/s').optional(),
  wind_from_direction: z.number().optional(),
  precipitation_amount: z.number().optional(),
  precipitation_amount_unit: z.literal('mm').optional(),
  relative_humidity: z.number().optional(),
  relative_humidity_unit: z.literal('%').optional(),
  air_pressure_at_sea_level: z.number().optional(),
  air_pressure_at_sea_level_unit: z.literal('hPa').optional(),
});

export type ObservationPoint = z.infer<typeof ObservationPointSchema>;

/**
 * Tool output schema
 */
export const RecentObservationsOutputSchema = z.object({
  source: z.object({
    provider: z.literal('MET Norway'),
    product: z.literal('Frost API'),
    licenseUri: z.string().url(),
    creditLine: z.string(),
    cached: z.boolean(),
  }),
  location: z.union([
    z.object({ lat: z.number(), lon: z.number(), radiusKm: z.number() }),
    z.object({ stationId: z.string() }),
  ]),
  timeWindow: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  observations: z.array(ObservationPointSchema),
});

export type RecentObservationsOutput = z.infer<typeof RecentObservationsOutputSchema>;

/**
 * Frost API observation response types
 */
interface FrostObservation {
  sourceId: string;
  referenceTime: string;
  observations: Array<{
    elementId: string;
    value: number;
    unit: string;
    timeOffset?: string;
  }>;
}

interface FrostSource {
  id: string;
  name?: string;
  geometry?: {
    coordinates: [number, number];
    elevation?: number;
  };
}

interface FrostObservationsResponse {
  '@type': 'ObservationResponse';
  data: FrostObservation[];
  sourceIds?: string[];
}

interface FrostSourcesResponse {
  '@type': 'SourcesResponse';
  data: FrostSource[];
}

/**
 * Transform Frost observations to normalized format
 */
function transformFrostObservations(
  frostData: FrostObservation[],
  sources: Map<string, FrostSource>
): ObservationPoint[] {
  const points: ObservationPoint[] = [];

  // Group observations by time and station
  const grouped = new Map<string, Map<string, FrostObservation>>();

  for (const obs of frostData) {
    const key = `${obs.referenceTime}:${obs.sourceId}`;
    if (!grouped.has(key)) {
      grouped.set(key, new Map());
    }
    grouped.get(key)!.set(obs.sourceId, obs);
  }

  // Transform each group into an observation point
  for (const [key, group] of grouped) {
    const [time, sourceId] = key.split(':');
    const source = sources.get(sourceId);

    const point: ObservationPoint = {
      time,
      stationId: sourceId,
      stationName: source?.name,
      elevation: source?.geometry?.elevation,
    };

    // Extract observation values
    for (const obs of group.values()) {
      for (const observation of obs.observations) {
        switch (observation.elementId) {
          case 'air_temperature':
            point.air_temperature = observation.value;
            point.air_temperature_unit = '°C' as const;
            break;
          case 'wind_speed':
            point.wind_speed = observation.value;
            point.wind_speed_unit = 'm/s' as const;
            break;
          case 'wind_from_direction':
            point.wind_from_direction = observation.value;
            break;
          case 'sum(precipitation_amount PT1H)':
          case 'precipitation_amount':
            point.precipitation_amount = observation.value;
            point.precipitation_amount_unit = 'mm' as const;
            break;
          case 'relative_humidity':
            point.relative_humidity = observation.value;
            point.relative_humidity_unit = '%' as const;
            break;
          case 'air_pressure_at_sea_level':
            point.air_pressure_at_sea_level = observation.value;
            point.air_pressure_at_sea_level_unit = 'hPa' as const;
            break;
        }
      }
    }

    points.push(point);
  }

  // Sort by time (most recent first)
  points.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return points;
}

/**
 * Generate human-readable text summary
 */
function generateSummary(
  location: ObservationLocation,
  observations: ObservationPoint[]
): string {
  if (observations.length === 0) {
    const locationStr = 'stationId' in location
      ? `station ${location.stationId}`
      : `${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E`;
    return `No recent observations available for ${locationStr}.`;
  }

  const latest = observations[0];
  const locationStr = latest.stationName || latest.stationId;

  let summary = `Recent observations from ${locationStr}:\n`;

  if (latest.air_temperature !== undefined) {
    summary += `Temperature: ${latest.air_temperature.toFixed(1)}°C\n`;
  }
  if (latest.wind_speed !== undefined) {
    summary += `Wind: ${latest.wind_speed.toFixed(1)} m/s`;
    if (latest.wind_from_direction !== undefined) {
      summary += ` from ${latest.wind_from_direction}°`;
    }
    summary += '\n';
  }
  if (latest.precipitation_amount !== undefined) {
    summary += `Precipitation: ${latest.precipitation_amount.toFixed(1)} mm\n`;
  }

  summary += `Total observations: ${observations.length}`;

  return summary;
}

/**
 * Recent Observations Tool Handler
 */
export async function handleRecentObservations(
  input: RecentObservationsInput,
  frostClient: FrostClient
): Promise<CallToolResult> {
  try {
    logger.debug('Recent observations tool called', {
      location: input.location,
      elements: input.elements,
      maxDays: input.maxDays,
    });

    // Build time window
    const now = new Date();
    const from = new Date(now.getTime() - input.maxDays * 24 * 60 * 60 * 1000);
    const timeWindow = {
      from: from.toISOString(),
      to: now.toISOString(),
    };

    // Build sources parameter
    let sourcesParam: string;
    if ('stationId' in input.location) {
      sourcesParam = input.location.stationId;
    } else {
      // For lat/lon, we need to find nearby stations first
      const nearbyPath = `/sources/v0.jsonld?geometry=nearest(POINT(${input.location.lon} ${input.location.lat}))&maxdistance=${input.location.radiusKm * 1000}&types=SensorSystem`;

      const sourcesResponse = await frostClient.fetch<FrostSourcesResponse>(nearbyPath);

      if (!sourcesResponse.data.data || sourcesResponse.data.data.length === 0) {
        return buildErrorResponse(
          createWeatherError(
            'OUT_OF_COVERAGE',
            `No observation stations found within ${input.location.radiusKm}km of the specified location.`,
            { location: input.location }
          )
        );
      }

      sourcesParam = sourcesResponse.data.data.map((s) => s.id).join(',');
    }

    // Build observations request
    const elementsParam = input.elements.join(',');
    const obsPath = `/observations/v0.jsonld?sources=${sourcesParam}&elements=${elementsParam}&referencetime=${timeWindow.from}/${timeWindow.to}`;

    // Fetch observations
    const obsResponse = await frostClient.fetch<FrostObservationsResponse>(obsPath);

    // Fetch source metadata
    const sourceIds = [...new Set(obsResponse.data.data.map((obs) => obs.sourceId))];
    const sourcesMetaPath = `/sources/v0.jsonld?ids=${sourceIds.join(',')}`;
    const sourcesMetaResponse = await frostClient.fetch<FrostSourcesResponse>(sourcesMetaPath);

    const sourcesMap = new Map<string, FrostSource>();
    for (const source of sourcesMetaResponse.data.data) {
      sourcesMap.set(source.id, source);
    }

    // Transform observations
    const observations = transformFrostObservations(obsResponse.data.data, sourcesMap);

    // Build structured output
    const output: RecentObservationsOutput = {
      source: {
        provider: 'MET Norway' as const,
        product: 'Frost API' as const,
        licenseUri: 'https://creativecommons.org/licenses/by/4.0/',
        creditLine: 'Data from MET Norway Frost API (https://frost.met.no/)',
        cached: false,
      },
      location: input.location,
      timeWindow,
      observations,
    };

    // Generate text summary
    const summary = generateSummary(input.location, observations);

    logger.info('Recent observations tool completed', {
      location: input.location,
      observationCount: observations.length,
    });

    return buildToolResponse(output, summary);
  } catch (error) {
    logger.error('Recent observations tool error', {
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
        'An unexpected error occurred while fetching observation data.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

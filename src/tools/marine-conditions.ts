/**
 * Marine Conditions Tool
 * Provides marine weather conditions for coastal Norwegian locations using MET Norway's Oceanforecast API
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildSourceMetadata } from '../domain/attribution.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError, createOutOfCoverageError } from '../domain/error-handler.js';
import { isCoastalNorway } from '../domain/coverage-validator.js';
import { logger } from '../domain/logger.js';
import {
  CoordinateSchema,
  TimeWindowSchema,
  LanguageSchema,
  type Coordinate,
} from '../domain/schemas/common.js';

/**
 * Vessel type for risk assessment
 */
export const VesselType = z.enum(['kayak', 'small_sailboat', 'motorboat', 'ship']);

export type VesselTypeType = z.infer<typeof VesselType>;

/**
 * Risk level categories
 */
export const RiskLevel = z.enum(['low', 'moderate', 'high', 'extreme']);

export type RiskLevelType = z.infer<typeof RiskLevel>;

/**
 * Tool input schema
 */
export const MarineConditionsInputSchema = z.object({
  location: CoordinateSchema,
  timeWindow: TimeWindowSchema,
  vesselType: VesselType,
  language: LanguageSchema,
});

export type MarineConditionsInput = z.infer<typeof MarineConditionsInputSchema>;

/**
 * Marine conditions data point schema
 */
export const MarineConditionsPointSchema = z.object({
  time: z.string().datetime(),
  wave_height: z.number().describe('Significant wave height in meters'),
  wave_height_unit: z.literal('m'),
  wave_direction: z.number().describe('Wave direction in degrees'),
  water_temperature: z.number().describe('Sea surface temperature'),
  water_temperature_unit: z.literal('°C'),
  water_speed: z.number().describe('Sea current speed'),
  water_speed_unit: z.literal('m/s'),
  water_direction: z.number().describe('Current direction in degrees'),
  risk_level: RiskLevel,
  risk_notes: z.string().optional(),
});

export type MarineConditionsPoint = z.infer<typeof MarineConditionsPointSchema>;

/**
 * Tool output schema
 */
export const MarineConditionsOutputSchema = z.object({
  source: z.object({
    provider: z.literal('MET Norway'),
    product: z.literal('Oceanforecast 2.0'),
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
  vesselType: VesselType,
  hours: z.array(MarineConditionsPointSchema),
});

export type MarineConditionsOutput = z.infer<typeof MarineConditionsOutputSchema>;

/**
 * MET API Oceanforecast response types
 */
interface MetOceanforecastData {
  time: string;
  data: {
    instant: {
      details: {
        sea_surface_wave_from_direction?: number;
        sea_surface_wave_height?: number;
        sea_water_speed?: number;
        sea_water_temperature?: number;
        sea_water_to_direction?: number;
      };
    };
  };
}

interface MetOceanforecastResponse {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    meta: {
      updated_at: string;
      units: Record<string, string>;
    };
    timeseries: MetOceanforecastData[];
  };
}

/**
 * Risk assessment thresholds by vessel type
 */
const RISK_THRESHOLDS = {
  kayak: {
    low: { wave: 0.3, current: 0.5 },
    moderate: { wave: 0.5, current: 1.0 },
    high: { wave: 0.8, current: 1.5 },
  },
  small_sailboat: {
    low: { wave: 0.5, current: 1.0 },
    moderate: { wave: 1.0, current: 2.0 },
    high: { wave: 1.5, current: 3.0 },
  },
  motorboat: {
    low: { wave: 0.8, current: 1.5 },
    moderate: { wave: 1.5, current: 2.5 },
    high: { wave: 2.0, current: 4.0 },
  },
  ship: {
    low: { wave: 2.0, current: 3.0 },
    moderate: { wave: 3.5, current: 5.0 },
    high: { wave: 5.0, current: 7.0 },
  },
};

/**
 * Assess risk level based on conditions and vessel type
 */
function assessRiskLevel(
  waveHeight: number,
  waterSpeed: number,
  vesselType: VesselTypeType
): { level: RiskLevelType; notes?: string } {
  const thresholds = RISK_THRESHOLDS[vesselType];

  const notes: string[] = [];

  if (waveHeight >= thresholds.high.wave || waterSpeed >= thresholds.high.current) {
    if (waveHeight >= thresholds.high.wave) {
      notes.push(`High wave conditions (${waveHeight.toFixed(1)}m)`);
    }
    if (waterSpeed >= thresholds.high.current) {
      notes.push(`Strong currents (${waterSpeed.toFixed(1)}m/s)`);
    }
    return { level: 'high', notes: notes.join('; ') };
  }

  if (waveHeight >= thresholds.moderate.wave || waterSpeed >= thresholds.moderate.current) {
    if (waveHeight >= thresholds.moderate.wave) {
      notes.push(`Moderate wave conditions (${waveHeight.toFixed(1)}m)`);
    }
    if (waterSpeed >= thresholds.moderate.current) {
      notes.push(`Moderate currents (${waterSpeed.toFixed(1)}m/s)`);
    }
    return { level: 'moderate', notes: notes.join('; ') };
  }

  if (waveHeight >= thresholds.low.wave || waterSpeed >= thresholds.low.current) {
    return { level: 'low', notes: 'Generally favorable conditions with minor hazards' };
  }

  return { level: 'low', notes: 'Calm conditions, ideal for sailing' };
}

/**
 * Transform MET API response to normalized marine conditions points
 */
function transformMetResponse(
  metResponse: MetOceanforecastResponse,
  timeWindow: { from: string; to: string },
  vesselType: VesselTypeType
): MarineConditionsPoint[] {
  const points: MarineConditionsPoint[] = [];

  const fromTime = new Date(timeWindow.from);
  const toTime = new Date(timeWindow.to);

  for (const entry of metResponse.properties.timeseries) {
    const time = new Date(entry.time);

    // Filter by time window
    if (time < fromTime || time > toTime) continue;

    const details = entry.data.instant.details;

    const waveHeight = details.sea_surface_wave_height ?? 0;
    const waterSpeed = details.sea_water_speed ?? 0;
    const { level, notes } = assessRiskLevel(waveHeight, waterSpeed, vesselType);

    const point: MarineConditionsPoint = {
      time: entry.time,
      wave_height: waveHeight,
      wave_height_unit: 'm' as const,
      wave_direction: details.sea_surface_wave_from_direction ?? 0,
      water_temperature: details.sea_water_temperature ?? 0,
      water_temperature_unit: '°C' as const,
      water_speed: waterSpeed,
      water_speed_unit: 'm/s' as const,
      water_direction: details.sea_water_to_direction ?? 0,
      risk_level: level,
      risk_notes: notes,
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
  vesselType: VesselTypeType,
  hours: MarineConditionsPoint[]
): string {
  if (hours.length === 0) {
    return `No marine conditions data available for ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E.`;
  }

  const currentPoint = hours[0];
  const highestRiskPoint = hours.reduce((worst, point) => {
    const riskOrder = { low: 0, moderate: 1, high: 2, extreme: 3 };
    return riskOrder[point.risk_level] > riskOrder[worst.risk_level] ? point : worst;
  });

  let summary = `Marine conditions for ${vesselType} at ${location.lat.toFixed(2)}°N, ${location.lon.toFixed(2)}°E:\n`;
  summary += `Current: ${currentPoint.wave_height.toFixed(1)}m waves, ${currentPoint.water_temperature.toFixed(1)}°C water temp, ${currentPoint.risk_level} risk.\n`;

  if (highestRiskPoint.risk_level !== currentPoint.risk_level) {
    summary += `Peak risk: ${highestRiskPoint.risk_level} conditions expected.\n`;
  }

  if (currentPoint.risk_notes) {
    summary += `${currentPoint.risk_notes}`;
  }

  return summary;
}

/**
 * Resolve time window with defaults
 */
function resolveTimeWindow(
  timeWindow?: { preset?: string; from?: string; to?: string }
): { from: string; to: string } {
  const now = new Date();

  if (!timeWindow || !timeWindow.preset) {
    // Default: next 48 hours
    const to = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    return { from: now.toISOString(), to: to.toISOString() };
  }

  switch (timeWindow.preset) {
    case 'next_24h': {
      const to = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return { from: now.toISOString(), to: to.toISOString() };
    }
    case 'next_48h': {
      const to = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      return { from: now.toISOString(), to: to.toISOString() };
    }
    default:
      // Default to 48h
      const to = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      return { from: now.toISOString(), to: to.toISOString() };
  }
}

/**
 * Marine Conditions Tool Handler
 */
export async function handleMarineConditions(
  input: MarineConditionsInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Marine conditions tool called', {
      location: input.location,
      vesselType: input.vesselType,
    });

    // Coverage validation: Marine conditions only for coastal Norway
    if (!isCoastalNorway(input.location.lat, input.location.lon)) {
      logger.warn('Location outside marine conditions coverage', {
        location: input.location,
      });

      return buildErrorResponse(
        createOutOfCoverageError(
          'Marine conditions are only available for coastal Norway (Oslo Fjord 59-60.5°N, 10-11.5°E and Western Coast 58-63°N, 4.5-8°E).',
          input.location
        )
      );
    }

    // Resolve time window
    const timeWindow = resolveTimeWindow(input.timeWindow);

    // Build API URL
    const path = `/weatherapi/oceanforecast/2.0/complete?lat=${input.location.lat}&lon=${input.location.lon}`;

    // Call MET API via proxy
    const response = await proxyClient.fetch<MetOceanforecastResponse>(path);

    // Transform response
    const hours = transformMetResponse(response.data, timeWindow, input.vesselType);

    // Build structured output
    const sourceMetadata = buildSourceMetadata(
      'Oceanforecast 2.0',
      response.cache
    );

    const output: MarineConditionsOutput = {
      source: {
        provider: 'MET Norway' as const,
        product: 'Oceanforecast 2.0' as const,
        licenseUri: sourceMetadata.licenseUri,
        creditLine: sourceMetadata.creditLine,
        cached: sourceMetadata.cached,
        ageSeconds: sourceMetadata.ageSeconds,
      },
      location: {
        lat: input.location.lat,
        lon: input.location.lon,
      },
      timeWindow,
      vesselType: input.vesselType,
      hours,
    };

    // Generate text summary
    const summary = generateSummary(input.location, input.vesselType, hours);

    logger.info('Marine conditions tool completed', {
      location: input.location,
      vesselType: input.vesselType,
      dataPoints: hours.length,
      cached: response.cache.cached,
    });

    return buildToolResponse(output, summary);
  } catch (error) {
    logger.error('Marine conditions tool error', {
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
        'An unexpected error occurred while fetching marine conditions.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

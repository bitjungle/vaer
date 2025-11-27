/**
 * Assess Outdoor Activity Window Tool
 * Opinionated service that scores weather conditions for outdoor activities
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError } from '../domain/error-handler.js';
import { logger } from '../domain/logger.js';
import {
  CoordinateSchema,
  TimeWindowSchema,
  LanguageSchema,
} from '../domain/schemas/common.js';
import {
  handleLocationForecast,
  type LocationForecastInput,
} from './location-forecast.js';
import {
  handleNowcast,
  type NowcastInput,
} from './nowcast.js';

/**
 * Activity types with predefined thresholds
 */
export const ActivityType = z.enum([
  'running',
  'cycling',
  'hiking',
  'kids_playground',
  'commuting',
  'custom',
]);

export type ActivityTypeType = z.infer<typeof ActivityType>;

/**
 * Comfort score levels
 */
export const ComfortScore = z.enum(['good', 'ok', 'poor']);

export type ComfortScoreType = z.infer<typeof ComfortScore>;

/**
 * Custom preferences for activity assessment
 */
export const PreferencesSchema = z
  .object({
    minTemp: z.number().optional().describe('Minimum acceptable temperature (°C)'),
    maxTemp: z.number().optional().describe('Maximum acceptable temperature (°C)'),
    maxWind: z.number().optional().describe('Maximum acceptable wind speed (m/s)'),
    avoidRain: z.boolean().optional().describe('Whether to avoid any rain'),
    avoidHeavyRain: z.boolean().optional().describe('Whether to avoid heavy rain only'),
  })
  .optional();

export type Preferences = z.infer<typeof PreferencesSchema>;

/**
 * Tool input schema
 */
export const AssessOutdoorActivityInputSchema = z.object({
  location: CoordinateSchema,
  activity: ActivityType,
  timeWindow: TimeWindowSchema,
  preferences: PreferencesSchema,
  language: LanguageSchema,
});

export type AssessOutdoorActivityInput = z.infer<
  typeof AssessOutdoorActivityInputSchema
>;

/**
 * Comfort slot schema
 */
export const ComfortSlotSchema = z.object({
  time: z.string().datetime(),
  score: ComfortScore,
  temperature: z.number(),
  temperature_unit: z.literal('°C'),
  wind_speed: z.number(),
  wind_speed_unit: z.literal('m/s'),
  precipitation_rate: z.number(),
  precipitation_unit: z.literal('mm/h'),
  temperature_ok: z.boolean(),
  wind_ok: z.boolean(),
  precipitation_ok: z.boolean(),
  reason: z.string(),
});

export type ComfortSlot = z.infer<typeof ComfortSlotSchema>;

/**
 * Tool output schema
 */
export const AssessOutdoorActivityOutputSchema = z.object({
  location: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  activity: ActivityType,
  timeWindow: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  slots: z.array(ComfortSlotSchema),
  bestWindows: z.array(
    z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
      duration_hours: z.number(),
    })
  ),
  summary: z.string(),
});

export type AssessOutdoorActivityOutput = z.infer<
  typeof AssessOutdoorActivityOutputSchema
>;

/**
 * Activity thresholds type
 */
interface ActivityThresholds {
  minTemp: number;
  maxTemp: number;
  maxWind: number;
  avoidHeavyRain: boolean;
}

/**
 * Activity-specific thresholds
 */
const ACTIVITY_THRESHOLDS: Record<
  Exclude<ActivityTypeType, 'custom'>,
  ActivityThresholds
> = {
  running: {
    minTemp: 5,
    maxTemp: 20,
    maxWind: 10,
    avoidHeavyRain: true,
  },
  cycling: {
    minTemp: 8,
    maxTemp: 25,
    maxWind: 12,
    avoidHeavyRain: true,
  },
  hiking: {
    minTemp: 5,
    maxTemp: 25,
    maxWind: 15,
    avoidHeavyRain: false,
  },
  kids_playground: {
    minTemp: 10,
    maxTemp: 28,
    maxWind: 8,
    avoidHeavyRain: true,
  },
  commuting: {
    minTemp: -10,
    maxTemp: 35,
    maxWind: 20,
    avoidHeavyRain: false,
  },
};

/**
 * Get thresholds for activity (with custom preferences override)
 */
function getThresholds(
  activity: ActivityTypeType,
  customPreferences?: Preferences
): ActivityThresholds {
  const baseThresholds =
    activity === 'custom'
      ? {
          minTemp: customPreferences?.minTemp ?? 5,
          maxTemp: customPreferences?.maxTemp ?? 25,
          maxWind: customPreferences?.maxWind ?? 15,
          avoidHeavyRain: customPreferences?.avoidHeavyRain ?? false,
        }
      : ACTIVITY_THRESHOLDS[activity];

  // Apply custom overrides
  if (customPreferences) {
    return {
      minTemp: customPreferences.minTemp ?? baseThresholds.minTemp,
      maxTemp: customPreferences.maxTemp ?? baseThresholds.maxTemp,
      maxWind: customPreferences.maxWind ?? baseThresholds.maxWind,
      avoidHeavyRain:
        customPreferences.avoidHeavyRain ?? baseThresholds.avoidHeavyRain,
    };
  }

  return baseThresholds;
}

/**
 * Assess comfort score for a single time slot
 */
function assessComfort(
  temperature: number,
  windSpeed: number,
  precipitationRate: number,
  thresholds: ActivityThresholds,
  avoidAllRain: boolean
): {
  score: ComfortScoreType;
  temperature_ok: boolean;
  wind_ok: boolean;
  precipitation_ok: boolean;
  reason: string;
} {
  const temperature_ok =
    temperature >= thresholds.minTemp && temperature <= thresholds.maxTemp;
  const wind_ok = windSpeed <= thresholds.maxWind;

  let precipitation_ok = true;
  if (avoidAllRain) {
    precipitation_ok = precipitationRate === 0;
  } else if (thresholds.avoidHeavyRain) {
    precipitation_ok = precipitationRate < 2.5; // Less than moderate rain
  }

  const issueCount = [temperature_ok, wind_ok, precipitation_ok].filter(
    (ok) => !ok
  ).length;

  let score: ComfortScoreType;
  if (issueCount === 0) {
    score = 'good';
  } else if (issueCount === 1) {
    score = 'ok';
  } else {
    score = 'poor';
  }

  // Generate reason
  const issues: string[] = [];
  if (!temperature_ok) {
    if (temperature < thresholds.minTemp) {
      issues.push(`too cold (${temperature.toFixed(1)}°C)`);
    } else {
      issues.push(`too hot (${temperature.toFixed(1)}°C)`);
    }
  }
  if (!wind_ok) {
    issues.push(`windy (${windSpeed.toFixed(1)} m/s)`);
  }
  if (!precipitation_ok) {
    if (avoidAllRain) {
      issues.push('raining');
    } else {
      issues.push('heavy rain');
    }
  }

  let reason: string;
  if (issues.length === 0) {
    reason = 'Ideal conditions';
  } else {
    reason = `Conditions: ${issues.join(', ')}`;
  }

  return { score, temperature_ok, wind_ok, precipitation_ok, reason };
}

/**
 * Identify best time windows (consecutive "good" slots)
 */
function identifyBestWindows(
  slots: ComfortSlot[]
): Array<{ from: string; to: string; duration_hours: number }> {
  const windows: Array<{ from: string; to: string; duration_hours: number }> =
    [];

  let currentWindow: { from: string; to: string; count: number } | null = null;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];

    if (slot.score === 'good') {
      if (!currentWindow) {
        // Start new window
        currentWindow = { from: slot.time, to: slot.time, count: 1 };
      } else {
        // Extend current window
        currentWindow.to = slot.time;
        currentWindow.count++;
      }
    } else {
      // End current window if exists
      if (currentWindow && currentWindow.count >= 2) {
        // Only keep windows of 2+ hours
        windows.push({
          from: currentWindow.from,
          to: currentWindow.to,
          duration_hours: currentWindow.count,
        });
      }
      currentWindow = null;
    }
  }

  // Add final window if exists
  if (currentWindow && currentWindow.count >= 2) {
    windows.push({
      from: currentWindow.from,
      to: currentWindow.to,
      duration_hours: currentWindow.count,
    });
  }

  return windows;
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  activity: ActivityTypeType,
  slots: ComfortSlot[],
  bestWindows: Array<{ from: string; to: string; duration_hours: number }>
): string {
  const goodCount = slots.filter((s) => s.score === 'good').length;
  const okCount = slots.filter((s) => s.score === 'ok').length;
  const poorCount = slots.filter((s) => s.score === 'poor').length;

  let summary = `Weather assessment for ${activity}:\n`;
  summary += `${goodCount} hours with ideal conditions, ${okCount} acceptable, ${poorCount} poor.\n`;

  if (bestWindows.length > 0) {
    summary += `\nBest windows:\n`;
    for (const window of bestWindows.slice(0, 3)) {
      const fromTime = new Date(window.from).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const toTime = new Date(window.to).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      summary += `- ${fromTime} to ${toTime} (${window.duration_hours}h)\n`;
    }
  } else {
    summary += '\nNo ideal windows found. Consider adjusting activity or preferences.';
  }

  return summary;
}

/**
 * Assess Outdoor Activity Window Tool Handler
 */
export async function handleAssessOutdoorActivity(
  input: AssessOutdoorActivityInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Assess outdoor activity tool called', {
      location: input.location,
      activity: input.activity,
    });

    const thresholds = getThresholds(input.activity, input.preferences);
    const avoidAllRain = input.preferences?.avoidRain ?? false;

    // Call location forecast to get hourly data
    const forecastInput: LocationForecastInput = {
      location: input.location,
      timeWindow: input.timeWindow,
      resolution: 'hourly',
      includeProbabilistic: false,
      language: input.language,
    };

    const forecastResult = await handleLocationForecast(
      forecastInput,
      proxyClient
    );

    if (forecastResult.isError) {
      // Pass through error
      return forecastResult;
    }

    const forecastOutput = forecastResult.structuredContent as any;

    // Optional: Enhance first 2 hours with nowcast data (higher precision)
    // For simplicity, we'll use forecast data for all hours

    // Score each hour
    const slots: ComfortSlot[] = [];
    for (const hour of forecastOutput.hours) {
      const assessment = assessComfort(
        hour.air_temperature,
        hour.wind_speed,
        hour.precipitation_rate ?? 0,
        thresholds,
        avoidAllRain
      );

      slots.push({
        time: hour.time,
        score: assessment.score,
        temperature: hour.air_temperature,
        temperature_unit: '°C' as const,
        wind_speed: hour.wind_speed,
        wind_speed_unit: 'm/s' as const,
        precipitation_rate: hour.precipitation_rate ?? 0,
        precipitation_unit: 'mm/h' as const,
        temperature_ok: assessment.temperature_ok,
        wind_ok: assessment.wind_ok,
        precipitation_ok: assessment.precipitation_ok,
        reason: assessment.reason,
      });
    }

    // Identify best windows
    const bestWindows = identifyBestWindows(slots);

    // Build output
    const output: AssessOutdoorActivityOutput = {
      location: {
        lat: input.location.lat,
        lon: input.location.lon,
      },
      activity: input.activity,
      timeWindow: forecastOutput.timeWindow,
      slots,
      bestWindows,
      summary: generateSummary(input.activity, slots, bestWindows),
    };

    logger.info('Assess outdoor activity tool completed', {
      location: input.location,
      activity: input.activity,
      goodSlots: slots.filter((s) => s.score === 'good').length,
      bestWindowsCount: bestWindows.length,
    });

    return buildToolResponse(output, output.summary);
  } catch (error) {
    logger.error('Assess outdoor activity tool error', {
      error: error instanceof Error ? error.message : String(error),
      location: input.location,
      activity: input.activity,
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
        'An unexpected error occurred while assessing outdoor activity conditions.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

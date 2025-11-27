/**
 * Assess Marine Trip Risk Tool
 * Opinionated service that evaluates risk for marine trips along a route
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ProxyClient } from '../domain/proxy-client.js';
import { buildToolResponse, buildErrorResponse } from '../domain/response-builder.js';
import { createWeatherError } from '../domain/error-handler.js';
import { logger } from '../domain/logger.js';
import { CoordinateSchema, TimeWindowSchema, LanguageSchema } from '../domain/schemas/common.js';
import {
  handleMarineConditions,
  type MarineConditionsInput,
  VesselType,
  type VesselTypeType,
  RiskLevel,
  type RiskLevelType,
} from './marine-conditions.js';

/**
 * Waypoint schema
 */
export const WaypointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  name: z.string().optional().describe('Optional name for this waypoint'),
});

export type Waypoint = z.infer<typeof WaypointSchema>;

/**
 * Overall trip risk level
 */
export const TripRiskLevel = z.enum(['safe', 'caution', 'dangerous', 'extreme']);

export type TripRiskLevelType = z.infer<typeof TripRiskLevel>;

/**
 * Tool input schema
 */
export const AssessMarineTripInputSchema = z.object({
  route: z.array(WaypointSchema).min(2).describe('Array of waypoints defining the route (at least start and end)'),
  vesselType: VesselType,
  timeWindow: TimeWindowSchema,
  language: LanguageSchema,
});

export type AssessMarineTripInput = z.infer<typeof AssessMarineTripInputSchema>;

/**
 * Risk hotspot schema
 */
export const RiskHotspotSchema = z.object({
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    name: z.string().optional(),
  }),
  time: z.string().datetime(),
  risk_level: RiskLevel,
  wave_height: z.number(),
  water_speed: z.number(),
  reason: z.string(),
});

export type RiskHotspot = z.infer<typeof RiskHotspotSchema>;

/**
 * Waypoint assessment schema
 */
export const WaypointAssessmentSchema = z.object({
  waypoint: WaypointSchema,
  max_risk: RiskLevel,
  hours_assessed: z.number(),
  high_risk_hours: z.number(),
});

export type WaypointAssessment = z.infer<typeof WaypointAssessmentSchema>;

/**
 * Tool output schema
 */
export const AssessMarineTripOutputSchema = z.object({
  route: z.array(WaypointSchema),
  vesselType: VesselType,
  timeWindow: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  overall_risk: TripRiskLevel,
  waypoint_assessments: z.array(WaypointAssessmentSchema),
  hotspots: z.array(RiskHotspotSchema),
  recommendation: z.string(),
  summary: z.string(),
});

export type AssessMarineTripOutput = z.infer<typeof AssessMarineTripOutputSchema>;

/**
 * Map risk level to numeric value for comparison
 */
function riskToNumeric(risk: RiskLevelType): number {
  const map: Record<RiskLevelType, number> = {
    low: 0,
    moderate: 1,
    high: 2,
    extreme: 3,
  };
  return map[risk];
}

/**
 * Map numeric value back to risk level
 */
function numericToRisk(value: number): RiskLevelType {
  if (value >= 3) return 'extreme';
  if (value >= 2) return 'high';
  if (value >= 1) return 'moderate';
  return 'low';
}

/**
 * Aggregate risk across route
 */
function aggregateTripRisk(waypointAssessments: WaypointAssessment[]): TripRiskLevelType {
  // Find highest risk across all waypoints
  const maxRisk = Math.max(
    ...waypointAssessments.map((w) => riskToNumeric(w.max_risk))
  );

  // Count waypoints with high risk
  const highRiskWaypoints = waypointAssessments.filter(
    (w) => riskToNumeric(w.max_risk) >= 2
  ).length;

  // Trip risk is elevated if:
  // - Any waypoint has extreme risk → dangerous
  // - Multiple waypoints have high risk → dangerous
  // - One waypoint has high risk → caution
  // - All waypoints moderate or below → safe/caution

  if (maxRisk >= 3) {
    return 'extreme';
  } else if (maxRisk >= 2) {
    if (highRiskWaypoints >= 2) {
      return 'dangerous';
    } else {
      return 'caution';
    }
  } else if (maxRisk >= 1) {
    return 'caution';
  } else {
    return 'safe';
  }
}

/**
 * Generate recommendation based on trip risk
 */
function generateRecommendation(
  tripRisk: TripRiskLevelType,
  vesselType: VesselTypeType,
  hotspots: RiskHotspot[]
): string {
  switch (tripRisk) {
    case 'safe':
      return `Safe to proceed with ${vesselType}. Conditions are favorable along the route.`;
    case 'caution':
      return `Exercise caution. Moderate conditions expected at some points along the route. Monitor weather closely.`;
    case 'dangerous':
      return `Not recommended for ${vesselType}. High-risk conditions detected along the route. Consider postponing or choosing an alternative route.`;
    case 'extreme':
      return `DANGER: Extreme conditions detected. Do not proceed. Trip is unsafe for ${vesselType}.`;
  }
}

/**
 * Sample waypoints from route (to avoid too many API calls)
 */
function sampleWaypoints(route: Waypoint[], maxSamples: number = 5): Waypoint[] {
  if (route.length <= maxSamples) {
    return route;
  }

  const sampled: Waypoint[] = [];

  // Always include start and end
  sampled.push(route[0]);

  // Sample intermediate waypoints evenly
  const step = (route.length - 1) / (maxSamples - 1);
  for (let i = 1; i < maxSamples - 1; i++) {
    const index = Math.round(i * step);
    sampled.push(route[index]);
  }

  // Always include end
  sampled.push(route[route.length - 1]);

  return sampled;
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  route: Waypoint[],
  vesselType: VesselTypeType,
  overallRisk: TripRiskLevelType,
  waypointAssessments: WaypointAssessment[],
  hotspots: RiskHotspot[]
): string {
  let summary = `Marine trip risk assessment for ${vesselType}:\n`;
  summary += `Route: ${route.length} waypoints, ${waypointAssessments.length} assessed.\n`;
  summary += `Overall risk: ${overallRisk.toUpperCase()}\n`;

  if (hotspots.length > 0) {
    summary += `\nRisk hotspots (${hotspots.length}):\n`;
    for (const hotspot of hotspots.slice(0, 3)) {
      const timeStr = new Date(hotspot.time).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
      });
      const locationStr = hotspot.location.name || `${hotspot.location.lat.toFixed(2)}°N, ${hotspot.location.lon.toFixed(2)}°E`;
      summary += `- ${locationStr} at ${timeStr}: ${hotspot.risk_level} risk (${hotspot.reason})\n`;
    }
  } else {
    summary += '\nNo significant risk hotspots detected.';
  }

  return summary;
}

/**
 * Assess Marine Trip Risk Tool Handler
 */
export async function handleAssessMarineTrip(
  input: AssessMarineTripInput,
  proxyClient: ProxyClient
): Promise<CallToolResult> {
  try {
    logger.debug('Assess marine trip tool called', {
      routeLength: input.route.length,
      vesselType: input.vesselType,
    });

    // Sample waypoints if route is long
    const sampledWaypoints = sampleWaypoints(input.route, 5);

    logger.debug('Sampled waypoints for assessment', {
      original: input.route.length,
      sampled: sampledWaypoints.length,
    });

    // Assess conditions at each waypoint
    const waypointAssessments: WaypointAssessment[] = [];
    const allHotspots: RiskHotspot[] = [];

    for (const waypoint of sampledWaypoints) {
      const marineInput: MarineConditionsInput = {
        location: { lat: waypoint.lat, lon: waypoint.lon },
        vesselType: input.vesselType,
        timeWindow: input.timeWindow,
        language: input.language,
      };

      const marineResult = await handleMarineConditions(marineInput, proxyClient);

      if (marineResult.isError) {
        // If any waypoint fails (e.g., out of coverage), pass error through
        return marineResult;
      }

      const marineOutput = marineResult.structuredContent as any;

      // Find max risk at this waypoint
      let maxRisk: RiskLevelType = 'low';
      let highRiskHours = 0;

      for (const hour of marineOutput.hours) {
        const hourRiskNumeric = riskToNumeric(hour.risk_level);
        if (hourRiskNumeric > riskToNumeric(maxRisk)) {
          maxRisk = hour.risk_level;
        }
        if (hourRiskNumeric >= 2) {
          highRiskHours++;
        }

        // Collect hotspots (high or extreme risk)
        if (hourRiskNumeric >= 2) {
          allHotspots.push({
            location: {
              lat: waypoint.lat,
              lon: waypoint.lon,
              name: waypoint.name,
            },
            time: hour.time,
            risk_level: hour.risk_level,
            wave_height: hour.wave_height,
            water_speed: hour.water_speed,
            reason: hour.risk_notes || 'High risk conditions',
          });
        }
      }

      waypointAssessments.push({
        waypoint,
        max_risk: maxRisk,
        hours_assessed: marineOutput.hours.length,
        high_risk_hours: highRiskHours,
      });
    }

    // Aggregate trip risk
    const overallRisk = aggregateTripRisk(waypointAssessments);

    // Sort hotspots by risk level (highest first)
    allHotspots.sort((a, b) => riskToNumeric(b.risk_level) - riskToNumeric(a.risk_level));

    // Generate recommendation
    const recommendation = generateRecommendation(
      overallRisk,
      input.vesselType,
      allHotspots
    );

    // Build output
    const output: AssessMarineTripOutput = {
      route: input.route,
      vesselType: input.vesselType,
      timeWindow: {
        from: waypointAssessments[0]?.hours_assessed
          ? new Date().toISOString()
          : new Date().toISOString(),
        to: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      },
      overall_risk: overallRisk,
      waypoint_assessments: waypointAssessments,
      hotspots: allHotspots,
      recommendation,
      summary: generateSummary(
        input.route,
        input.vesselType,
        overallRisk,
        waypointAssessments,
        allHotspots
      ),
    };

    logger.info('Assess marine trip tool completed', {
      routeLength: input.route.length,
      vesselType: input.vesselType,
      overallRisk,
      hotspotsCount: allHotspots.length,
    });

    return buildToolResponse(output, output.summary);
  } catch (error) {
    logger.error('Assess marine trip tool error', {
      error: error instanceof Error ? error.message : String(error),
      routeLength: input.route.length,
      vesselType: input.vesselType,
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
        'An unexpected error occurred while assessing marine trip risk.',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
    );
  }
}

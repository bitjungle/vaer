/**
 * Examples Resource
 * Provides example tool calls and use cases
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

export const EXAMPLES_RESOURCE_URI_TEMPLATE = 'weather://examples/{language}';
export const EXAMPLES_RESOURCE_NAME = 'Weather API Examples';
export const EXAMPLES_RESOURCE_DESCRIPTION =
  'Example tool calls and common use cases for Weather MCP tools';

interface ToolExample {
  tool: string;
  description: string;
  input: Record<string, unknown>;
  notes?: string[];
}

/**
 * Get examples for a specific language
 */
function getExamples(language: string): ToolExample[] {
  // For now, we only support English
  // Future: Add translations for other languages
  const isEnglish = language === 'en' || language.startsWith('en-');

  return [
    {
      tool: 'weather.get_location_forecast',
      description: isEnglish
        ? 'Get 24-hour forecast for Oslo, Norway'
        : 'Get 24-hour forecast for Oslo, Norway',
      input: {
        location: {
          lat: 59.91,
          lon: 10.75,
        },
        timeWindow: {
          preset: 'next_24h',
        },
        resolution: 'hourly',
        language,
      },
      notes: isEnglish
        ? [
            'Coordinates can be obtained from geocoding services',
            'For locations with significant elevation changes, specify altitude',
            'Use includeProbabilistic: true for uncertainty ranges',
          ]
        : [
            'Coordinates can be obtained from geocoding services',
            'For locations with significant elevation changes, specify altitude',
            'Use includeProbabilistic: true for uncertainty ranges',
          ],
    },
    {
      tool: 'weather.get_nowcast',
      description: isEnglish
        ? 'Check if it will rain in the next 2 hours in Stockholm'
        : 'Check if it will rain in the next 2 hours in Stockholm',
      input: {
        location: {
          lat: 59.33,
          lon: 18.07,
        },
        language,
      },
      notes: isEnglish
        ? [
            'Only works for Nordic region (Norway, Sweden, Finland, Denmark)',
            'Optimized for short-term precipitation forecasts',
            'Updates every 5 minutes',
          ]
        : [
            'Only works for Nordic region',
            'Optimized for short-term precipitation forecasts',
          ],
    },
    {
      tool: 'weather.get_air_quality',
      description: isEnglish
        ? 'Get air quality forecast for Bergen, Norway'
        : 'Get air quality forecast for Bergen, Norway',
      input: {
        location: {
          lat: 60.39,
          lon: 5.32,
        },
        timeWindow: {
          preset: 'next_48h',
        },
        language,
      },
      notes: isEnglish
        ? [
            'Only available for locations in Norway',
            'Includes AQI and individual pollutant levels (PM2.5, PM10, NO2, O3)',
            'Useful for health recommendations',
          ]
        : ['Only available for Norway locations'],
    },
    {
      tool: 'weather.get_marine_conditions',
      description: isEnglish
        ? 'Get marine forecast for Oslo Fjord (kayaking)'
        : 'Get marine forecast for Oslo Fjord',
      input: {
        location: {
          lat: 59.9,
          lon: 10.7,
        },
        vesselType: 'kayak',
        timeWindow: {
          preset: 'next_24h',
        },
        language,
      },
      notes: isEnglish
        ? [
            'Only available for Norwegian coastal waters',
            'Vessel types: kayak, small_sailboat, motorboat, ship',
            'Includes risk assessment for the specified vessel type',
          ]
        : ['Only available for Norwegian coastal waters'],
    },
    {
      tool: 'weather.get_recent_observations',
      description: isEnglish
        ? 'Get recent observations from Oslo-Blindern weather station'
        : 'Get recent observations from Oslo weather station',
      input: {
        location: {
          stationId: 'SN18700',
        },
        elements: ['air_temperature', 'wind_speed', 'precipitation_amount'],
        maxDays: 1,
        language,
      },
      notes: isEnglish
        ? [
            'Requires Frost API credentials (optional in this server)',
            'Can query by station ID or coordinates',
            'Historical data for Norwegian weather stations',
          ]
        : ['Requires Frost API credentials', 'Norwegian stations only'],
    },
    {
      tool: 'weather.assess_outdoor_activity_window',
      description: isEnglish
        ? 'Find best times for running in Oslo over next 24 hours'
        : 'Find best times for running in Oslo',
      input: {
        location: {
          lat: 59.91,
          lon: 10.75,
        },
        activity: 'running',
        timeWindow: {
          preset: 'next_24h',
        },
        language,
      },
      notes: isEnglish
        ? [
            'Activity types: running, cycling, hiking, kids_playground, commuting, custom',
            'Identifies consecutive "good" weather windows (2+ hours)',
            'Use custom activity with preferences for specific requirements',
          ]
        : ['Multiple activity types supported'],
    },
    {
      tool: 'weather.assess_marine_trip_risk',
      description: isEnglish
        ? 'Assess risk for kayak trip from Oslo to Nesodden'
        : 'Assess marine trip risk',
      input: {
        route: [
          {
            lat: 59.9,
            lon: 10.7,
            name: 'Oslo Harbor',
          },
          {
            lat: 59.85,
            lon: 10.75,
            name: 'Nesodden',
          },
        ],
        vesselType: 'kayak',
        timeWindow: {
          preset: 'next_24h',
        },
        language,
      },
      notes: isEnglish
        ? [
            'Samples up to 5 waypoints from route to avoid excessive API calls',
            'Provides overall risk level and identifies hotspots',
            'Includes vessel-specific recommendations',
          ]
        : ['Analyzes multiple waypoints', 'Vessel-specific risk assessment'],
    },
  ];
}

/**
 * Read the examples resource for a specific language
 */
export function readExamplesResource(
  language: string = 'en'
): ReadResourceResult {
  const examples = getExamples(language);

  const content = {
    language,
    description: `Example tool calls and use cases for Weather MCP tools (${language})`,
    examples,
    generalNotes: [
      'All coordinates use decimal degrees (WGS84)',
      'Timestamps use ISO 8601 format',
      'All responses include MET Norway attribution',
      'Coverage limitations apply - see individual tool documentation',
    ],
  };

  const uri = EXAMPLES_RESOURCE_URI_TEMPLATE.replace('{language}', language);

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      },
    ],
  };
}

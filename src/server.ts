/**
 * Shared MCP server factory
 * Creates and configures the MCP server with all tools, resources, and prompts
 * Can be used by both stdio and HTTP transports
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from './domain/logger.js';
import type { ServerConfig } from './config/env.js';
import { ProxyClient } from './domain/proxy-client.js';
import { FrostClient } from './domain/frost-client.js';
import { PlacesDB } from './places/db.js';
import { wrapTool } from './domain/tool-wrapper.js';

// Resource imports
import {
  LICENSE_RESOURCE_URI,
  LICENSE_RESOURCE_NAME,
  LICENSE_RESOURCE_DESCRIPTION,
  readLicenseResource,
} from './resources/license.js';
import {
  PRODUCTS_RESOURCE_URI,
  PRODUCTS_RESOURCE_NAME,
  PRODUCTS_RESOURCE_DESCRIPTION,
  readProductsResource,
} from './resources/products.js';
import {
  UNITS_RESOURCE_URI,
  UNITS_RESOURCE_NAME,
  UNITS_RESOURCE_DESCRIPTION,
  readUnitsResource,
} from './resources/units.js';
import {
  EXAMPLES_RESOURCE_NAME,
  EXAMPLES_RESOURCE_DESCRIPTION,
  readExamplesResource,
} from './resources/examples.js';
import {
  PLACES_LICENSE_URI,
  PLACES_LICENSE_NAME,
  PLACES_LICENSE_DESCRIPTION,
  readPlacesLicenseResource,
} from './resources/places-license.js';
import {
  GAZETTEER_INFO_URI,
  GAZETTEER_INFO_NAME,
  GAZETTEER_INFO_DESCRIPTION,
  readGazetteerInfoResource,
} from './resources/places-info.js';

// Prompt imports
import {
  PLAN_OUTDOOR_EVENT_PROMPT_NAME,
  PLAN_OUTDOOR_EVENT_PROMPT_DESCRIPTION,
  PlanOutdoorEventArgsSchema,
  getPlanOutdoorEventPrompt,
} from './prompts/plan-outdoor-event.js';
import {
  CHECK_MARINE_TRIP_PROMPT_NAME,
  CHECK_MARINE_TRIP_PROMPT_DESCRIPTION,
  CheckMarineTripArgsSchema,
  getCheckMarineTripPrompt,
} from './prompts/check-marine-trip.js';
import {
  AIR_QUALITY_ADVICE_PROMPT_NAME,
  AIR_QUALITY_ADVICE_PROMPT_DESCRIPTION,
  AirQualityAdviceArgsSchema,
  getAirQualityAdvicePrompt,
} from './prompts/air-quality-advice.js';

// Tool imports
import {
  LocationForecastInputSchema,
  handleLocationForecast,
} from './tools/location-forecast.js';
import {
  NowcastInputSchema,
  handleNowcast,
} from './tools/nowcast.js';
import {
  AirQualityInputSchema,
  handleAirQuality,
} from './tools/air-quality.js';
import {
  MarineConditionsInputSchema,
  handleMarineConditions,
} from './tools/marine-conditions.js';
import {
  RecentObservationsInputSchema,
  handleRecentObservations,
} from './tools/recent-observations.js';
import {
  AssessOutdoorActivityInputSchema,
  handleAssessOutdoorActivity,
} from './tools/assess-outdoor-activity.js';
import {
  AssessMarineTripInputSchema,
  handleAssessMarineTrip,
} from './tools/assess-marine-trip.js';
import {
  PlaceResolveInputSchema,
} from './places/schemas.js';
import { handlePlaceResolve } from './tools/places-resolve.js';

/**
 * Create and configure MCP server with all tools, resources, and prompts
 * Returns the configured server (not yet connected to any transport)
 */
export function createMcpServer(config: ServerConfig): McpServer {
  logger.info('Creating MCP server', {
    serverName: config.serverName,
    serverVersion: config.serverVersion,
    mcpProtocolVersion: config.mcpProtocolVersion,
  });

  // Create the MCP server
  const server = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );

  // Register base weather resources
  server.registerResource(
    LICENSE_RESOURCE_NAME,
    LICENSE_RESOURCE_URI,
    {
      description: LICENSE_RESOURCE_DESCRIPTION,
      mimeType: 'text/markdown',
    },
    () => readLicenseResource()
  );

  logger.debug('Registered license resource', { uri: LICENSE_RESOURCE_URI });

  server.registerResource(
    PRODUCTS_RESOURCE_NAME,
    PRODUCTS_RESOURCE_URI,
    {
      description: PRODUCTS_RESOURCE_DESCRIPTION,
      mimeType: 'application/json',
    },
    () => readProductsResource()
  );

  logger.debug('Registered products resource', { uri: PRODUCTS_RESOURCE_URI });

  server.registerResource(
    UNITS_RESOURCE_NAME,
    UNITS_RESOURCE_URI,
    {
      description: UNITS_RESOURCE_DESCRIPTION,
      mimeType: 'application/json',
    },
    () => readUnitsResource()
  );

  logger.debug('Registered units resource', { uri: UNITS_RESOURCE_URI });

  server.registerResource(
    EXAMPLES_RESOURCE_NAME,
    'weather://examples/en',
    {
      description: EXAMPLES_RESOURCE_DESCRIPTION,
      mimeType: 'application/json',
    },
    () => readExamplesResource('en')
  );

  logger.debug('Registered examples resource', { uri: 'weather://examples/en' });

  // Create clients for tools
  const proxyClient = new ProxyClient(
    config.metnoProxyBaseUrl,
    config.metnoTimeoutMs
  );

  const frostClient = new FrostClient({
    baseUrl: config.frostBaseUrl,
    clientId: config.frostClientId,
    timeout: config.frostTimeoutMs,
  });

  // Create PlacesDB for Norway place resolution (Phase 7)
  let placesDB: PlacesDB | null = null;
  try {
    placesDB = new PlacesDB(config.placesDbPath);
    logger.info('PlacesDB initialized successfully');
  } catch (error) {
    logger.warn('PlacesDB not available - places_resolve_name tool will be disabled', {
      error,
    });
  }

  // Register weather data tools
  server.registerTool(
    'weather_get_location_forecast',
    {
      description:
        'Get weather forecast for any location on Earth using MET Norway Locationforecast API. Returns hourly weather data including temperature, wind, precipitation, and conditions.',
      inputSchema: LocationForecastInputSchema,
    },
    wrapTool('weather_get_location_forecast', async (args: unknown) => {
      const input = LocationForecastInputSchema.parse(args);
      return handleLocationForecast(input, proxyClient);
    })
  );

  logger.debug('Registered location forecast tool');

  server.registerTool(
    'weather_get_nowcast',
    {
      description:
        'Get 2-hour short-term precipitation forecast for Nordic region using MET Norway Nowcast API. Optimized for answering "will it rain in the next 2 hours?"',
      inputSchema: NowcastInputSchema,
    },
    wrapTool('weather_get_nowcast', async (args: unknown) => {
      const input = NowcastInputSchema.parse(args);
      return handleNowcast(input, proxyClient);
    })
  );

  logger.debug('Registered nowcast tool');

  server.registerTool(
    'weather_get_air_quality',
    {
      description:
        'Get air quality forecast and AQI (Air Quality Index) for Norwegian locations using MET Norway Air Quality API. Includes pollutant levels (PM2.5, PM10, NO2, O3) and health advice.',
      inputSchema: AirQualityInputSchema,
    },
    wrapTool('weather_get_air_quality', async (args: unknown) => {
      const input = AirQualityInputSchema.parse(args);
      return handleAirQuality(input, proxyClient);
    })
  );

  logger.debug('Registered air quality tool');

  server.registerTool(
    'weather_get_marine_conditions',
    {
      description:
        'Get marine weather conditions for coastal Norwegian locations using MET Norway Oceanforecast API. Returns wave height, water temperature, currents, and risk assessment for different vessel types.',
      inputSchema: MarineConditionsInputSchema,
    },
    wrapTool('weather_get_marine_conditions', async (args: unknown) => {
      const input = MarineConditionsInputSchema.parse(args);
      return handleMarineConditions(input, proxyClient);
    })
  );

  logger.debug('Registered marine conditions tool');

  server.registerTool(
    'weather_get_recent_observations',
    {
      description:
        'Get recent observed weather data from MET Norway Frost API. Returns actual measurements from weather stations including temperature, wind, precipitation, and more. Supports both station ID and coordinate-based queries.',
      inputSchema: RecentObservationsInputSchema,
    },
    wrapTool('weather_get_recent_observations', async (args: unknown) => {
      const input = RecentObservationsInputSchema.parse(args);
      return handleRecentObservations(input, frostClient);
    })
  );

  logger.debug('Registered recent observations tool');

  // Register service tools
  server.registerTool(
    'weather_assess_outdoor_activity_window',
    {
      description:
        'Assess weather conditions for outdoor activities. Scores each hour based on activity-specific thresholds (temperature, wind, precipitation) and identifies best time windows. Supports running, cycling, hiking, kids playground, commuting, or custom preferences.',
      inputSchema: AssessOutdoorActivityInputSchema,
    },
    wrapTool('weather_assess_outdoor_activity_window', async (args: unknown) => {
      const input = AssessOutdoorActivityInputSchema.parse(args);
      return handleAssessOutdoorActivity(input, proxyClient);
    })
  );

  logger.debug('Registered assess outdoor activity tool');

  server.registerTool(
    'weather_assess_marine_trip_risk',
    {
      description:
        'Assess risk for marine trips along a route. Evaluates marine conditions at multiple waypoints, identifies risk hotspots, and provides overall trip risk assessment with recommendations. Supports different vessel types.',
      inputSchema: AssessMarineTripInputSchema,
    },
    wrapTool('weather_assess_marine_trip_risk', async (args: unknown) => {
      const input = AssessMarineTripInputSchema.parse(args);
      return handleAssessMarineTrip(input, proxyClient);
    })
  );

  logger.debug('Registered assess marine trip risk tool');

  // Register places tool and resources (Phase 7)
  if (placesDB) {
    server.registerTool(
      'places_resolve_name',
      {
        description:
          'Resolve Norwegian place names to geographic coordinates using Kartverket Stedsnavn (official place names register). Returns ranked matches with confidence scores. Use this before weather tools when user provides a Norwegian place name instead of coordinates.',
        inputSchema: PlaceResolveInputSchema,
      },
      wrapTool('places_resolve_name', async (args: unknown) => {
        const input = PlaceResolveInputSchema.parse(args);
        return handlePlaceResolve(input, placesDB!);
      })
    );

    logger.debug('Registered places_resolve_name tool');

    server.registerResource(
      PLACES_LICENSE_NAME,
      PLACES_LICENSE_URI,
      {
        description: PLACES_LICENSE_DESCRIPTION,
        mimeType: 'text/markdown',
      },
      () => readPlacesLicenseResource()
    );

    logger.debug('Registered places license resource', { uri: PLACES_LICENSE_URI });

    server.registerResource(
      GAZETTEER_INFO_NAME,
      GAZETTEER_INFO_URI,
      {
        description: GAZETTEER_INFO_DESCRIPTION,
        mimeType: 'application/json',
      },
      () => readGazetteerInfoResource(placesDB!)
    );

    logger.debug('Registered gazetteer info resource', { uri: GAZETTEER_INFO_URI });
  } else {
    logger.info('Skipping places_resolve_name tool registration (database not available)');
  }

  // Register prompts
  server.registerPrompt(
    PLAN_OUTDOOR_EVENT_PROMPT_NAME,
    {
      description: PLAN_OUTDOOR_EVENT_PROMPT_DESCRIPTION,
      argsSchema: PlanOutdoorEventArgsSchema.shape as any,
    },
    async (args: unknown) => {
      const input = PlanOutdoorEventArgsSchema.parse(args);
      return getPlanOutdoorEventPrompt(input);
    }
  );

  logger.debug('Registered plan_outdoor_event prompt');

  server.registerPrompt(
    CHECK_MARINE_TRIP_PROMPT_NAME,
    {
      description: CHECK_MARINE_TRIP_PROMPT_DESCRIPTION,
      argsSchema: CheckMarineTripArgsSchema.shape as any,
    },
    async (args: unknown) => {
      const input = CheckMarineTripArgsSchema.parse(args);
      return getCheckMarineTripPrompt(input);
    }
  );

  logger.debug('Registered check_marine_trip prompt');

  server.registerPrompt(
    AIR_QUALITY_ADVICE_PROMPT_NAME,
    {
      description: AIR_QUALITY_ADVICE_PROMPT_DESCRIPTION,
      argsSchema: AirQualityAdviceArgsSchema.shape as any,
    },
    async (args: unknown) => {
      const input = AirQualityAdviceArgsSchema.parse(args);
      return getAirQualityAdvicePrompt(input);
    }
  );

  logger.debug('Registered air_quality_advice prompt');

  logger.info('MCP server created successfully', {
    tools: 8,
    resources: placesDB ? 7 : 5,
    prompts: 3,
  });

  return server;
}

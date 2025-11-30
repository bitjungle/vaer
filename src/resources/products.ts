/**
 * Products Resource
 * Lists all MET Norway APIs integrated in this server
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

export const PRODUCTS_RESOURCE_URI = 'metno://products';
export const PRODUCTS_RESOURCE_NAME = 'MET Norway Products';
export const PRODUCTS_RESOURCE_DESCRIPTION =
  'List of MET Norway APIs integrated in this Weather MCP server';

interface Product {
  name: string;
  version: string;
  coverage: string;
  description: string;
  tool: string;
  documentation: string;
}

const PRODUCTS: Product[] = [
  {
    name: 'Locationforecast',
    version: '2.0',
    coverage: 'World',
    description:
      'Weather forecasts for any location on Earth. Provides hourly temperature, wind, precipitation, and conditions.',
    tool: 'weather_get_location_forecast',
    documentation: 'https://api.met.no/weatherapi/locationforecast/2.0/documentation',
  },
  {
    name: 'Nowcast',
    version: '2.0',
    coverage: 'Nordic region',
    description:
      'Short-term (2-hour) precipitation forecasts for Nordic countries. Optimized for "will it rain soon?" queries.',
    tool: 'weather_get_nowcast',
    documentation: 'https://api.met.no/weatherapi/nowcast/2.0/documentation',
  },
  {
    name: 'Air Quality Forecast',
    version: '0.1',
    coverage: 'Norway',
    description:
      'Air quality forecasts for Norwegian locations. Provides AQI (Air Quality Index) and pollutant levels (PM2.5, PM10, NO2, O3).',
    tool: 'weather_get_air_quality',
    documentation: 'https://api.met.no/weatherapi/airqualityforecast/0.1/documentation',
  },
  {
    name: 'Oceanforecast',
    version: '2.0',
    coverage: 'Coastal Norway',
    description:
      'Marine weather conditions for Norwegian coastal waters. Includes wave height, water temperature, currents, and risk assessments.',
    tool: 'weather_get_marine_conditions',
    documentation: 'https://api.met.no/weatherapi/oceanforecast/2.0/documentation',
  },
  {
    name: 'Frost API',
    version: 'v1',
    coverage: 'Norway and Svalbard',
    description:
      'Historical weather observations from Norwegian weather stations. Provides actual measured data for temperature, wind, precipitation, and more.',
    tool: 'weather_get_recent_observations',
    documentation: 'https://frost.met.no/index.html',
  },
];

/**
 * Read the products resource
 */
export function readProductsResource(): ReadResourceResult {
  const content = {
    description:
      'This Weather MCP server integrates the following MET Norway Weather API products:',
    apis: PRODUCTS,
    notes: [
      'All data is provided by MET Norway (Norwegian Meteorological Institute)',
      'Each tool corresponds to one or more MET API products',
      'Coverage limitations apply - see individual product documentation',
      'Data is licensed under Norwegian License for Open Government Data (NLOD) 2.0',
    ],
    attribution: {
      provider: 'MET Norway',
      license: 'Norwegian License for Open Government Data (NLOD) 2.0',
      licenseUrl: 'https://api.met.no/doc/License',
      creditLine:
        'Weather data from MET Norway / Norwegian Meteorological Institute',
    },
  };

  return {
    contents: [
      {
        uri: PRODUCTS_RESOURCE_URI,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      },
    ],
  };
}

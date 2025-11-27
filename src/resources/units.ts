/**
 * Units Resource
 * Documents all measurement units used by this server
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

export const UNITS_RESOURCE_URI = 'weather://units';
export const UNITS_RESOURCE_NAME = 'Weather Units';
export const UNITS_RESOURCE_DESCRIPTION =
  'Documentation of all measurement units used in Weather MCP responses';

interface UnitInfo {
  quantity: string;
  unit: string;
  symbol: string;
  description: string;
  conversions?: Array<{
    to: string;
    formula: string;
  }>;
}

const UNITS: UnitInfo[] = [
  {
    quantity: 'Temperature',
    unit: 'Degrees Celsius',
    symbol: '°C',
    description: 'Air, water, and dew point temperature',
    conversions: [
      {
        to: 'Fahrenheit (°F)',
        formula: '°F = (°C × 9/5) + 32',
      },
      {
        to: 'Kelvin (K)',
        formula: 'K = °C + 273.15',
      },
    ],
  },
  {
    quantity: 'Wind Speed',
    unit: 'Meters per Second',
    symbol: 'm/s',
    description: 'Wind and gust speed at 10m height',
    conversions: [
      {
        to: 'Kilometers per Hour (km/h)',
        formula: 'km/h = m/s × 3.6',
      },
      {
        to: 'Knots (kt)',
        formula: 'kt = m/s × 1.944',
      },
      {
        to: 'Miles per Hour (mph)',
        formula: 'mph = m/s × 2.237',
      },
    ],
  },
  {
    quantity: 'Precipitation Rate',
    unit: 'Millimeters per Hour',
    symbol: 'mm/h',
    description: 'Rainfall and precipitation intensity',
    conversions: [
      {
        to: 'Inches per Hour (in/h)',
        formula: 'in/h = mm/h × 0.0394',
      },
    ],
  },
  {
    quantity: 'Precipitation Amount',
    unit: 'Millimeters',
    symbol: 'mm',
    description: 'Total accumulated precipitation',
    conversions: [
      {
        to: 'Inches (in)',
        formula: 'in = mm × 0.0394',
      },
    ],
  },
  {
    quantity: 'Pressure',
    unit: 'Hectopascals',
    symbol: 'hPa',
    description: 'Atmospheric pressure at sea level',
    conversions: [
      {
        to: 'Millibars (mbar)',
        formula: '1 hPa = 1 mbar',
      },
      {
        to: 'Inches of Mercury (inHg)',
        formula: 'inHg = hPa × 0.02953',
      },
    ],
  },
  {
    quantity: 'Humidity',
    unit: 'Percent',
    symbol: '%',
    description: 'Relative humidity',
  },
  {
    quantity: 'Cloud Cover',
    unit: 'Percent',
    symbol: '%',
    description: 'Fraction of sky covered by clouds',
  },
  {
    quantity: 'Visibility',
    unit: 'Kilometers',
    symbol: 'km',
    description: 'Horizontal visibility distance',
    conversions: [
      {
        to: 'Miles (mi)',
        formula: 'mi = km × 0.6214',
      },
    ],
  },
  {
    quantity: 'Wave Height',
    unit: 'Meters',
    symbol: 'm',
    description: 'Significant wave height (marine conditions)',
    conversions: [
      {
        to: 'Feet (ft)',
        formula: 'ft = m × 3.281',
      },
    ],
  },
  {
    quantity: 'Water Temperature',
    unit: 'Degrees Celsius',
    symbol: '°C',
    description: 'Sea surface temperature',
    conversions: [
      {
        to: 'Fahrenheit (°F)',
        formula: '°F = (°C × 9/5) + 32',
      },
    ],
  },
  {
    quantity: 'Current Speed',
    unit: 'Meters per Second',
    symbol: 'm/s',
    description: 'Ocean current velocity',
    conversions: [
      {
        to: 'Knots (kt)',
        formula: 'kt = m/s × 1.944',
      },
    ],
  },
  {
    quantity: 'Air Quality Index',
    unit: 'AQI',
    symbol: 'AQI',
    description:
      'Dimensionless air quality index (0-500). Lower is better. Based on worst pollutant.',
  },
  {
    quantity: 'Particulate Matter (PM2.5)',
    unit: 'Micrograms per Cubic Meter',
    symbol: 'µg/m³',
    description: 'Fine particulate matter (diameter < 2.5 micrometers)',
  },
  {
    quantity: 'Particulate Matter (PM10)',
    unit: 'Micrograms per Cubic Meter',
    symbol: 'µg/m³',
    description: 'Coarse particulate matter (diameter < 10 micrometers)',
  },
  {
    quantity: 'Nitrogen Dioxide (NO2)',
    unit: 'Micrograms per Cubic Meter',
    symbol: 'µg/m³',
    description: 'Nitrogen dioxide concentration',
  },
  {
    quantity: 'Ozone (O3)',
    unit: 'Micrograms per Cubic Meter',
    symbol: 'µg/m³',
    description: 'Ground-level ozone concentration',
  },
  {
    quantity: 'Altitude',
    unit: 'Meters',
    symbol: 'm',
    description: 'Height above mean sea level',
    conversions: [
      {
        to: 'Feet (ft)',
        formula: 'ft = m × 3.281',
      },
    ],
  },
  {
    quantity: 'Direction',
    unit: 'Degrees',
    symbol: '°',
    description:
      'Cardinal direction (0° = North, 90° = East, 180° = South, 270° = West)',
  },
];

/**
 * Read the units resource
 */
export function readUnitsResource(): ReadResourceResult {
  const content = {
    description:
      'All weather data returned by this server uses the following measurement units:',
    units: UNITS,
    notes: [
      'All units follow the International System of Units (SI) or commonly used meteorological conventions',
      'Conversions to imperial units are provided for reference',
      'Timestamps use ISO 8601 format in UTC unless otherwise specified',
      'Coordinates use decimal degrees (WGS84)',
    ],
  };

  return {
    contents: [
      {
        uri: UNITS_RESOURCE_URI,
        mimeType: 'application/json',
        text: JSON.stringify(content, null, 2),
      },
    ],
  };
}

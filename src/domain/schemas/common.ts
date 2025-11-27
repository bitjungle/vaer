/**
 * Common Zod schemas for weather tools
 */

import { z } from 'zod';

/**
 * Coordinate schema for location input
 */
export const CoordinateSchema = z.object({
  lat: z
    .number()
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90')
    .describe('Latitude in decimal degrees'),
  lon: z
    .number()
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180')
    .describe('Longitude in decimal degrees'),
  altitude: z
    .number()
    .min(-500, 'Altitude must be >= -500m')
    .max(9000, 'Altitude must be <= 9000m')
    .optional()
    .describe('Altitude in meters above sea level (optional)'),
});

export type Coordinate = z.infer<typeof CoordinateSchema>;

/**
 * Time window presets
 */
export const TimeWindowPreset = z.enum([
  'next_24h',
  'next_48h',
  'next_7d',
  'full_available',
]);

export type TimeWindowPresetType = z.infer<typeof TimeWindowPreset>;

/**
 * Time window schema for filtering forecast data
 */
export const TimeWindowSchema = z
  .object({
    kind: z
      .enum(['absolute', 'relative'])
      .optional()
      .describe('Kind of time window'),
    from: z
      .string()
      .datetime()
      .optional()
      .describe('Start time (ISO 8601)'),
    to: z
      .string()
      .datetime()
      .optional()
      .describe('End time (ISO 8601)'),
    preset: TimeWindowPreset.optional().describe(
      'Preset time window (next_24h, next_48h, next_7d, full_available)'
    ),
  })
  .optional();

export type TimeWindow = z.infer<typeof TimeWindowSchema>;

/**
 * Source metadata schema
 */
export const SourceMetadataSchema = z.object({
  provider: z.string().describe('Data provider (e.g., MET Norway)'),
  product: z.string().describe('Specific product/API used'),
  licenseUri: z
    .string()
    .url()
    .describe('License URL'),
  creditLine: z.string().describe('Required attribution text'),
  cached: z
    .boolean()
    .describe('Whether response was served from cache'),
  ageSeconds: z
    .number()
    .optional()
    .describe('Age of cached response in seconds'),
});

export type SourceMetadata = z.infer<typeof SourceMetadataSchema>;

/**
 * Location with elevation information
 */
export const LocationWithElevationSchema = z.object({
  lat: z.number().describe('Latitude in decimal degrees'),
  lon: z.number().describe('Longitude in decimal degrees'),
  altitude: z
    .number()
    .optional()
    .describe('Requested altitude in meters'),
  elevationUsed: z
    .number()
    .optional()
    .describe('Actual elevation used by MET (from model)'),
});

export type LocationWithElevation = z.infer<
  typeof LocationWithElevationSchema
>;

/**
 * Resolved time window (always absolute times)
 */
export const ResolvedTimeWindowSchema = z.object({
  from: z
    .string()
    .datetime()
    .describe('Start time (ISO 8601)'),
  to: z
    .string()
    .datetime()
    .describe('End time (ISO 8601)'),
});

export type ResolvedTimeWindow = z.infer<
  typeof ResolvedTimeWindowSchema
>;

/**
 * Language code (BCP-47)
 */
export const LanguageSchema = z
  .string()
  .default('en')
  .describe('BCP-47 language tag for textual summaries');

export type Language = z.infer<typeof LanguageSchema>;

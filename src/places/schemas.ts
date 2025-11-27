/**
 * Zod schemas for places.resolve_name tool
 */

import { z } from 'zod';

/** Input schema for places.resolve_name */
export const PlaceResolveInputSchema = z.object({
  query: z
    .string()
    .min(1, 'Query must not be empty')
    .max(100, 'Query too long')
    .describe('Norwegian place name to resolve (e.g., "Oslo", "Bergen", "Tromsø")'),

  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of matches to return (default: 5)'),

  preferredPlaceClasses: z
    .array(z.string())
    .optional()
    .describe('Preferred place types (e.g., ["city", "town"]). If matches found, only these types returned.'),

  preferredMunicipalityCode: z
    .string()
    .optional()
    .describe('Preferred municipality code (4-digit). Matches in this municipality will be ranked higher.'),

  language: z
    .string()
    .default('en')
    .describe('Language for text summary (ISO 639-1 code)'),
});

export type PlaceResolveInput = z.infer<typeof PlaceResolveInputSchema>;

/** Place match in output */
export const PlaceMatchSchema = z.object({
  id: z.string().describe('SSR/Stedsnavn ID'),
  name: z.string().describe('Primary place name'),
  alt_names: z.array(z.string()).optional().describe('Alternative names'),
  lat: z.number().describe('Latitude (WGS84)'),
  lon: z.number().describe('Longitude (WGS84)'),
  municipality_name: z.string().optional().describe('Municipality name'),
  municipality_code: z.string().optional().describe('Municipality code (4 digits)'),
  county_name: z.string().optional().describe('County name'),
  place_class: z.string().optional().describe('Place type (city/town/village/etc.)'),
  confidence: z.number().min(0).max(1).describe('Match confidence (0.0 - 1.0)'),
  source: z.literal('SSR/Stedsnavn').describe('Data source'),
});

export type PlaceMatchOutput = z.infer<typeof PlaceMatchSchema>;

/** Output schema for places.resolve_name */
export const PlaceResolveOutputSchema = z.object({
  query: z.string(),
  matches: z.array(PlaceMatchSchema),
  source: z.object({
    provider: z.string(),
    product: z.string(),
    licenseUri: z.string(),
    creditLine: z.string(),
    cached: z.boolean(),
    ageSeconds: z.number(),
  }),
});

export type PlaceResolveOutput = z.infer<typeof PlaceResolveOutputSchema>;

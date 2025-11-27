/**
 * places.resolve_name tool handler
 */

import { logger } from '../domain/logger.js';
import { PlacesDB } from '../places/db.js';
import { resolveName } from '../places/matcher.js';
import type { PlaceResolveInput, PlaceResolveOutput } from '../places/schemas.js';
import type { ToolResponse } from '../domain/types.js';

/**
 * Generate human-readable summary for place resolution results
 */
function generateSummary(
  query: string,
  matches: PlaceResolveOutput['matches'],
  language: string
): string {
  if (matches.length === 0) {
    return `No Norwegian places found matching "${query}". Try a different spelling or nearby location.`;
  }

  if (matches.length === 1 && matches[0].confidence >= 0.8) {
    const m = matches[0];
    const location = [m.municipality_name, m.county_name]
      .filter(Boolean)
      .join(', ');
    return `Resolved "${query}" to ${m.name}${location ? ` (${location})` : ''} at coordinates ${m.lat.toFixed(4)}°N, ${m.lon.toFixed(4)}°E (confidence: ${(m.confidence * 100).toFixed(0)}%).`;
  }

  // Multiple matches or low confidence
  const topMatch = matches[0];
  const others = matches.slice(1, 3);
  let summary = `Found ${matches.length} places matching "${query}":\n\n`;

  summary += `1. ${topMatch.name}`;
  if (topMatch.municipality_name) {
    summary += ` (${topMatch.municipality_name}${topMatch.county_name ? `, ${topMatch.county_name}` : ''})`;
  }
  summary += ` - ${topMatch.lat.toFixed(4)}°N, ${topMatch.lon.toFixed(4)}°E`;
  summary += ` [confidence: ${(topMatch.confidence * 100).toFixed(0)}%]\n`;

  for (let i = 0; i < others.length; i++) {
    const m = others[i];
    summary += `${i + 2}. ${m.name}`;
    if (m.municipality_name) {
      summary += ` (${m.municipality_name})`;
    }
    summary += ` - ${m.lat.toFixed(4)}°N, ${m.lon.toFixed(4)}°E`;
    summary += ` [${(m.confidence * 100).toFixed(0)}%]\n`;
  }

  if (matches.length > 3) {
    summary += `\n...and ${matches.length - 3} more.`;
  }

  summary += `\nPlease specify which location you mean, or use coordinates directly.`;

  return summary;
}

/**
 * Handle places.resolve_name tool call
 */
export async function handlePlaceResolve(
  input: PlaceResolveInput,
  placesDB: PlacesDB
): Promise<ToolResponse> {
  logger.info('Handling places.resolve_name', {
    query: input.query,
    limit: input.limit,
  });

  try {
    // Resolve using matcher
    const matches = resolveName(placesDB, {
      query: input.query,
      limit: input.limit,
      preferredPlaceClasses: input.preferredPlaceClasses,
      preferredMunicipalityCode: input.preferredMunicipalityCode,
    });

    // Check for no results
    if (matches.length === 0) {
      logger.warn('No places found', { query: input.query });
      return {
        content: [
          {
            type: 'text',
            text: `No Norwegian places found matching "${input.query}". Try:\n- Different spelling\n- Nearby larger town\n- Direct coordinates (lat/lon)`,
          },
        ],
        isError: true,
      };
    }

    // Build structured output
    const structuredContent: PlaceResolveOutput = {
      query: input.query,
      matches: matches.map(m => ({
        id: m.id,
        name: m.name,
        alt_names: m.alt_names,
        lat: m.lat,
        lon: m.lon,
        municipality_name: m.municipality_name,
        municipality_code: m.municipality_code,
        county_name: m.county_name,
        place_class: m.place_class,
        confidence: m.confidence,
        source: m.source,
      })),
      source: {
        provider: 'Kartverket',
        product: 'Stedsnavn (Norwegian Place Names Register)',
        licenseUri: 'places://license/ssr',
        creditLine: 'Place name data from Kartverket Stedsnavn',
        cached: true,  // Local database, always "cached"
        ageSeconds: 0,  // Static dataset
      },
    };

    // Generate text summary
    const textSummary = generateSummary(
      input.query,
      structuredContent.matches,
      input.language
    );

    return {
      content: [
        {
          type: 'text',
          text: textSummary,
        },
      ],
      structuredContent,
    };
  } catch (error) {
    logger.error('Error in places.resolve_name', { error, query: input.query });
    return {
      content: [
        {
          type: 'text',
          text: `Error resolving place name "${input.query}": ${error}`,
        },
      ],
      isError: true,
    };
  }
}

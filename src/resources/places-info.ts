/**
 * Gazetteer info resource - metadata about the Norwegian place names database
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { PlacesDB } from '../places/db.js';

export const GAZETTEER_INFO_URI = 'places://gazetteer/info';
export const GAZETTEER_INFO_NAME = 'Gazetteer Information';
export const GAZETTEER_INFO_DESCRIPTION = 'Metadata about the Norwegian place name gazetteer';

export function readGazetteerInfoResource(placesDB: PlacesDB): ReadResourceResult {
  // Query DB for stats and metadata
  const stats = placesDB.getStats();

  const content = {
    description: 'Norwegian place name gazetteer built from Kartverket Stedsnavn',
    source: {
      dataset: 'Stedsnavn (SSR)',
      provider: 'Kartverket',
      projection_source: 'EPSG:25833 (UTM Zone 33, 2D)',
      projection_target: 'EPSG:4326 (WGS84)',
      coverage: 'Norway'
    },
    runtime: {
      database: 'SQLite',
      total_places: stats.totalPlaces,
      fts_index_size: stats.ftsIndexSize,
      build_date: stats.metadata.build_date || 'unknown',
      build_timestamp: stats.metadata.build_timestamp || 'unknown',
      schema_version: stats.metadata.schema_version || '1.0',
    },
    capabilities: {
      matching: ['exact', 'prefix', 'fuzzy'],
      filtering: ['place_class', 'municipality_code'],
      max_results: 20,
      confidence_scoring: true,
      norwegian_characters: true,
    },
    license: {
      type: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Place name data from Kartverket Stedsnavn',
      resource_uri: 'places://license/ssr',
    }
  };

  return {
    contents: [{
      uri: GAZETTEER_INFO_URI,
      mimeType: 'application/json',
      text: JSON.stringify(content, null, 2)
    }]
  };
}

/**
 * Types for the Places domain (Norwegian place name resolution)
 */

/** Raw place record from SQLite database */
export interface PlaceRecord {
  id: number;
  ssr_id: string;
  primary_name: string;
  alt_names: string | null;  // JSON array as string
  lat: number;
  lon: number;
  place_class: string | null;
  municipality_code: string | null;
  municipality_name: string | null;
  county_name: string | null;
  population: number | null;
  is_county_seat: number;  // SQLite boolean (0 or 1)
  is_municipality_seat: number;  // SQLite boolean (0 or 1)
  importance_score: number | null;
}

/** Match type indicator */
export type MatchType = 'exact_primary' | 'exact_alt' | 'prefix' | 'fuzzy';

/** Candidate place with match metadata */
export interface PlaceCandidate extends PlaceRecord {
  matchType: MatchType;
  ftsRank?: number;  // FTS5 rank (lower is better)
}

/** Final matched place with confidence score */
export interface PlaceMatch {
  id: string;
  name: string;
  alt_names?: string[];
  lat: number;
  lon: number;
  municipality_name?: string;
  municipality_code?: string;
  county_name?: string;
  place_class?: string;
  confidence: number;  // 0.0 - 1.0
  source: 'SSR/Stedsnavn';
}

/** Options for place name resolution */
export interface ResolveOptions {
  query: string;
  limit: number;
  preferredPlaceClasses?: string[];
  preferredMunicipalityCode?: string;
}

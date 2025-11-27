/**
 * Place name matching and ranking logic
 */

import { logger } from '../domain/logger.js';
import { PlacesDB } from './db.js';
import type {
  PlaceRecord,
  PlaceCandidate,
  PlaceMatch,
  ResolveOptions,
  MatchType,
} from './types.js';

/**
 * Normalize Norwegian text for matching
 */
export function normalizeNorwegian(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(oslo|bergen|trondheim|stavanger|tromsø|drammen),\s*(norge|norway)$/i, '$1');
  // Keep æøå as-is - SQLite FTS5 with unicode61 tokenizer handles them correctly
}

/**
 * Merge and deduplicate candidates from different search strategies
 */
function mergeCandidates(
  exactPrimary: PlaceRecord[],
  exactAlt: PlaceRecord[],
  ftsResults: Array<PlaceRecord & { fts_rank: number }>
): PlaceCandidate[] {
  const seen = new Set<number>();
  const candidates: PlaceCandidate[] = [];

  // 1. Exact primary matches (highest priority)
  for (const record of exactPrimary) {
    if (!seen.has(record.id)) {
      seen.add(record.id);
      candidates.push({ ...record, matchType: 'exact_primary' });
    }
  }

  // 2. Exact alt_names matches
  for (const record of exactAlt) {
    if (!seen.has(record.id)) {
      seen.add(record.id);
      candidates.push({ ...record, matchType: 'exact_alt' });
    }
  }

  // 3. FTS matches (prefix/fuzzy)
  for (const record of ftsResults) {
    if (!seen.has(record.id)) {
      seen.add(record.id);
      // Determine if it's prefix or fuzzy based on FTS rank
      const matchType: MatchType = record.fts_rank < 0 ? 'prefix' : 'fuzzy';
      candidates.push({
        ...record,
        matchType,
        ftsRank: Math.abs(record.fts_rank),
      });
    }
  }

  return candidates;
}

/**
 * Apply user-specified filters to candidates
 */
function applyFilters(
  candidates: PlaceCandidate[],
  options: ResolveOptions
): PlaceCandidate[] {
  let filtered = candidates;

  // Filter by preferred place classes
  if (options.preferredPlaceClasses && options.preferredPlaceClasses.length > 0) {
    const preferred = filtered.filter(c =>
      c.place_class && options.preferredPlaceClasses!.includes(c.place_class)
    );
    if (preferred.length > 0) {
      filtered = preferred;
    }
  }

  // Bias toward preferred municipality (but don't exclude others)
  if (options.preferredMunicipalityCode) {
    filtered.sort((a, b) => {
      const aMatch = a.municipality_code === options.preferredMunicipalityCode ? 1 : 0;
      const bMatch = b.municipality_code === options.preferredMunicipalityCode ? 1 : 0;
      return bMatch - aMatch;  // Preferred municipalities first
    });
  }

  return filtered.slice(0, options.limit * 2);  // Keep 2x limit for scoring
}

/**
 * Assign confidence scores to matches
 */
function assignConfidence(
  candidates: PlaceCandidate[],
  _query: string
): PlaceMatch[] {
  return candidates.map((candidate, index) => {
    let confidence = 0.0;

    // Base confidence by match type
    switch (candidate.matchType) {
      case 'exact_primary':
        confidence = 1.0;
        break;
      case 'exact_alt':
        confidence = 0.85;
        break;
      case 'prefix':
        confidence = 0.70;
        break;
      case 'fuzzy':
        // FTS rank-based scoring (rank is negative BM25 score)
        confidence = 0.40 + Math.min(0.30, (candidate.ftsRank || 0) / 100);
        break;
    }

    // Boost for administrative importance
    if (candidate.is_county_seat === 1) {
      confidence += 0.05;
    }
    if (candidate.is_municipality_seat === 1) {
      confidence += 0.03;
    }

    // Boost for population-based importance score
    if (candidate.importance_score !== null && candidate.importance_score > 0) {
      confidence += Math.min(0.05, candidate.importance_score / 10);
    }

    // Slight penalty for lower ranking (but preserve order)
    confidence -= index * 0.01;

    // Clamp to [0, 1]
    confidence = Math.max(0.0, Math.min(1.0, confidence));

    // Parse alt_names from JSON
    let altNames: string[] | undefined;
    if (candidate.alt_names) {
      try {
        altNames = JSON.parse(candidate.alt_names);
      } catch {
        altNames = undefined;
      }
    }

    return {
      id: candidate.ssr_id,
      name: candidate.primary_name,
      alt_names: altNames,
      lat: candidate.lat,
      lon: candidate.lon,
      municipality_name: candidate.municipality_name || undefined,
      municipality_code: candidate.municipality_code || undefined,
      county_name: candidate.county_name || undefined,
      place_class: candidate.place_class || undefined,
      confidence,
      source: 'SSR/Stedsnavn' as const,
    };
  });
}

/**
 * Main resolver: resolve a Norwegian place name to coordinates
 */
export function resolveName(
  db: PlacesDB,
  options: ResolveOptions
): PlaceMatch[] {
  const startTime = Date.now();

  // Normalize query
  const normalized = normalizeNorwegian(options.query);

  logger.debug('Resolving place name', {
    query: options.query,
    normalized,
    limit: options.limit
  });

  // Search strategies
  const exactPrimary = db.findExactPrimary(normalized);
  const exactAlt = db.findExactAlt(normalized);
  const ftsResults = db.findFTS(normalized, options.limit * 3);

  logger.debug('Search results', {
    exactPrimary: exactPrimary.length,
    exactAlt: exactAlt.length,
    fts: ftsResults.length,
  });

  // Merge candidates
  const candidates = mergeCandidates(exactPrimary, exactAlt, ftsResults);

  // Apply filters
  const filtered = applyFilters(candidates, options);

  // Assign confidence scores
  const scored = assignConfidence(filtered, options.query);

  // Return top N
  const results = scored.slice(0, options.limit);

  const duration = Date.now() - startTime;
  logger.info('Place name resolution complete', {
    query: options.query,
    resultsCount: results.length,
    durationMs: duration,
    topConfidence: results[0]?.confidence,
  });

  return results;
}

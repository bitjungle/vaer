/**
 * Attribution helper for MET Norway license and credit information
 */

import type { Attribution, SourceMetadata, CacheMetadata } from './types.js';

/**
 * MET Norway license information (CC BY 4.0)
 */
const MET_LICENSE_URI = 'https://api.met.no/doc/License';
const MET_CREDIT_LINE =
  'Data from MET Norway Weather API (https://api.met.no/)';

/**
 * Get MET Norway attribution information
 *
 * Returns the license URI and credit line required by MET Norway's terms of use.
 * All responses that include MET data must include this attribution.
 *
 * @returns Attribution object with license URI and credit line
 */
export function getAttribution(): Attribution {
  return {
    licenseUri: MET_LICENSE_URI,
    creditLine: MET_CREDIT_LINE,
  };
}

/**
 * Build source metadata for a tool response
 *
 * Combines attribution information with cache metadata and product details.
 * This should be included in the structuredContent of all tool responses.
 *
 * @param product - Name of the MET product (e.g., "Locationforecast 2.0")
 * @param cache - Cache metadata from proxy response
 * @returns Complete source metadata object
 */
export function buildSourceMetadata(
  product: string,
  cache: CacheMetadata
): SourceMetadata {
  const attribution = getAttribution();

  return {
    provider: 'MET Norway',
    product,
    licenseUri: attribution.licenseUri,
    creditLine: attribution.creditLine,
    cached: cache.cached,
    ageSeconds: cache.ageSeconds,
  };
}

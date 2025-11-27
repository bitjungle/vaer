/**
 * Geographic coverage validators for MET APIs
 *
 * Different MET APIs have different geographic coverage:
 * - Locationforecast: Global
 * - Nowcast: Nordic region (roughly 55-72°N, 4-32°E)
 * - Air Quality: Norway only (roughly 58-71°N, 4-31°E)
 * - Gribfiles (marine): Coastal Norway (Oslo fjord + Western Norway)
 */

/**
 * Check if coordinates are within the Nordic region (for Nowcast)
 *
 * Nowcast covers roughly:
 * - Latitude: 55°N to 72°N
 * - Longitude: 4°E to 32°E
 *
 * This is a conservative bounding box approximation.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @returns True if location is within Nordic coverage
 */
export function isNordic(lat: number, lon: number): boolean {
  return lat >= 55 && lat <= 72 && lon >= 4 && lon <= 32;
}

/**
 * Check if coordinates are within Norway (for Air Quality)
 *
 * Norway coverage roughly:
 * - Latitude: 58°N to 71°N
 * - Longitude: 4°E to 31°E
 *
 * This is a conservative bounding box approximation.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @returns True if location is within Norway
 */
export function isNorway(lat: number, lon: number): boolean {
  return lat >= 58 && lat <= 71 && lon >= 4 && lon <= 31;
}

/**
 * Check if coordinates are within coastal Norway (for Gribfiles marine data)
 *
 * Coastal Norway coverage roughly:
 * - Oslo fjord area: 59-60°N, 10-11°E
 * - Western Norway: 58-63°N, 5-8°E
 *
 * This is a simplified check. In reality, coverage is more complex.
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @returns True if location is within coastal coverage
 */
export function isCoastalNorway(lat: number, lon: number): boolean {
  // Oslo fjord area
  const isOsloFjord =
    lat >= 59 && lat <= 60.5 && lon >= 10 && lon <= 11.5;

  // Western Norway coastal region
  const isWesternCoast =
    lat >= 58 && lat <= 63 && lon >= 4.5 && lon <= 8;

  return isOsloFjord || isWesternCoast;
}

/**
 * Validate coordinates are within valid ranges
 *
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @throws Error if coordinates are invalid
 */
export function validateCoordinates(lat: number, lon: number): void {
  if (lat < -90 || lat > 90) {
    throw new Error(
      `Invalid latitude: ${lat}. Must be between -90 and 90.`
    );
  }
  if (lon < -180 || lon > 180) {
    throw new Error(
      `Invalid longitude: ${lon}. Must be between -180 and 180.`
    );
  }
}

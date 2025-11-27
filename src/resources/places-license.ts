/**
 * Places license resource - Kartverket Stedsnavn licensing information
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

export const PLACES_LICENSE_URI = 'places://license/ssr';
export const PLACES_LICENSE_NAME = 'Norwegian Place Names License';
export const PLACES_LICENSE_DESCRIPTION =  'License and attribution information for Kartverket Stedsnavn data';

export function readPlacesLicenseResource(): ReadResourceResult {
  const content = `# Kartverket Stedsnavn License

## Data Source

Place name data from **Kartverket Stedsnavn** (Norwegian Mapping Authority Place Names Register).

- **Provider**: Kartverket (Norwegian Mapping Authority)
- **Product**: Stedsnavn (SSR - Sentralt stedsnavnregister)
- **Coverage**: Norway
- **Format**: SQLite database derived from PostGIS dump

## License

This data is licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

- **License URL**: https://creativecommons.org/licenses/by/4.0/
- **SPDX Identifier**: CC-BY-4.0

## Attribution Requirements

When using this data, you must provide attribution:

> Place name data from Kartverket Stedsnavn

Or in Norwegian:

> Stedsnavn fra Kartverket

## Terms of Use

- ✓ Commercial use allowed
- ✓ Modification allowed
- ✓ Distribution allowed
- ✓ Private use allowed
- ⚠ Attribution required

## More Information

- **Kartverket**: https://www.kartverket.no/
- **Stedsnavn database**: https://www.kartverket.no/til-lands/stedsnavn
- **Terms of use**: https://www.kartverket.no/api-og-data/vilkar-for-bruk
- **API and data**: https://www.kartverket.no/api-og-data

## Implementation Notes

This MCP server uses a local SQLite database derived from the Kartverket Stedsnavn PostGIS dump. The data is:

- Reprojected from EPSG:25833 (UTM Zone 33) to EPSG:4326 (WGS84)
- Filtered to populated places (cities, towns, villages, etc.)
- Indexed for fast full-text search
- Cached locally (no network calls for place lookups)

The database is updated independently via an ETL pipeline. See \`scripts/etl/README.md\` for details.
`;

  return {
    contents: [{
      uri: PLACES_LICENSE_URI,
      mimeType: 'text/markdown',
      text: content
    }]
  };
}

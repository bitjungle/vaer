/**
 * License resource for MET Norway attribution
 */

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * License resource URI
 */
export const LICENSE_RESOURCE_URI = 'metno://license';

/**
 * License resource name
 */
export const LICENSE_RESOURCE_NAME = 'MET Norway License & Attribution';

/**
 * License resource description
 */
export const LICENSE_RESOURCE_DESCRIPTION =
  'License and attribution information for MET Norway Weather API data';

/**
 * License content (Markdown format)
 */
const LICENSE_CONTENT = `# MET Norway License & Attribution

## License

All data from MET Norway Weather API is licensed under:

**Creative Commons Attribution 4.0 International (CC BY 4.0)**

License URL: https://api.met.no/doc/License

## Required Attribution

When using data from MET Norway Weather API, you must provide appropriate attribution:

**Credit Line:**
\`\`\`
Data from MET Norway Weather API (https://api.met.no/)
\`\`\`

## Terms of Use

1. **Attribution Required**: You must give appropriate credit, provide a link to the license, and indicate if changes were made.

2. **User-Agent Required**: All requests to api.met.no must include a proper User-Agent header identifying your application and providing contact information.

3. **Rate Limits**: Respect rate limits and caching recommendations to avoid overloading the service.

4. **Responsible Use**: Use the API responsibly and in accordance with MET Norway's terms of service.

## Additional Information

- Full license text: https://creativecommons.org/licenses/by/4.0/
- MET Norway terms: https://api.met.no/doc/TermsOfService
- API documentation: https://api.met.no/

## This MCP Server

This MCP server provides access to MET Norway data through a local proxy (metno-proxy) that:
- Handles User-Agent requirements
- Implements caching to reduce upstream load
- Enforces rate limiting for responsible use

All responses from this server include attribution information in the \`source\` field.
`;

/**
 * Read the license resource
 *
 * Returns the MET Norway license and attribution information in Markdown format.
 *
 * @returns MCP resource read result
 */
export function readLicenseResource(): ReadResourceResult {
  return {
    contents: [
      {
        uri: LICENSE_RESOURCE_URI,
        mimeType: 'text/markdown',
        text: LICENSE_CONTENT,
      },
    ],
  };
}

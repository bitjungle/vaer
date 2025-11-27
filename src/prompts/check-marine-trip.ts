/**
 * Check Marine Trip Prompt
 * Helps assess safety of marine trips
 */

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export const CHECK_MARINE_TRIP_PROMPT_NAME = 'check_marine_trip';
export const CHECK_MARINE_TRIP_PROMPT_DESCRIPTION =
  'Assess marine conditions and safety for a planned boat trip';

/**
 * Prompt arguments schema
 */
export const CheckMarineTripArgsSchema = z.object({
  routeDescription: z
    .string()
    .describe('Description of the route (e.g., "Oslo to Nesodden")'),
  latStart: z.number().min(-90).max(90).describe('Starting latitude'),
  lonStart: z.number().min(-180).max(180).describe('Starting longitude'),
  latEnd: z.number().min(-90).max(90).describe('Ending latitude'),
  lonEnd: z.number().min(-180).max(180).describe('Ending longitude'),
  departureTime: z
    .string()
    .describe('Planned departure time (ISO 8601 format or description like "tomorrow morning")'),
  vesselType: z
    .enum(['kayak', 'small_sailboat', 'motorboat', 'ship'])
    .describe('Type of vessel'),
});

export type CheckMarineTripArgs = z.infer<typeof CheckMarineTripArgsSchema>;

/**
 * Generate the prompt
 */
export async function getCheckMarineTripPrompt(
  args: CheckMarineTripArgs
): Promise<GetPromptResult> {
  const {
    routeDescription,
    latStart,
    lonStart,
    latEnd,
    lonEnd,
    departureTime,
    vesselType,
  } = args;

  const promptMessage = `You are helping assess the safety of a marine trip. Use the weather.assess_marine_trip_risk tool to evaluate conditions.

**Trip Details:**
- Route: ${routeDescription}
- Start: ${latStart}°N, ${lonStart}°E
- End: ${latEnd}°N, ${lonEnd}°E
- Departure: ${departureTime}
- Vessel: ${vesselType}

**Your Task:**
1. Call weather.assess_marine_trip_risk with:
   - route: [
       { lat: ${latStart}, lon: ${lonStart}, name: "Start" },
       { lat: ${latEnd}, lon: ${lonEnd}, name: "End" }
     ]
   - vesselType: "${vesselType}"
   - timeWindow: Cover the departure time (use appropriate preset or absolute times)
   - language: "en"

2. Analyze the risk assessment and present:
   - Overall risk level (safe, caution, dangerous, extreme)
   - Specific hazards along the route:
     * High wave conditions
     * Strong winds
     * Poor visibility
     * Cold water temperature
   - Risk hotspots (specific locations with high risk)

3. Provide clear recommendations:
   - If SAFE: Confirm it's suitable to proceed, mention any minor considerations
   - If CAUTION: Explain specific risks and suggest precautions (proper gear, experience required, monitor conditions)
   - If DANGEROUS/EXTREME: Strongly recommend postponing or choosing alternative route/time

4. Format your response:
   - Start with risk level in bold
   - Bullet points for key conditions
   - Clear recommendation at the end

**Important:**
- Always credit: "Marine forecast from MET Norway's Weather API"
- Be safety-conscious - err on the side of caution
- Consider vessel type (kayak is more sensitive to conditions than a ship)
- Mention if the trip is outside Norwegian coastal waters (limited coverage)

Begin by calling the tool now.`;

  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: promptMessage,
        },
      },
    ],
  };
}

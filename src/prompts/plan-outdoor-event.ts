/**
 * Plan Outdoor Event Prompt
 * Helps users find the best time for outdoor events
 */

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export const PLAN_OUTDOOR_EVENT_PROMPT_NAME = 'plan_outdoor_event';
export const PLAN_OUTDOOR_EVENT_PROMPT_DESCRIPTION =
  'Find the best time window for an outdoor event based on weather conditions';

/**
 * Prompt arguments schema
 */
export const PlanOutdoorEventArgsSchema = z.object({
  locationName: z.string().describe('Name of the location (e.g., "Oslo, Norway")'),
  lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees'),
  lon: z.number().min(-180).max(180).describe('Longitude in decimal degrees'),
  date: z.string().describe('Target date for the event (YYYY-MM-DD)'),
  timezone: z
    .string()
    .default('Europe/Oslo')
    .describe('Timezone for the event (e.g., "Europe/Oslo", "America/New_York")'),
  activityType: z
    .enum(['running', 'cycling', 'hiking', 'kids_playground', 'commuting', 'custom'])
    .default('custom')
    .describe('Type of outdoor activity'),
});

export type PlanOutdoorEventArgs = z.infer<typeof PlanOutdoorEventArgsSchema>;

/**
 * Generate the prompt
 */
export async function getPlanOutdoorEventPrompt(
  args: PlanOutdoorEventArgs
): Promise<GetPromptResult> {
  const { locationName, lat, lon, date, timezone, activityType } = args;

  // Build the prompt message
  const promptMessage = `You are helping plan an outdoor event. Use the weather.assess_outdoor_activity_window tool to find the best time windows.

**Event Details:**
- Location: ${locationName} (${lat}°N, ${lon}°E)
- Date: ${date}
- Timezone: ${timezone}
- Activity Type: ${activityType}

**Your Task:**
1. Call weather.assess_outdoor_activity_window with:
   - location: { lat: ${lat}, lon: ${lon} }
   - activity: "${activityType}"
   - timeWindow: Cover the target date ${date} (use appropriate from/to times in UTC or use preset)
   - language: "en"

2. Analyze the response and present:
   - 2-3 best time windows for the event
   - Specific temperature, wind speed, and precipitation conditions for each window
   - A clear recommendation with reasoning

3. Format your response clearly:
   - Start with a brief summary (e.g., "Best times for your ${activityType} event in ${locationName} on ${date}:")
   - List each time window with:
     * Time range (convert to ${timezone} timezone)
     * Temperature range
     * Wind conditions
     * Precipitation forecast
   - End with a recommendation

**Important:**
- Always credit the forecast: "Forecast from MET Norway's Weather API"
- If no ideal windows exist, suggest alternative times or dates
- Consider the activity type's specific requirements (e.g., runners prefer cooler temps, kids need warmer weather)

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

/**
 * Air Quality Advice Prompt
 * Provides health recommendations based on air quality
 */

import { z } from 'zod';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export const AIR_QUALITY_ADVICE_PROMPT_NAME = 'air_quality_advice';
export const AIR_QUALITY_ADVICE_PROMPT_DESCRIPTION =
  'Get personalized air quality advice for vulnerable groups';

/**
 * Prompt arguments schema
 */
export const AirQualityAdviceArgsSchema = z.object({
  lat: z.number().min(-90).max(90).describe('Latitude in decimal degrees'),
  lon: z.number().min(-180).max(180).describe('Longitude in decimal degrees'),
  date: z
    .string()
    .optional()
    .describe('Target date for advice (YYYY-MM-DD, defaults to today)'),
  hasAsthma: z
    .boolean()
    .default(false)
    .describe('Whether the person has asthma or respiratory conditions'),
  isPregnant: z
    .boolean()
    .default(false)
    .describe('Whether the person is pregnant'),
  hasChildren: z
    .boolean()
    .default(false)
    .describe('Whether there are young children in the household'),
});

export type AirQualityAdviceArgs = z.infer<typeof AirQualityAdviceArgsSchema>;

/**
 * Generate the prompt
 */
export async function getAirQualityAdvicePrompt(
  args: AirQualityAdviceArgs
): Promise<GetPromptResult> {
  const { lat, lon, date, hasAsthma, isPregnant, hasChildren } = args;

  // Identify vulnerable groups
  const vulnerableGroups: string[] = [];
  if (hasAsthma) vulnerableGroups.push('people with asthma or respiratory conditions');
  if (isPregnant) vulnerableGroups.push('pregnant individuals');
  if (hasChildren) vulnerableGroups.push('young children');

  const vulnerableText =
    vulnerableGroups.length > 0
      ? `The person seeking advice has these considerations: ${vulnerableGroups.join(', ')}.`
      : 'The person seeking advice is from the general population.';

  const dateText = date ? ` for ${date}` : ' for today';

  const promptMessage = `You are providing personalized air quality health advice. Use the weather.get_air_quality tool to get current air quality data.

**Location:**
- Coordinates: ${lat}°N, ${lon}°E
- Date: ${dateText}

**Vulnerable Group Context:**
${vulnerableText}

**Your Task:**
1. Call weather.get_air_quality with:
   - location: { lat: ${lat}, lon: ${lon} }
   - timeWindow: ${date ? `Cover the date ${date}` : `Use preset: "next_24h"`}
   - language: "en"

2. Analyze the air quality data and provide:
   - Current AQI (Air Quality Index) level and interpretation:
     * 0-50: Good (green) - Air quality is satisfactory
     * 51-100: Moderate (yellow) - Acceptable for most, sensitive groups may experience minor effects
     * 101-150: Unhealthy for Sensitive Groups (orange)
     * 151-200: Unhealthy (red)
     * 201-300: Very Unhealthy (purple)
     * 301+: Hazardous (maroon)

   - Dominant pollutant (the one with highest concentration):
     * PM2.5 (fine particles)
     * PM10 (coarse particles)
     * NO2 (nitrogen dioxide)
     * O3 (ozone)

   - Health implications based on AQI level and dominant pollutant

3. Provide specific recommendations:
   ${hasAsthma ? '- For asthma/respiratory conditions: When to avoid outdoor activities, when to use inhaler preventively' : ''}
   ${isPregnant ? '- For pregnancy: Safe activity levels, when to stay indoors' : ''}
   ${hasChildren ? '- For young children: Safe outdoor play times, window opening advice' : ''}
   - General advice: Best times for outdoor activities, whether windows should be kept closed

4. Format your response:
   - Start with AQI level and color code
   - Brief explanation of what it means
   - Specific recommendations in bullet points
   - Best/worst hours if there's variation throughout the day

**Important:**
- Always credit: "Air quality data from MET Norway's Weather API"
- Be clear and actionable - avoid medical jargon
- If AQI is good, reassure but still provide basic advice
- If AQI is concerning, be emphatic about precautions
- Note: This data is for Norwegian locations only

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

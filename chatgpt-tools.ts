/**
 * ChatGPT/OpenAI MCP Required Tools Implementation
 * Provides search and fetch tools required for ChatGPT connectors
 */

import { log, debug, warn } from "./logger.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";
import { UCRIntervalsClient } from "./ucr-intervals-client.ts";
import { UCRCalculator } from "./ucr-calculator.ts";
import type { UCRCalculationInput } from "./ucr-types.ts";

export interface SearchParams {
  query: string;
  type?: "activities" | "wellness" | "ucr" | "all";
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface FetchParams {
  resource: "activity" | "wellness" | "ucr";
  id: string; // Activity ID or date (YYYY-MM-DD)
}

export class ChatGPTToolHandler {
  private intervalsClient: IntervalsAPIClient;
  private ucrClient: UCRIntervalsClient;
  private ucrCalculator: UCRCalculator;

  constructor(apiOptions: { athlete_id: string; api_key: string }) {
    this.intervalsClient = new IntervalsAPIClient(apiOptions);
    this.ucrClient = new UCRIntervalsClient(apiOptions);
    this.ucrCalculator = new UCRCalculator();
  }

  /**
   * Search for activities, wellness data, or UCR assessments
   * Required tool for ChatGPT MCP connectors
   */
  async search(params: SearchParams): Promise<any> {
    const { query, type = "all", limit = 10 } = params;
    const results: any = {};

    debug(`ChatGPT search: query="${query}", type=${type}, limit=${limit}`);

    try {
      // Parse date from query if present
      const dateMatch = query.match(/\d{4}-\d{2}-\d{2}/);
      const date = dateMatch ? dateMatch[0] : new Date().toISOString().split('T')[0];

      // Search activities
      if (type === "activities" || type === "all") {
        const activitiesResponse = await this.intervalsClient.getActivities({
          limit: Math.min(limit, 50),
          oldest: params.dateFrom || this.getDefaultOldestDate(),
          newest: params.dateTo || date
        });

        // Filter activities based on query
        const activities = activitiesResponse.data || [];
        const filtered = this.filterActivities(activities, query);
        if (filtered.length > 0) {
          results.activities = filtered.slice(0, limit);
        }
      }

      // Search wellness data
      if (type === "wellness" || type === "all") {
        try {
          const wellnessResponse = await this.intervalsClient.getWellnessData({
            oldest: date,
            newest: date,
            limit: 1
          });
          const wellness = wellnessResponse.data?.[0];
          if (wellness) {
            results.wellness = {
              date,
              data: wellness
            };
          }
        } catch (error) {
          debug(`Wellness search error: ${error}`);
        }
      }

      // Search UCR assessments
      if (type === "ucr" || type === "all") {
        try {
          // UCRIntervalsClientから手動でデータを取得
          const wellness = await this.intervalsClient.getWellnessEntry(date);
          const ucrData = {
            current: wellness,
            historical: [] // 簡略化のため空配列
          };
          const ucr = this.ucrCalculator.calculate(ucrData);
          if (ucr) {
            results.ucr = {
              date,
              assessment: ucr
            };
          }
        } catch (error) {
          debug(`UCR search error: ${error}`);
        }
      }

      return {
        query,
        type,
        results,
        count: Object.keys(results).reduce(
          (sum, key) => sum + (Array.isArray(results[key]) ? results[key].length : 1),
          0
        )
      };
    } catch (error) {
      warn(`Search failed: ${error}`);
      throw new Error(`Search failed: ${error}`);
    }
  }

  /**
   * Fetch specific data by ID or date
   * Required tool for ChatGPT MCP connectors
   */
  async fetch(params: FetchParams): Promise<any> {
    const { resource, id } = params;

    debug(`ChatGPT fetch: resource=${resource}, id=${id}`);

    try {
      switch (resource) {
        case "activity":
          return await this.intervalsClient.getActivity(id);

        case "wellness":
          // ID should be date in YYYY-MM-DD format
          const wellnessData = await this.intervalsClient.getWellnessData({
            oldest: id,
            newest: id,
            limit: 1
          });
          return wellnessData.data?.[0] || null;

        case "ucr":
          // ID should be date in YYYY-MM-DD format
          // UCRIntervalsClientから手動でデータを取得
          const wellness = await this.intervalsClient.getWellnessEntry(id);
          const ucrInputData = {
            current: wellness,
            historical: [] // 簡略化のため空配列
          };
          return this.ucrCalculator.calculate(ucrInputData);

        default:
          throw new Error(`Unknown resource type: ${resource}`);
      }
    } catch (error) {
      warn(`Fetch failed: ${error}`);
      throw new Error(`Fetch failed for ${resource}/${id}: ${error}`);
    }
  }

  private filterActivities(activities: any[], query: string): any[] {
    const queryLower = query.toLowerCase();
    
    return activities.filter(activity => {
      // Search in activity name
      if (activity.name?.toLowerCase().includes(queryLower)) return true;
      
      // Search in activity type
      if (activity.type?.toLowerCase().includes(queryLower)) return true;
      
      // Search in date
      if (activity.start_date_local?.includes(query)) return true;
      
      // Search for keywords
      const keywords = ["ride", "run", "swim", "walk", "workout", "training"];
      return keywords.some(keyword => 
        queryLower.includes(keyword) && 
        activity.type?.toLowerCase().includes(keyword)
      );
    });
  }

  private getDefaultOldestDate(): string {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  }
}

// Export tool definitions for MCP registration
export const CHATGPT_TOOLS = [
  {
    name: "search",
    description: "Search for activities, wellness data, or UCR assessments in intervals.icu",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'activities this week', 'wellness today', 'UCR trend')"
        },
        type: {
          type: "string",
          enum: ["activities", "wellness", "ucr", "all"],
          description: "Type of data to search",
          default: "all"
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 10
        },
        dateFrom: {
          type: "string",
          description: "Start date for search range (YYYY-MM-DD)"
        },
        dateTo: {
          type: "string",
          description: "End date for search range (YYYY-MM-DD)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "fetch",
    description: "Fetch specific data by ID or date from intervals.icu",
    inputSchema: {
      type: "object" as const,
      properties: {
        resource: {
          type: "string",
          enum: ["activity", "wellness", "ucr"],
          description: "Type of resource to fetch"
        },
        id: {
          type: "string",
          description: "Resource ID (activity ID) or date (YYYY-MM-DD for wellness/UCR)"
        }
      },
      required: ["resource", "id"]
    }
  }
];
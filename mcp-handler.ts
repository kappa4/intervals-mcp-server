/**
 * MCP Protocol Handler for Intervals.icu
 * Based on Memory MCP successful implementation
 */

import { log, debug, warn, error } from "./logger.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";
import { UCRIntervalsClient } from "./ucr-intervals-client.ts";
import { UCRToolHandler, UCR_TOOLS } from "./ucr-tools.ts";
import { OAuthServer } from "./oauth/auth-server.ts";
import { createUnauthorizedResponse } from "./oauth/middleware.ts";
import type {
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  InitializeRequest,
  InitializeResponse,
  ListToolsResponse,
  CallToolRequest,
  CallToolResponse,
  ListResourcesResponse,
  ReadResourceRequest,
  ReadResourceResponse,
} from "./mcp-types.ts";
import { MCP_ERROR_CODES } from "./mcp-types.ts";

export class MCPHandler {
  private initialized = false;
  private clientInfo?: { name: string; version: string };
  private intervalsClient: IntervalsAPIClient;
  private ucrToolHandler: UCRToolHandler;
  private oauthServer: OAuthServer;

  constructor(intervalsClient: IntervalsAPIClient, oauthServer: OAuthServer) {
    this.intervalsClient = intervalsClient;
    this.oauthServer = oauthServer;
    
    // UCRツールハンドラーを初期化
    const apiOptions = {
      athlete_id: Deno.env.get("ATHLETE_ID")!,
      api_key: Deno.env.get("API_KEY")!,
    };
    this.ucrToolHandler = new UCRToolHandler(apiOptions);
    
    debug("MCP Handler initialized with OAuth authentication and UCR tools");
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Enhanced logging for debugging OAuth issues
    const authHeader = req.headers.get("Authorization");
    const userAgent = req.headers.get("User-Agent") || "Unknown";
    debug(`Handling MCP HTTP request: ${req.method} ${path}`);
    debug(`User-Agent: ${userAgent}`);
    debug(`Authorization: ${authHeader ? "Bearer token present" : "No auth header"}`);

    // CORS headers for all MCP responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-session-id, Accept",
      "Access-Control-Expose-Headers": "mcp-session-id",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      let mcpRequest: MCPRequest;

      // Parse MCP request from HTTP request
      if (req.method === "POST") {
        mcpRequest = await req.json();
      } else if (req.method === "GET") {
        // Handle SSE or simple GET requests
        const searchParams = url.searchParams;
        mcpRequest = {
          jsonrpc: "2.0",
          id: searchParams.get("id") || "get-request",
          method: searchParams.get("method") || "tools/list",
          params: Object.fromEntries(searchParams.entries())
        };
      } else {
        throw new Error(`Unsupported HTTP method: ${req.method}`);
      }

      // Check if authentication is required for this method
      const authNotRequiredMethods = ["initialize", "initialized", "notifications/initialized"];
      const requiresAuth = !authNotRequiredMethods.includes(mcpRequest.method);

      debug(`Method: ${mcpRequest.method}, Requires auth: ${requiresAuth}`);

      if (requiresAuth) {
        // Authentication check for protected endpoints
        const authContext = await this.oauthServer.authenticate(req);
        debug(`Auth context: authenticated=${authContext.authenticated}, client_id=${authContext.client_id || 'none'}`);
        
        if (!authContext.authenticated) {
          warn(`MCP request rejected - authentication required for method: ${mcpRequest.method}`);
          warn(`Auth failure details: ${JSON.stringify(authContext)}`);
          return createUnauthorizedResponse("Authentication required for MCP access");
        }
        debug(`MCP request authenticated for client: ${authContext.client_id}`);
      } else {
        debug(`Bypassing authentication for method: ${mcpRequest.method}`);
      }

      const mcpResponse = await this.handleMCPRequest(mcpRequest);
      
      // If no response (for notifications), return 202 Accepted with no body
      if (!mcpResponse) {
        debug("Notification processed, returning 202 Accepted");
        return new Response(null, {
          status: 202,
          headers: {
            ...corsHeaders,
            "mcp-session-id": crypto.randomUUID(),
          },
        });
      }
      
      return new Response(JSON.stringify(mcpResponse), {
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        },
      });
    } catch (err) {
      error("Error handling MCP HTTP request:", err);
      return new Response(
        JSON.stringify({
          error: "mcp_error",
          message: err instanceof Error ? err.message : "Internal server error"
        }),
        {
          status: 500,
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json" 
          },
        }
      );
    }
  }

  private async handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    debug(`Handling MCP request: ${request.method}`, request);

    try {
      let result: any;

      switch (request.method) {
        case "initialize":
          result = await this.handleInitialize(request.params as InitializeRequest);
          break;
        case "initialized":
        case "notifications/initialized":
          // No response needed for notification
          debug("Client sent initialized notification");
          if (!request.id) {
            // Notifications don't have id, so return nothing
            // This will be handled by the HTTP handler to return 202 Accepted
            return null as any;
          }
          return this.createResponse(request.id, {});
        case "tools/list":
          result = await this.handleListTools();
          break;
        case "tools/call":
          result = await this.handleCallTool(request.params as CallToolRequest);
          break;
        case "resources/list":
          result = await this.handleListResources();
          break;
        case "resources/read":
          result = await this.handleReadResource(request.params as ReadResourceRequest);
          break;
        default:
          throw this.createError(MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method ${request.method} not found`);
      }

      return this.createResponse(request.id, result);
    } catch (err) {
      error(`Error handling request ${request.method}:`, err);
      return this.createErrorResponse(request.id, err);
    }
  }

  private async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.clientInfo = params.clientInfo;
    this.initialized = true;

    debug(`Initialized with client: ${params.clientInfo.name} v${params.clientInfo.version}`);

    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
        logging: {}
      },
      serverInfo: {
        name: "intervals-mcp-server",
        version: "1.0.0"
      }
    };
  }

  private async handleListTools(): Promise<ListToolsResponse> {
    debug("handleListTools called - preparing tool list");
    
    const intervalTools = [
        {
          name: "get_activities",
          description: "Get recent activities from Intervals.icu. If no date range is specified, returns activities from the last 30 days.",
          inputSchema: {
            type: "object" as const,
            properties: {
              limit: {
                type: "number",
                description: "Number of activities to retrieve (default: 10, max: 50)",
                default: 10
              },
              type: {
                type: "string",
                description: "Activity type filter (e.g., 'Ride', 'Run', 'Swim')"
              },
              oldest: {
                type: "string",
                description: "Oldest date to include (YYYY-MM-DD format). Defaults to 30 days ago if not specified."
              },
              newest: {
                type: "string", 
                description: "Newest date to include (YYYY-MM-DD format). Defaults to today if not specified."
              }
            }
          }
        },
        {
          name: "get_activity",
          description: "Get detailed information about a specific activity",
          inputSchema: {
            type: "object" as const,
            properties: {
              activity_id: {
                type: "string",
                description: "The ID of the activity to retrieve"
              }
            },
            required: ["activity_id"]
          }
        },
        {
          name: "get_wellness",
          description: "Get wellness data from Intervals.icu",
          inputSchema: {
            type: "object" as const,
            properties: {
              limit: {
                type: "number",
                description: "Number of entries to retrieve (default: 7, max: 30)",
                default: 7
              },
              oldest: {
                type: "string",
                description: "Oldest date to include (YYYY-MM-DD format)"
              },
              newest: {
                type: "string",
                description: "Newest date to include (YYYY-MM-DD format)"
              }
            }
          }
        },
        {
          name: "update_wellness",
          description: "Update wellness data for a specific date",
          inputSchema: {
            type: "object" as const,
            properties: {
              date: {
                type: "string",
                description: "Date for wellness entry (YYYY-MM-DD format)"
              },
              sleep_quality: {
                type: "number",
                description: "Sleep quality rating (1-5)"
              },
              sleep_hours: {
                type: "number",
                description: "Hours of sleep"
              },
              soreness: {
                type: "number",
                description: "Soreness level (1-5)"
              },
              fatigue: {
                type: "number",
                description: "Fatigue level (1-5)"
              },
              stress: {
                type: "number", 
                description: "Stress level (1-5)"
              },
              motivation: {
                type: "number",
                description: "Motivation level (1-5)"
              },
              weight: {
                type: "number",
                description: "Body weight in kg"
              },
              notes: {
                type: "string",
                description: "Additional notes"
              }
            },
            required: ["date"]
          }
        },
        {
          name: "get_athlete_info",
          description: "Get athlete profile information",
          inputSchema: {
            type: "object" as const,
            properties: {}
          }
        }
      ];

    // UCRツールを追加
    const allTools = [...intervalTools, ...UCR_TOOLS];
    const response = { tools: allTools };
    
    debug("Returning tools list with", response.tools.length, "tools", `(${intervalTools.length} interval tools + ${UCR_TOOLS.length} UCR tools)`);
    debug("Tool names:", allTools.map(t => t.name).join(", "));
    return response;
  }

  private async handleCallTool(params: CallToolRequest): Promise<CallToolResponse> {
    const { name, arguments: args = {} } = params;

    try {
      let result: string;

      // UCRツールの処理
      const ucrToolNames = UCR_TOOLS.map(tool => tool.name);
      if (ucrToolNames.includes(name)) {
        const ucrResult = await this.ucrToolHandler.handleTool(name, args);
        result = JSON.stringify(ucrResult, null, 2);
      } else {
        // 既存のIntervals.icuツールの処理
        switch (name) {
          case "get_activities":
            result = await this.getActivities(args);
            break;
          case "get_activity":
            result = await this.getActivity(args);
            break;
          case "get_wellness":
            result = await this.getWellness(args);
            break;
          case "update_wellness":
            result = await this.updateWellness(args);
            break;
          case "get_athlete_info":
            result = await this.getAthleteInfo();
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      }

      return {
        content: [{
          type: "text",
          text: result
        }]
      };
    } catch (err) {
      error(`Error calling tool ${name}:`, err);
      return {
        content: [{
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`
        }],
        isError: true
      };
    }
  }

  private getCustomFields(obj: any, knownFields: string[]): Record<string, any> {
    const customFields: Record<string, any> = {};
    
    // Convert knownFields to a Set for O(1) lookup
    const knownFieldsSet = new Set(knownFields);
    
    for (const [key, value] of Object.entries(obj)) {
      // Skip if it's a known field, null, or undefined
      if (knownFieldsSet.has(key) || value === null || value === undefined) {
        continue;
      }
      
      // Skip internal/system fields that start with underscore or are common metadata
      if (key.startsWith('_') || key === 'cursor' || key === 'data') {
        continue;
      }
      
      // This is likely a custom field
      customFields[key] = value;
    }
    return customFields;
  }

  private formatCustomFields(customFields: Record<string, any>): string {
    let result = "";
    const entries = Object.entries(customFields);
    if (entries.length > 0) {
      result += "\n**Custom Fields:**\n";
      for (const [key, value] of entries) {
        result += `- ${key}: ${value}\n`;
      }
    }
    return result;
  }

  private async getActivities(args: any): Promise<string> {
    const { limit = 10, type, oldest, newest } = args;
    
    // If no date range is specified, default to last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activities = await this.intervalsClient.getActivities({
      limit: Math.min(limit, 50),
      type,
      oldest: oldest || thirtyDaysAgo.toISOString().split('T')[0],
      newest: newest || now.toISOString().split('T')[0]
    });

    if (activities.data.length === 0) {
      return "No activities found for the specified criteria.";
    }

    let result = `Found ${activities.data.length} activities:\n\n`;
    
    for (const activity of activities.data) {
      const date = new Date(activity.start_date_local).toLocaleDateString();
      const distance = activity.distance ? `${(activity.distance / 1000).toFixed(1)}km` : "N/A";
      const duration = activity.moving_time ? `${Math.floor(activity.moving_time / 60)}min` : "N/A";
      
      result += `**${activity.name}** (ID: ${activity.id})\n`;
      result += `- Date: ${date}\n`;
      result += `- Type: ${activity.type}\n`;
      result += `- Distance: ${distance}\n`;
      result += `- Duration: ${duration}\n`;
      if (activity.icu_training_load) {
        result += `- Training Load: ${activity.icu_training_load}\n`;
      }
      
      // Add custom fields if any
      const knownFields = [
        'id', 'start_date_local', 'type', 'name', 'description', 'distance',
        'moving_time', 'elapsed_time', 'total_elevation_gain', 'trainer',
        'commute', 'icu_training_load', 'icu_atl', 'icu_ctl', 'icu_tss',
        'icu_intensity', 'icu_ri', 'icu_ef', 'icu_hr_zones', 'icu_power_zones',
        'power_meter', 'power_meter_battery', 'heart_rate_monitor', 'external_id',
        'created', 'updated'
      ];
      const customFields = this.getCustomFields(activity, knownFields);
      if (Object.keys(customFields).length > 0) {
        result += "**Custom Fields:**\n";
        for (const [key, value] of Object.entries(customFields)) {
          result += `- ${key}: ${value}\n`;
        }
      }
      
      result += "\n";
    }

    return result;
  }

  private async getActivity(args: any): Promise<string> {
    const { activity_id } = args;
    
    if (!activity_id) {
      throw new Error("activity_id is required");
    }

    const activity = await this.intervalsClient.getActivity(activity_id);
    
    const date = new Date(activity.start_date_local).toLocaleDateString();
    const distance = activity.distance ? `${(activity.distance / 1000).toFixed(1)}km` : "N/A";
    const duration = activity.moving_time ? `${Math.floor(activity.moving_time / 60)}min` : "N/A";
    
    let result = `**${activity.name}** (ID: ${activity.id})\n\n`;
    result += `- Date: ${date}\n`;
    result += `- Type: ${activity.type}\n`;
    result += `- Distance: ${distance}\n`;
    result += `- Duration: ${duration}\n`;
    
    if (activity.description) {
      result += `- Description: ${activity.description}\n`;
    }
    
    if (activity.icu_training_load) {
      result += `- Training Load: ${activity.icu_training_load}\n`;
    }
    
    if (activity.icu_intensity) {
      result += `- Intensity: ${activity.icu_intensity}\n`;
    }
    
    // Add custom fields if any
    const knownFields = [
      'id', 'start_date_local', 'type', 'name', 'description', 'distance',
      'moving_time', 'elapsed_time', 'total_elevation_gain', 'trainer',
      'commute', 'icu_training_load', 'icu_atl', 'icu_ctl', 'icu_tss',
      'icu_intensity', 'icu_ri', 'icu_ef', 'icu_hr_zones', 'icu_power_zones',
      'power_meter', 'power_meter_battery', 'heart_rate_monitor', 'external_id',
      'created', 'updated'
    ];
    const customFields = this.getCustomFields(activity, knownFields);
    result += this.formatCustomFields(customFields);
    
    return result;
  }

  private async getWellness(args: any): Promise<string> {
    const { limit = 7, oldest, newest } = args;
    
    const wellness = await this.intervalsClient.getWellnessData({
      limit: Math.min(limit, 30),
      oldest,
      newest
    });

    if (wellness.data.length === 0) {
      return "No wellness data found for the specified period.";
    }

    let result = `Wellness data (${wellness.data.length} entries):\n\n`;
    
    for (const entry of wellness.data) {
      result += `**${entry.date}**\n`;
      if (entry.sleep_quality) result += `- Sleep Quality: ${entry.sleep_quality}/5\n`;
      if (entry.sleep_hours) result += `- Sleep Hours: ${entry.sleep_hours}h\n`;
      if (entry.soreness) result += `- Soreness: ${entry.soreness}/5\n`;
      if (entry.fatigue) result += `- Fatigue: ${entry.fatigue}/5\n`;
      if (entry.stress) result += `- Stress: ${entry.stress}/5\n`;
      if (entry.motivation) result += `- Motivation: ${entry.motivation}/5\n`;
      if (entry.weight) result += `- Weight: ${entry.weight}kg\n`;
      if (entry.resting_hr) result += `- Resting HR: ${entry.resting_hr}bpm\n`;
      if (entry.notes) result += `- Notes: ${entry.notes}\n`;
      
      // Check for user_data field which might contain custom fields
      if (entry.user_data && typeof entry.user_data === 'object') {
        const userDataEntries = Object.entries(entry.user_data);
        if (userDataEntries.length > 0) {
          result += "**User Data (Custom Fields):**\n";
          for (const [key, value] of userDataEntries) {
            result += `- ${key}: ${value}\n`;
          }
        }
      }
      
      // Add custom fields if any
      const knownFields = [
        // From OpenAPI spec
        'abdomen', 'atl', 'atlLoad', 'avgSleepingHR', 'baevskySI', 'bloodGlucose',
        'bodyFat', 'comments', 'ctl', 'ctlLoad', 'diastolic', 'fatigue', 'hrv',
        'hrvSDNN', 'hydration', 'hydrationVolume', 'id', 'injury', 'kcalConsumed',
        'lactate', 'locked', 'menstrualPhase', 'menstrualPhasePredicted', 'mood',
        'motivation', 'rampRate', 'readiness', 'respiration', 'restingHR',
        'sleepQuality', 'sleepScore', 'sleepSecs', 'soreness', 'spO2', 'sportInfo',
        'steps', 'stress', 'systolic', 'updated', 'vo2max', 'weight',
        // Additional fields from TypeScript interface (snake_case variants)
        'created', 'date', 'sleep_quality', 'sleep_hours', 'body_fat',
        'hr_variability', 'hrv_rmssd', 'resting_hr', 'menstrual_phase',
        'sick', 'injured', 'notes', 'user_data'
      ];
      const customFields = this.getCustomFields(entry, knownFields);
      if (Object.keys(customFields).length > 0) {
        result += "**Custom Fields:**\n";
        for (const [key, value] of Object.entries(customFields)) {
          result += `- ${key}: ${value}\n`;
        }
      }
      
      result += "\n";
    }

    return result;
  }

  private async updateWellness(args: any): Promise<string> {
    const { date, ...updateData } = args;
    
    if (!date) {
      throw new Error("date is required");
    }

    const updated = await this.intervalsClient.updateWellnessEntry(date, updateData);
    
    // The API might not return the date in the response, so use the input date
    return `Successfully updated wellness data for ${updated.date || date}`;
  }

  private async getAthleteInfo(): Promise<string> {
    const athlete = await this.intervalsClient.getAthlete();
    
    let result = `**Athlete Profile**\n\n`;
    result += `- Name: ${athlete.name}\n`;
    result += `- ID: ${athlete.id}\n`;
    if (athlete.email) {
      result += `- Email: ${athlete.email}\n`;
    }
    
    if (athlete.activity_count) {
      result += `- Total Activities: ${athlete.activity_count}\n`;
    }
    
    if (athlete.time_zone) {
      result += `- Time Zone: ${athlete.time_zone}\n`;
    }
    
    if (athlete.power_meter_ftp) {
      result += `- FTP: ${athlete.power_meter_ftp}W\n`;
    }
    
    if (athlete.default_max_hr) {
      result += `- Max HR: ${athlete.default_max_hr}bpm\n`;
    }
    
    return result;
  }

  private async handleListResources(): Promise<ListResourcesResponse> {
    return {
      resources: [
        {
          uri: "intervals://athlete",
          name: "Athlete Profile",
          description: "Current athlete profile information",
          mimeType: "application/json"
        },
        {
          uri: "intervals://activities/recent",
          name: "Recent Activities",
          description: "Recent training activities",
          mimeType: "application/json"
        },
        {
          uri: "intervals://wellness/recent",
          name: "Recent Wellness Data", 
          description: "Recent wellness and recovery metrics",
          mimeType: "application/json"
        }
      ]
    };
  }

  private async handleReadResource(params: ReadResourceRequest): Promise<ReadResourceResponse> {
    const { uri } = params;

    let data: any;
    
    switch (uri) {
      case "intervals://athlete":
        data = await this.intervalsClient.getAthlete();
        break;
      case "intervals://activities/recent":
        // Default to last 30 days for recent activities
        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        data = await this.intervalsClient.getActivities({ 
          limit: 10,
          oldest: thirtyDaysAgo.toISOString().split('T')[0],
          newest: now.toISOString().split('T')[0]
        });
        break;
      case "intervals://wellness/recent":
        data = await this.intervalsClient.getWellnessData({ limit: 7 });
        break;
      default:
        throw new Error(`Unknown resource URI: ${uri}`);
    }

    return {
      contents: [{
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2)
      }]
    };
  }

  private createResponse(id: string | number, result: any): MCPResponse {
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  private createErrorResponse(id: string | number, error: any): MCPResponse {
    const mcpError: MCPError = error instanceof Error ? {
      code: MCP_ERROR_CODES.INTERNAL_ERROR,
      message: error.message
    } : error;

    return {
      jsonrpc: "2.0", 
      id,
      error: mcpError
    };
  }

  private createError(code: number, message: string, data?: any): MCPError {
    return { code, message, data };
  }
}
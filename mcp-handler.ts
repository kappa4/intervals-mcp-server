/**
 * MCP Protocol Handler for Intervals.icu
 * Based on Memory MCP successful implementation
 */

import { log, debug, warn, error } from "./logger.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";
import { UCRIntervalsClient } from "./ucr-intervals-client.ts";
import { UCRToolHandler, UCR_TOOLS } from "./ucr-tools.ts";
import { UCR_PROMPTS, generatePromptTemplate } from "./ucr-prompts.ts";
import { ChatGPTToolHandler, CHATGPT_TOOLS } from "./chatgpt-tools.ts";
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
  private chatGPTToolHandler: ChatGPTToolHandler;
  private static toolsCache?: ListToolsResponse;
  private requestTimings = new Map<string | number, number>();

  constructor(intervalsClient: IntervalsAPIClient) {
    this.intervalsClient = intervalsClient;
    
    // UCRツールハンドラーを初期化
    const apiOptions = {
      athlete_id: Deno.env.get("ATHLETE_ID")!,
      api_key: Deno.env.get("API_KEY")!,
    };
    this.ucrToolHandler = new UCRToolHandler(apiOptions);
    this.chatGPTToolHandler = new ChatGPTToolHandler(apiOptions);
    
    debug("MCP Handler initialized with UCR and ChatGPT tools");
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

      // Authentication is now handled at the main.ts level for all MCP endpoints
      // Following Memory MCP pattern where all MCP requests require authentication
      debug(`Processing MCP method: ${mcpRequest.method}`);
      
      // Log request ID for timeout tracking
      if (mcpRequest.id) {
        debug(`Request ID: ${mcpRequest.id}`);
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
    
    // Track request timing
    const startTime = Date.now();
    if (request.id) {
      this.requestTimings.set(request.id, startTime);
    }

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
        case "notifications/cancelled":
          // Handle cancellation notification per MCP spec
          const cancelParams = request.params as { requestId: string; reason?: string };
          
          // Log timing for cancelled request
          const requestId = typeof cancelParams.requestId === 'string' ? parseInt(cancelParams.requestId) : cancelParams.requestId;
          const startTime = this.requestTimings.get(requestId);
          const duration = startTime ? Date.now() - startTime : 'unknown';
          
          log("WARN", `[MCP] Request ${cancelParams.requestId} cancelled after ${duration}ms: ${cancelParams.reason || 'No reason'}`);
          
          // Clean up timing data
          if (requestId) {
            this.requestTimings.delete(requestId);
          }
          
          // Notifications don't have id and don't require response
          // Return null to signal 202 Accepted should be sent
          return null as any;
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
        case "prompts/list":
          result = await this.handleListPrompts();
          break;
        case "prompts/get":
          result = await this.handleGetPrompt(request.params as any);
          break;
        default:
          throw this.createError(MCP_ERROR_CODES.METHOD_NOT_FOUND, `Method ${request.method} not found`);
      }

      const response = this.createResponse(request.id, result);
      
      // Log request completion timing
      if (request.id && this.requestTimings.has(request.id)) {
        const duration = Date.now() - this.requestTimings.get(request.id)!;
        log("INFO", `[MCP] Request ${request.id} (${request.method}) completed in ${duration}ms`);
        this.requestTimings.delete(request.id);
      }
      
      return response;
    } catch (err) {
      error(`Error handling request ${request.method}:`, err);
      
      // Clean up timing on error
      if (request.id) {
        this.requestTimings.delete(request.id);
      }
      
      return this.createErrorResponse(request.id, err);
    }
  }

  private async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.clientInfo = params.clientInfo;
    this.initialized = true;

    log("INFO", `[MCP] Initialize called by client: ${params.clientInfo.name} v${params.clientInfo.version}`);
    debug(`Initialize request params:`, params);

    return {
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: { listChanged: true },
        resources: { list: false, read: false },
        prompts: { listChanged: true }  // Enable prompts support
      },
      serverInfo: {
        name: "intervals-mcp-server",
        version: "1.0.0"
      }
    };
  }

  private async handleListTools(): Promise<ListToolsResponse> {
    const startTime = Date.now();
    log("INFO", "[MCP] tools/list called - preparing tool list");
    debug("handleListTools called - preparing tool list");
    
    // Return cached tools if available (static data, no need to regenerate)
    if (MCPHandler.toolsCache) {
      const duration = Date.now() - startTime;
      log("INFO", `[MCP] Returning cached tools in ${duration}ms`);
      return MCPHandler.toolsCache;
    }
    
    // ChatGPT required tools first (search, fetch)
    const chatGPTTools = CHATGPT_TOOLS;
    
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
        },
        {
          name: "get_activity_intervals",
          description: "Get intervals/laps data for a specific activity",
          inputSchema: {
            type: "object" as const,
            properties: {
              activity_id: {
                type: "string",
                description: "The activity ID to get intervals for"
              }
            },
            required: ["activity_id"]
          }
        },
        {
          name: "get_activity_streams",
          description: "Get time-series stream data (heart rate, power, cadence, etc.) for a specific activity",
          inputSchema: {
            type: "object" as const,
            properties: {
              activity_id: {
                type: "string",
                description: "The activity ID to get streams for"
              },
              types: {
                type: "array",
                items: {
                  type: "string"
                },
                description: "Specific stream types to retrieve (e.g., 'heartrate', 'watts', 'cadence'). If not specified, all available streams are returned."
              }
            },
            required: ["activity_id"]
          }
        }
      ];

    // Combine all tools: ChatGPT required tools + interval tools + UCR tools
    const allTools = [...chatGPTTools, ...intervalTools, ...UCR_TOOLS];
    const response = { tools: allTools };
    
    // Cache the response for future use
    MCPHandler.toolsCache = response;
    
    const duration = Date.now() - startTime;
    log("INFO", `[MCP] Generated and cached ${response.tools.length} tools in ${duration}ms (${chatGPTTools.length} ChatGPT + ${intervalTools.length} interval + ${UCR_TOOLS.length} UCR)`);
    debug("Returning tools list with", response.tools.length, "tools", `(${chatGPTTools.length} ChatGPT + ${intervalTools.length} interval + ${UCR_TOOLS.length} UCR tools)`);
    debug("Tool names:", allTools.map(t => t.name).join(", "));
    return response;
  }

  private async handleCallTool(params: CallToolRequest): Promise<CallToolResponse> {
    const { name, arguments: args = {} } = params;

    log("INFO", `[MCP] tools/call invoked: ${name}`);

    try {
      let result: string;

      // ChatGPTツールの処理
      if (name === "search") {
        const searchResult = await this.chatGPTToolHandler.search(args as any);
        result = JSON.stringify(searchResult, null, 2);
      } else if (name === "fetch") {
        const fetchResult = await this.chatGPTToolHandler.fetch(args as any);
        result = JSON.stringify(fetchResult, null, 2);
      } 
      // UCRツールの処理
      else if (UCR_TOOLS.map(tool => tool.name).includes(name)) {
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
          case "get_activity_intervals":
            result = await this.getActivityIntervals(args);
            break;
          case "get_activity_streams":
            result = await this.getActivityStreams(args);
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
    
    // Heart rate data
    if ((activity as any).average_heartrate) {
      result += `- Avg HR: ${(activity as any).average_heartrate}bpm\n`;
    }
    if ((activity as any).max_heartrate) {
      result += `- Max HR: ${(activity as any).max_heartrate}bpm\n`;
    }
    if ((activity as any).hr_load) {
      result += `- HR Load: ${(activity as any).hr_load}\n`;
    }
    if ((activity as any).trimp) {
      result += `- TRIMP: ${(activity as any).trimp.toFixed(1)}\n`;
    }
    
    // Calories
    if ((activity as any).calories) {
      result += `- Calories: ${(activity as any).calories}kcal\n`;
    }
    
    // Weather data (temperature and humidity)
    if ((activity as any).average_temp !== null && (activity as any).average_temp !== undefined) {
      result += `- Avg Temp: ${(activity as any).average_temp}°C\n`;
    }
    if ((activity as any).max_temp !== null && (activity as any).max_temp !== undefined) {
      result += `- Max Temp: ${(activity as any).max_temp}°C\n`;
    }
    if ((activity as any).min_temp !== null && (activity as any).min_temp !== undefined) {
      result += `- Min Temp: ${(activity as any).min_temp}°C\n`;
    }
    
    if (activity.icu_training_load) {
      result += `- Training Load: ${activity.icu_training_load}\n`;
    }
    
    if (activity.icu_intensity) {
      result += `- Intensity: ${activity.icu_intensity}\n`;
    }
    
    // Device info (optional)
    if ((activity as any).device_name) {
      result += `- Device: ${(activity as any).device_name}\n`;
    }
    
    // Add custom fields if any
    const knownFields = [
      'id', 'start_date_local', 'type', 'name', 'description', 'distance',
      'moving_time', 'elapsed_time', 'total_elevation_gain', 'trainer',
      'commute', 'icu_training_load', 'icu_atl', 'icu_ctl', 'icu_tss',
      'icu_intensity', 'icu_ri', 'icu_ef', 'icu_hr_zones', 'icu_power_zones',
      'power_meter', 'power_meter_battery', 'heart_rate_monitor', 'external_id',
      'created', 'updated',
      // Add the new fields we're now explicitly handling
      'average_heartrate', 'max_heartrate', 'hr_load', 'trimp', 'calories',
      'average_temp', 'max_temp', 'min_temp', 'device_name'
    ];
    const customFields = this.getCustomFields(activity, knownFields);
    result += this.formatCustomFields(customFields);
    
    return result;
  }

  private async getWellness(args: any): Promise<string> {
    const { limit = 7, oldest, newest } = args;
    
    // intervals.icu APIにはlimitパラメータがないため、日付範囲で制御
    // デフォルトで最近のデータのみ取得するように設定
    const now = new Date();
    const defaultOldest = new Date(now);
    defaultOldest.setDate(defaultOldest.getDate() - Math.min(limit * 2, 60)); // limitの2倍または60日前まで
    
    const wellness = await this.intervalsClient.getWellnessData({
      limit: Math.min(limit, 30), // APIには送信されないが、内部処理用に保持
      oldest: oldest || defaultOldest.toISOString().split('T')[0],
      newest: newest || now.toISOString().split('T')[0]
    });

    if (wellness.data.length === 0) {
      return "No wellness data found for the specified period.";
    }

    // intervals.icu APIがlimitを無視するため、クライアント側で制限を適用
    const effectiveLimit = Math.min(limit, 30);
    const limitedData = wellness.data.slice(0, effectiveLimit);

    let result = `Wellness data (${limitedData.length} entries):\n\n`;
    
    for (const entry of limitedData) {
      // intervals.icu APIではdateフィールドがnullで、実際の日付はidフィールドに格納されている
      const displayDate = entry.date || entry.id || 'Date not available';
      result += `**${displayDate}**\n`;
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

  private async getActivityIntervals(args: any): Promise<string> {
    const { activity_id } = args;
    
    if (!activity_id) {
      throw new Error("activity_id is required");
    }

    const intervals = await this.intervalsClient.getActivityIntervals(activity_id);
    
    if (intervals.length === 0) {
      return `No intervals/laps found for activity ${activity_id}.`;
    }

    let result = `Found ${intervals.length} intervals/laps for activity ${activity_id}:\n\n`;
    
    for (let i = 0; i < intervals.length; i++) {
      const interval = intervals[i];
      result += `**Interval ${i + 1}**`;
      if (interval.name) result += `: ${interval.name}`;
      result += `\n`;
      
      if (interval.distance !== undefined) {
        result += `- Distance: ${(interval.distance / 1000).toFixed(2)}km\n`;
      }
      if (interval.moving_time !== undefined) {
        const minutes = Math.floor(interval.moving_time / 60);
        const seconds = interval.moving_time % 60;
        result += `- Duration: ${minutes}:${seconds.toString().padStart(2, '0')}\n`;
      }
      if (interval.avg_power !== undefined || interval.average_watts !== undefined) {
        const power = interval.avg_power || interval.average_watts;
        result += `- Avg Power: ${power}W\n`;
      }
      if (interval.avg_heart_rate !== undefined || interval.average_heartrate !== undefined) {
        const hr = interval.avg_heart_rate || interval.average_heartrate;
        result += `- Avg HR: ${hr}bpm\n`;
      }
      if (interval.avg_cadence !== undefined) {
        result += `- Avg Cadence: ${interval.avg_cadence}rpm\n`;
      }
      if (interval.avg_speed !== undefined) {
        result += `- Avg Speed: ${(interval.avg_speed * 3.6).toFixed(1)}km/h\n`;
      }
      if (interval.intensity) {
        result += `- Intensity: ${interval.intensity}\n`;
      }
      if (interval.type) {
        result += `- Type: ${interval.type}\n`;
      }
      
      result += "\n";
    }

    return result;
  }

  private async getActivityStreams(args: any): Promise<string> {
    const { activity_id, types } = args;
    
    if (!activity_id) {
      throw new Error("activity_id is required");
    }

    const streams = await this.intervalsClient.getActivityStreams(activity_id, types);
    
    const availableStreams = Object.keys(streams).filter(key => 
      streams[key] && Array.isArray(streams[key]) && streams[key].length > 0
    );

    if (availableStreams.length === 0) {
      return `No stream data found for activity ${activity_id}.`;
    }

    let result = `**Stream Data for Activity ${activity_id}**\n\n`;
    result += `Available streams: ${availableStreams.join(', ')}\n\n`;

    for (const streamType of availableStreams) {
      const data = streams[streamType];
      result += `**${streamType}**:\n`;
      
      if (Array.isArray(data) && data.length > 0) {
        result += `- Data points: ${data.length}\n`;
        
        // Calculate basic statistics for numeric streams
        if (typeof data[0] === 'number') {
          const numData = data as number[];
          const min = Math.min(...numData);
          const max = Math.max(...numData);
          const avg = numData.reduce((a, b) => a + b, 0) / numData.length;
          
          result += `- Min: ${min.toFixed(1)}\n`;
          result += `- Max: ${max.toFixed(1)}\n`;
          result += `- Avg: ${avg.toFixed(1)}\n`;
          
          // Show first and last few data points as sample
          const sampleSize = 5;
          if (data.length > sampleSize * 2) {
            result += `- Sample (first ${sampleSize}): ${numData.slice(0, sampleSize).map(v => v.toFixed(1)).join(', ')}\n`;
            result += `- Sample (last ${sampleSize}): ${numData.slice(-sampleSize).map(v => v.toFixed(1)).join(', ')}\n`;
          } else {
            result += `- Data: ${numData.map(v => v.toFixed(1)).join(', ')}\n`;
          }
        }
      }
      
      result += "\n";
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

  private async handleListPrompts(): Promise<any> {
    log("INFO", "[MCP] prompts/list called");
    
    const prompts = UCR_PROMPTS.map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments?.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required
      }))
    }));

    return { prompts };
  }

  private async handleGetPrompt(params: { name: string; arguments?: Record<string, any> }): Promise<any> {
    log("INFO", `[MCP] prompts/get called for prompt: ${params.name}`);
    
    const promptDef = UCR_PROMPTS.find(p => p.name === params.name);
    if (!promptDef) {
      throw this.createError(MCP_ERROR_CODES.INVALID_PARAMS, `Prompt ${params.name} not found`);
    }

    try {
      // プロンプトテンプレートを生成
      const template = generatePromptTemplate(params.name, params.arguments);
      
      // プロンプトメッセージを構築
      const messages = [
        {
          role: "user",
          content: {
            type: "text",
            text: template
          }
        }
      ];

      return {
        prompt: {
          name: params.name,
          description: promptDef.description,
          arguments: promptDef.arguments,
          messages
        }
      };
    } catch (error) {
      throw this.createError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to generate prompt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
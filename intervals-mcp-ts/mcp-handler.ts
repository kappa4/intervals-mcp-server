/**
 * MCP Protocol Handler for Intervals.icu
 * Based on Memory MCP successful implementation
 */

import { log, debug, warn, error } from "./logger.ts";
import { IntervalsAPIClient } from "./intervals-client.ts";
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
  private oauthServer: OAuthServer;

  constructor(intervalsClient: IntervalsAPIClient, oauthServer: OAuthServer) {
    this.intervalsClient = intervalsClient;
    this.oauthServer = oauthServer;
    debug("MCP Handler initialized with OAuth authentication");
  }

  async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    
    debug(`Handling MCP HTTP request: ${req.method} ${path}`);

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

    // Authentication check for non-initialization endpoints
    const authContext = await this.oauthServer.authenticate(req);
    if (!authContext.authenticated) {
      warn("MCP request rejected - authentication required");
      return createUnauthorizedResponse("Authentication required for MCP access");
    }

    debug(`MCP request authenticated for client: ${authContext.client_id}`);

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

      const mcpResponse = await this.handleMCPRequest(mcpRequest);
      
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
          message: err.message || "Internal server error"
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
          // No response needed for notification
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
    return {
      tools: [
        {
          name: "get_activities",
          description: "Get recent activities from Intervals.icu",
          inputSchema: {
            type: "object",
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
          name: "get_activity",
          description: "Get detailed information about a specific activity",
          inputSchema: {
            type: "object",
            properties: {
              activity_id: {
                type: "number",
                description: "The ID of the activity to retrieve"
              }
            },
            required: ["activity_id"]
          }
        },
        {
          name: "update_activity",
          description: "Update an activity's information",
          inputSchema: {
            type: "object",
            properties: {
              activity_id: {
                type: "number",
                description: "The ID of the activity to update"
              },
              name: {
                type: "string",
                description: "New name for the activity"
              },
              description: {
                type: "string",
                description: "New description for the activity"
              },
              type: {
                type: "string",
                description: "Activity type (e.g., 'Ride', 'Run', 'Swim')"
              }
            },
            required: ["activity_id"]
          }
        },
        {
          name: "get_wellness",
          description: "Get wellness data from Intervals.icu",
          inputSchema: {
            type: "object",
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
            type: "object",
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
            type: "object",
            properties: {}
          }
        }
      ]
    };
  }

  private async handleCallTool(params: CallToolRequest): Promise<CallToolResponse> {
    const { name, arguments: args = {} } = params;

    try {
      let result: string;

      switch (name) {
        case "get_activities":
          result = await this.getActivities(args);
          break;
        case "get_activity":
          result = await this.getActivity(args);
          break;
        case "update_activity":
          result = await this.updateActivity(args);
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
          text: `Error: ${err.message}`
        }],
        isError: true
      };
    }
  }

  private async getActivities(args: any): Promise<string> {
    const { limit = 10, type, oldest, newest } = args;
    
    const activities = await this.intervalsClient.getActivities({
      limit: Math.min(limit, 50),
      type,
      oldest,
      newest
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
    
    return result;
  }

  private async updateActivity(args: any): Promise<string> {
    const { activity_id, ...updateData } = args;
    
    if (!activity_id) {
      throw new Error("activity_id is required");
    }

    const updated = await this.intervalsClient.updateActivity(activity_id, updateData);
    
    return `Successfully updated activity "${updated.name}" (ID: ${updated.id})`;
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
    
    return `Successfully updated wellness data for ${updated.date}`;
  }

  private async getAthleteInfo(): Promise<string> {
    const athlete = await this.intervalsClient.getAthlete();
    
    let result = `**Athlete Profile**\n\n`;
    result += `- Name: ${athlete.name}\n`;
    result += `- ID: ${athlete.id}\n`;
    result += `- Email: ${athlete.user.email}\n`;
    
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
        data = await this.intervalsClient.getActivities({ limit: 10 });
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
/**
 * MCP (Model Context Protocol) type definitions
 * Based on MCP specification v2024-11-05
 */

export interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

// Initialize request/response
export interface InitializeRequest {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface InitializeResponse {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, any>;
}

export interface ServerCapabilities {
  logging?: Record<string, any>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

// Tools
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ListToolsResponse {
  tools: MCPTool[];
}

export interface CallToolRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface CallToolResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

// Resources
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ListResourcesResponse {
  resources: MCPResource[];
}

export interface ReadResourceRequest {
  uri: string;
}

export interface ReadResourceResponse {
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  }>;
}

// Prompts
export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export interface ListPromptsResponse {
  prompts: MCPPrompt[];
}

export interface GetPromptRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface GetPromptResponse {
  description?: string;
  messages: Array<{
    role: "user" | "assistant";
    content: {
      type: "text";
      text: string;
    };
  }>;
}

// Logging
export interface LoggingMessageNotification {
  level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
  data: any;
  logger?: string;
}

// Common error codes
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;
/**
 * Logger utility for Intervals MCP Server
 * Based on Memory MCP logger implementation
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1, 
  WARN: 2,
  ERROR: 3,
};

const currentLogLevel: LogLevel = (Deno.env.get("LOG_LEVEL") as LogLevel) || "INFO";

export function log(level: LogLevel, message: string, ...args: any[]): void {
  if (LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}]`;
    
    if (args.length > 0) {
      console.log(prefix, message, ...args);
    } else {
      console.log(prefix, message);
    }
  }
}

export function debug(message: string, ...args: any[]): void {
  log("DEBUG", message, ...args);
}

export function info(message: string, ...args: any[]): void {
  log("INFO", message, ...args);
}

export function warn(message: string, ...args: any[]): void {
  log("WARN", message, ...args);
}

export function error(message: string, ...args: any[]): void {
  log("ERROR", message, ...args);
}
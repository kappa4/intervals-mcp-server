/**
 * ChatGPT Actions - Streams CSV Handler
 * Returns activity streams data in CSV format for efficient data transfer
 */

import { IntervalsAPIClient } from "../intervals-client.ts";
import { log, debug, warn } from "../logger.ts";

export class StreamsCSVHandler {
  private client: IntervalsAPIClient;

  constructor(client: IntervalsAPIClient) {
    this.client = client;
  }

  /**
   * Get activity streams as CSV
   * GET /api/v1/activities/{id}/streams.csv
   */
  async getActivityStreamsCSV(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/streams.csv

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    try {
      debug(`Getting streams CSV for activity: ${activityId}`);
      
      // Get the activity details
      const activity = await this.client.getActivity(activityId);
      
      // Get streams data
      const streams = await this.client.getActivityStreams(activityId);
      
      // Convert to CSV
      const csv = this.convertStreamsToCSV(streams, activity);

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="activity_${activityId}_streams.csv"`,
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get activity streams CSV: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve activity streams",
          details: errorMessage 
        }),
        { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }

  /**
   * Convert streams data to CSV format
   */
  private convertStreamsToCSV(streams: any, activity: any): string {
    const rows: string[] = [];
    
    // Add metadata as comments
    rows.push(`# Activity: ${activity.name}`);
    rows.push(`# Type: ${activity.type}`);
    rows.push(`# Date: ${activity.start_date_local}`);
    rows.push(`# Duration: ${activity.moving_time} seconds`);
    rows.push("");

    // Determine available data columns
    const columns: string[] = ["time_seconds"];
    const dataArrays: { [key: string]: number[] } = {
      time_seconds: []
    };

    // Add time column (0 to duration)
    const duration = activity.moving_time || 0;
    for (let i = 0; i <= duration; i++) {
      dataArrays.time_seconds.push(i);
    }

    // Add available streams
    if (streams.watts?.length > 0) {
      columns.push("power_watts");
      dataArrays.power_watts = streams.watts;
    }

    if (streams.heartrate?.length > 0) {
      columns.push("heart_rate_bpm");
      dataArrays.heart_rate_bpm = streams.heartrate;
    }

    if (streams.cadence?.length > 0) {
      columns.push("cadence_rpm");
      dataArrays.cadence_rpm = streams.cadence;
    }

    if (streams.velocity_smooth?.length > 0) {
      columns.push("speed_kmh");
      dataArrays.speed_kmh = streams.velocity_smooth.map((v: number) => v * 3.6);
    }

    if (streams.altitude?.length > 0) {
      columns.push("altitude_m");
      dataArrays.altitude_m = streams.altitude;
    }

    if (streams.distance?.length > 0) {
      columns.push("distance_m");
      dataArrays.distance_m = streams.distance;
    }

    if (streams.temperature?.length > 0) {
      columns.push("temperature_c");
      dataArrays.temperature_c = streams.temperature;
    }

    // Add header row
    rows.push(columns.join(","));

    // Find the maximum length of data
    const maxLength = Math.max(
      ...Object.values(dataArrays).map(arr => arr.length)
    );

    // Add data rows
    for (let i = 0; i < maxLength; i++) {
      const row: string[] = [];
      for (const column of columns) {
        const value = dataArrays[column]?.[i];
        if (value !== undefined && value !== null) {
          // Format numbers with appropriate precision
          if (column.includes("speed") || column.includes("distance")) {
            row.push(value.toFixed(2));
          } else if (column.includes("altitude")) {
            row.push(value.toFixed(1));
          } else {
            row.push(value.toString());
          }
        } else {
          row.push(""); // Empty value for missing data
        }
      }
      rows.push(row.join(","));
    }

    return rows.join("\n");
  }

  /**
   * Get compressed activity streams as gzipped CSV
   * GET /api/v1/activities/{id}/streams.csv.gz
   */
  async getActivityStreamsCompressed(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/streams.csv.gz

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }

    try {
      debug(`Getting compressed streams CSV for activity: ${activityId}`);
      
      // Get the activity details
      const activity = await this.client.getActivity(activityId);
      
      // Get streams data
      const streams = await this.client.getActivityStreams(activityId);
      
      // Convert to CSV
      const csv = this.convertStreamsToCSV(streams, activity);
      
      // Compress using Web Streams API
      const encoder = new TextEncoder();
      const csvBytes = encoder.encode(csv);
      
      // Create a compressed stream
      const compressionStream = new CompressionStream("gzip");
      const writer = compressionStream.writable.getWriter();
      writer.write(csvBytes);
      writer.close();
      
      // Read the compressed data
      const compressedData = await new Response(compressionStream.readable).arrayBuffer();

      return new Response(compressedData, {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Encoding": "gzip",
          "Content-Disposition": `attachment; filename="activity_${activityId}_streams.csv.gz"`,
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get compressed activity streams: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve activity streams",
          details: errorMessage 
        }),
        { 
          status: 500,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
}
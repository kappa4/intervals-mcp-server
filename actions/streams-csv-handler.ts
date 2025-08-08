/**
 * ChatGPT Actions - Streams CSV Handler
 * Returns activity streams data in CSV format for efficient data transfer
 */

import { IntervalsAPIClient } from "../intervals-client.ts";
import { log, debug, warn } from "../logger.ts";
import { CORS_HEADERS } from "../main.ts";

export class StreamsCSVHandler {
  private client: IntervalsAPIClient;

  constructor(client: IntervalsAPIClient) {
    this.client = client;
  }

  /**
   * Get activity streams as CSV with pagination support
   * GET /api/v1/activities/{id}/streams.csv?page=1&per_page=1000
   */
  async getActivityStreamsCSV(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/streams.csv
    
    // Parse pagination parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const perPage = Math.min(
      parseInt(url.searchParams.get('per_page') || '1000'),
      5000 // Maximum per_page limit
    );

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { 
            ...CORS_HEADERS,
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      debug(`Getting streams CSV for activity: ${activityId}, page: ${page}, per_page: ${perPage}`);
      
      // Get the activity details
      const activity = await this.client.getActivity(activityId);
      
      // Get streams data
      const streams = await this.client.getActivityStreams(activityId);
      
      // Convert to CSV with pagination
      const { csv, totalRows, totalPages } = this.convertStreamsToCSVWithPagination(
        streams, 
        activity, 
        page, 
        perPage
      );

      return new Response(csv, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="activity_${activityId}_streams_page${page}.csv"`,
          "Cache-Control": "public, max-age=3600", // Cache for 1 hour
          // Pagination headers
          "X-Total-Count": totalRows.toString(),
          "X-Page": page.toString(),
          "X-Per-Page": perPage.toString(),
          "X-Total-Pages": totalPages.toString()
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
            ...CORS_HEADERS,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }

  /**
   * Convert streams data to CSV format with pagination
   */
  private convertStreamsToCSVWithPagination(
    streams: any, 
    activity: any, 
    page: number, 
    perPage: number
  ): { csv: string; totalRows: number; totalPages: number } {
    const { columns, dataArrays, maxLength } = this.prepareStreamData(streams);
    
    // Calculate pagination
    const totalRows = maxLength;
    const totalPages = Math.ceil(totalRows / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalRows);
    
    // Generate CSV for the requested page
    const rows: string[] = [];
    
    // Add header row
    rows.push(columns.join(","));
    
    // Add data rows for the current page only
    for (let i = startIndex; i < endIndex; i++) {
      const row: string[] = [];
      for (const column of columns) {
        const value = dataArrays[column]?.[i];
        if (value !== undefined && value !== null) {
          // Format numbers with appropriate precision based on data type
          if (typeof value === 'number') {
            if (column === 'latitude' || column === 'longitude') {
              row.push(value.toFixed(6));
            } else if (column === 'distance' || column === 'velocity_smooth' || column === 'grade_smooth') {
              row.push(value.toFixed(2));
            } else if (column === 'altitude' || column === 'temp' || column === 'watts' || column === 'watts_calc') {
              row.push(value.toFixed(1));
            } else if (column === 'VO2_percentage' || column === 'percentage' || column === 'smo2') {
              row.push(value.toFixed(1));
            } else {
              row.push(value.toString());
            }
          } else {
            row.push(value.toString());
          }
        } else {
          row.push(""); // Empty value for missing data
        }
      }
      rows.push(row.join(","));
    }
    
    return {
      csv: rows.join("\n"),
      totalRows,
      totalPages
    };
  }
  
  /**
   * Prepare stream data for CSV conversion
   */
  private prepareStreamData(streams: any): {
    columns: string[];
    dataArrays: { [key: string]: number[] };
    maxLength: number;
  } {
    // Determine available data columns and map stream names to CSV headers
    const columns: string[] = [];
    const dataArrays: { [key: string]: number[] } = {};

    // Map of intervals.icu stream types to CSV column names
    const streamMapping: { [key: string]: string } = {
      'time': 'time',
      'latlng': 'latlng',  // Special handling needed for lat/lng pairs
      'distance': 'distance',
      'altitude': 'altitude',
      'velocity_smooth': 'velocity_smooth',
      'heartrate': 'heartrate',
      'cadence': 'cadence',
      'watts': 'watts',
      'watts_calc': 'watts_calc',
      'temp': 'temp',
      'moving': 'moving',
      'grade_smooth': 'grade_smooth',
      'grade_adjusted_distance': 'grade_adjusted_distance',
      'VO2': 'VO2',
      'VO2_percentage': 'VO2_percentage',
      'kcal': 'kcal',
      'respiration': 'respiration',
      'flow': 'flow',
      'percentage': 'percentage',
      'smo2': 'smo2',
      'thb': 'thb',
      'torque': 'torque',
      'pace': 'pace',
      'gap': 'gap',
      'work': 'work',
      'gear_ratio': 'gear_ratio',
      'developer_field_0': 'developer_field_0',
      'developer_field_1': 'developer_field_1',
      'developer_field_2': 'developer_field_2'
    };

    // Process all available streams
    for (const [streamType, columnName] of Object.entries(streamMapping)) {
      if (streams[streamType]?.length > 0) {
        // Special handling for latlng (array of [lat, lng] pairs)
        if (streamType === 'latlng' && Array.isArray(streams[streamType][0])) {
          columns.push('latitude');
          columns.push('longitude');
          dataArrays['latitude'] = streams[streamType].map((pair: number[]) => pair[0]);
          dataArrays['longitude'] = streams[streamType].map((pair: number[]) => pair[1]);
        } else {
          columns.push(columnName);
          dataArrays[columnName] = streams[streamType];
        }
      }
    }

    // Find the maximum length of data
    const maxLength = columns.length === 0 ? 0 : Math.max(
      ...Object.values(dataArrays).map(arr => arr.length)
    );
    
    return { columns, dataArrays, maxLength };
  }

  /**
   * Convert streams data to CSV format (original method for backward compatibility)
   */
  private convertStreamsToCSV(streams: any, activity: any): string {
    const { columns, dataArrays, maxLength } = this.prepareStreamData(streams);
    
    // If no columns found, return empty CSV
    if (columns.length === 0) {
      return "";
    }
    
    const rows: string[] = [];
    
    // Add header row
    rows.push(columns.join(","));

    // Add data rows
    for (let i = 0; i < maxLength; i++) {
      const row: string[] = [];
      for (const column of columns) {
        const value = dataArrays[column]?.[i];
        if (value !== undefined && value !== null) {
          // Format numbers with appropriate precision based on data type
          if (typeof value === 'number') {
            if (column === 'latitude' || column === 'longitude') {
              row.push(value.toFixed(6));
            } else if (column === 'distance' || column === 'velocity_smooth' || column === 'grade_smooth') {
              row.push(value.toFixed(2));
            } else if (column === 'altitude' || column === 'temp' || column === 'watts' || column === 'watts_calc') {
              row.push(value.toFixed(1));
            } else if (column === 'VO2_percentage' || column === 'percentage' || column === 'smo2') {
              row.push(value.toFixed(1));
            } else {
              row.push(value.toString());
            }
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
   * Get compressed activity streams as gzipped CSV with pagination support
   * GET /api/v1/activities/{id}/streams.csv.gz?page=1&per_page=1000
   */
  async getActivityStreamsCompressed(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/streams.csv.gz
    
    // Parse pagination parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const perPage = Math.min(
      parseInt(url.searchParams.get('per_page') || '1000'),
      5000 // Maximum per_page limit
    );

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { 
            ...CORS_HEADERS,
            "Content-Type": "application/json"
          }
        }
      );
    }

    try {
      debug(`Getting compressed streams CSV for activity: ${activityId}, page: ${page}, per_page: ${perPage}`);
      
      // Get the activity details
      const activity = await this.client.getActivity(activityId);
      
      // Get streams data
      const streams = await this.client.getActivityStreams(activityId);
      
      // Convert to CSV with pagination
      const { csv, totalRows, totalPages } = this.convertStreamsToCSVWithPagination(
        streams, 
        activity, 
        page, 
        perPage
      );
      
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
          ...CORS_HEADERS,
          "Content-Type": "application/gzip",
          "Content-Encoding": "gzip",
          "Content-Disposition": `attachment; filename="activity_${activityId}_streams_page${page}.csv.gz"`,
          "Cache-Control": "public, max-age=3600",
          // Pagination headers
          "X-Total-Count": totalRows.toString(),
          "X-Page": page.toString(),
          "X-Per-Page": perPage.toString(),
          "X-Total-Pages": totalPages.toString()
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
            ...CORS_HEADERS,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }
}
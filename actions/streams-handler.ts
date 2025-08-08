/**
 * ChatGPT Actions - Streams and Intervals Handler
 * Handles activity streams (power, HR, cadence) and interval data
 */

import { IntervalsAPIClient } from "../intervals-client.ts";
import { log, debug, warn } from "../logger.ts";

export class StreamsHandler {
  private client: IntervalsAPIClient;

  constructor(client: IntervalsAPIClient) {
    this.client = client;
  }

  /**
   * Get activity streams (power, HR, cadence, etc.)
   * GET /api/v1/activities/{id}/streams
   */
  async getActivityStreams(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/streams

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    try {
      debug(`Getting streams for activity: ${activityId}`);
      
      // Get the activity details first
      const activity = await this.client.getActivity(activityId);
      
      // Get streams data
      const streams = await this.client.getActivityStreams(activityId);
      
      // Format response for ChatGPT
      const formatted = this.formatStreams(streams, activity);

      return new Response(
        JSON.stringify({
          activity_id: activityId,
          activity_name: activity.name,
          activity_type: activity.type,
          duration: activity.moving_time,
          streams: formatted,
          summary: this.generateStreamsSummary(formatted)
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get activity streams: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve activity streams",
          details: errorMessage 
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }

  /**
   * Get activity intervals/laps
   * GET /api/v1/activities/{id}/intervals
   */
  async getActivityIntervals(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const activityId = pathParts[4]; // /api/v1/activities/{id}/intervals

    if (!activityId) {
      return new Response(
        JSON.stringify({ 
          error: "Activity ID is required" 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    try {
      debug(`Getting intervals for activity: ${activityId}`);
      
      // Get the activity details
      const activity = await this.client.getActivity(activityId);
      
      // Get intervals data
      const intervals = await this.client.getActivityIntervals(activityId);
      
      // Format response for ChatGPT
      const formatted = this.formatIntervals(intervals, activity);

      return new Response(
        JSON.stringify({
          activity_id: activityId,
          activity_name: activity.name,
          activity_type: activity.type,
          intervals: formatted,
          summary: this.generateIntervalsSummary(formatted)
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get activity intervals: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve activity intervals",
          details: errorMessage 
        }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  }

  /**
   * Format streams data for ChatGPT
   */
  private formatStreams(streams: any, activity: any): any {
    const result: any = {
      available_streams: [],
      statistics: {},
      data: {}  // Add raw data arrays
    };

    // Power stream
    if (streams.watts?.length > 0) {
      result.available_streams.push("power");
      result.statistics.power = {
        average: activity.icu_average_watts,
        normalized: activity.icu_normalized_watts,
        max: Math.max(...streams.watts),
        min: Math.min(...streams.watts.filter((w: number) => w > 0))
      };
      result.data.power = streams.watts;  // Include raw power data
    }

    // Heart rate stream
    if (streams.heartrate?.length > 0) {
      result.available_streams.push("heart_rate");
      result.statistics.heart_rate = {
        average: activity.icu_average_hr,
        max: activity.icu_max_hr,
        min: Math.min(...streams.heartrate.filter((hr: number) => hr > 0)),
        zones: this.calculateHRZones(streams.heartrate, activity.icu_max_hr)
      };
      result.data.heart_rate = streams.heartrate;  // Include raw HR data
    }

    // Cadence stream
    if (streams.cadence?.length > 0) {
      result.available_streams.push("cadence");
      const nonZeroCadence = streams.cadence.filter((c: number) => c > 0);
      result.statistics.cadence = {
        average: nonZeroCadence.length > 0 
          ? Math.round(nonZeroCadence.reduce((a: number, b: number) => a + b, 0) / nonZeroCadence.length)
          : 0,
        max: Math.max(...streams.cadence),
        min: nonZeroCadence.length > 0 ? Math.min(...nonZeroCadence) : 0
      };
      result.data.cadence = streams.cadence;  // Include raw cadence data
    }

    // Speed/Pace stream
    if (streams.velocity_smooth?.length > 0) {
      result.available_streams.push("speed");
      const speeds = streams.velocity_smooth.map((v: number) => v * 3.6); // m/s to km/h
      result.statistics.speed = {
        average_kmh: (activity.icu_median_speed * 3.6).toFixed(1),
        max_kmh: Math.max(...speeds).toFixed(1),
        pace_per_km: this.speedToPace(activity.icu_median_speed)
      };
      result.data.speed = speeds;  // Include converted speed data in km/h
    }

    // Altitude stream
    if (streams.altitude?.length > 0) {
      result.available_streams.push("altitude");
      result.statistics.altitude = {
        max: Math.max(...streams.altitude),
        min: Math.min(...streams.altitude),
        gain: activity.icu_elevation_gain,
        loss: activity.icu_elevation_loss
      };
      result.data.altitude = streams.altitude;  // Include raw altitude data
    }

    // Time stream (if available)
    if (streams.time?.length > 0) {
      result.data.time = streams.time;  // Include time indices
    }

    // Distance stream (if available)  
    if (streams.distance?.length > 0) {
      result.data.distance = streams.distance;  // Include distance data
    }

    return result;
  }

  /**
   * Format intervals data for ChatGPT
   */
  private formatIntervals(intervals: any[], activity: any): any[] {
    return intervals.map((interval, index) => ({
      number: index + 1,
      name: interval.name || `Interval ${index + 1}`,
      type: interval.type || "lap",
      duration_seconds: interval.elapsed_time,
      duration_formatted: this.formatDuration(interval.elapsed_time),
      distance_km: interval.distance ? (interval.distance / 1000).toFixed(2) : null,
      
      // Power metrics
      power: interval.average_watts ? {
        average: interval.average_watts,
        normalized: interval.normalized_power,
        max: interval.max_watts,
        intensity_factor: interval.intensity
      } : null,
      
      // Heart rate metrics
      heart_rate: interval.average_heartrate ? {
        average: interval.average_heartrate,
        max: interval.max_heartrate
      } : null,
      
      // Cadence
      cadence: interval.average_cadence || null,
      
      // Speed/Pace
      speed: interval.average_speed ? {
        average_kmh: (interval.average_speed * 3.6).toFixed(1),
        pace_per_km: this.speedToPace(interval.average_speed)
      } : null,
      
      // Work done
      work_kj: interval.work ? (interval.work / 1000).toFixed(1) : null,
      
      // Training effect
      training_load: interval.load || null
    }));
  }

  /**
   * Generate streams summary
   */
  private generateStreamsSummary(streams: any): any {
    const summary: any = {
      data_quality: "Good",
      available_metrics: streams.available_streams
    };

    // Power summary
    if (streams.statistics.power) {
      summary.power_analysis = {
        variability_index: streams.statistics.power.normalized 
          ? (streams.statistics.power.normalized / streams.statistics.power.average).toFixed(2)
          : null,
        power_range: `${streams.statistics.power.min}-${streams.statistics.power.max}W`
      };
    }

    // HR summary
    if (streams.statistics.heart_rate?.zones) {
      summary.heart_rate_distribution = streams.statistics.heart_rate.zones;
    }

    return summary;
  }

  /**
   * Generate intervals summary
   */
  private generateIntervalsSummary(intervals: any[]): any {
    if (intervals.length === 0) {
      return { message: "No intervals found" };
    }

    const powerIntervals = intervals.filter(i => i.power);
    const avgPower = powerIntervals.length > 0
      ? powerIntervals.reduce((sum, i) => sum + i.power.average, 0) / powerIntervals.length
      : null;

    return {
      total_intervals: intervals.length,
      average_interval_duration: this.formatDuration(
        intervals.reduce((sum, i) => sum + i.duration_seconds, 0) / intervals.length
      ),
      average_power: avgPower ? Math.round(avgPower) : null,
      hardest_interval: this.findHardestInterval(intervals),
      longest_interval: this.findLongestInterval(intervals)
    };
  }

  /**
   * Calculate HR zones distribution
   */
  private calculateHRZones(heartrates: number[], maxHR: number): any {
    if (!maxHR) return null;

    const zones = {
      zone1_recovery: 0,     // < 60%
      zone2_aerobic: 0,      // 60-70%
      zone3_tempo: 0,        // 70-80%
      zone4_threshold: 0,    // 80-90%
      zone5_vo2max: 0        // > 90%
    };

    heartrates.forEach(hr => {
      const percentage = (hr / maxHR) * 100;
      if (percentage < 60) zones.zone1_recovery++;
      else if (percentage < 70) zones.zone2_aerobic++;
      else if (percentage < 80) zones.zone3_tempo++;
      else if (percentage < 90) zones.zone4_threshold++;
      else zones.zone5_vo2max++;
    });

    const total = heartrates.length;
    return {
      zone1_recovery: `${((zones.zone1_recovery / total) * 100).toFixed(1)}%`,
      zone2_aerobic: `${((zones.zone2_aerobic / total) * 100).toFixed(1)}%`,
      zone3_tempo: `${((zones.zone3_tempo / total) * 100).toFixed(1)}%`,
      zone4_threshold: `${((zones.zone4_threshold / total) * 100).toFixed(1)}%`,
      zone5_vo2max: `${((zones.zone5_vo2max / total) * 100).toFixed(1)}%`
    };
  }

  /**
   * Convert speed (m/s) to pace (min:sec per km)
   */
  private speedToPace(speedMs: number): string {
    if (!speedMs || speedMs === 0) return "N/A";
    const secondsPerKm = 1000 / speedMs;
    const minutes = Math.floor(secondsPerKm / 60);
    const seconds = Math.round(secondsPerKm % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format duration from seconds
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Find the hardest interval (by power or HR)
   */
  private findHardestInterval(intervals: any[]): any {
    let hardest = intervals[0];
    let maxIntensity = 0;

    intervals.forEach((interval, index) => {
      const intensity = interval.power?.intensity_factor || 
                       (interval.heart_rate?.average / 200) || 0;
      if (intensity > maxIntensity) {
        maxIntensity = intensity;
        hardest = { ...interval, interval_number: index + 1 };
      }
    });

    return hardest ? {
      interval_number: hardest.interval_number,
      name: hardest.name,
      power: hardest.power?.average,
      intensity_factor: hardest.power?.intensity_factor
    } : null;
  }

  /**
   * Find the longest interval
   */
  private findLongestInterval(intervals: any[]): any {
    let longest = intervals[0];
    let maxDuration = 0;

    intervals.forEach((interval, index) => {
      if (interval.duration_seconds > maxDuration) {
        maxDuration = interval.duration_seconds;
        longest = { ...interval, interval_number: index + 1 };
      }
    });

    return longest ? {
      interval_number: longest.interval_number,
      name: longest.name,
      duration: longest.duration_formatted,
      distance_km: longest.distance_km
    } : null;
  }
}
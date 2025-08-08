/**
 * ChatGPT Actions - Activities Handler
 * Handles training activities endpoints for ChatGPT Actions
 */

import { IntervalsAPIClient } from "../intervals-client.ts";
import { log, debug, warn } from "../logger.ts";
import type { IntervalsActivity } from "../intervals-types.ts";

export class ActivitiesHandler {
  private client: IntervalsAPIClient;

  constructor(client: IntervalsAPIClient) {
    this.client = client;
  }

  /**
   * Get recent training activities
   * GET /api/v1/activities
   */
  async getActivities(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") || "7");
    const type = url.searchParams.get("type") || undefined;

    // Validate parameters
    if (days < 1 || days > 90) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid days parameter. Must be between 1 and 90." 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    try {
      debug(`Getting activities: days=${days}, type=${type}`);
      
      // Calculate date range
      const newest = new Date().toISOString().split('T')[0];
      const oldest = new Date();
      oldest.setDate(oldest.getDate() - days);
      const oldestStr = oldest.toISOString().split('T')[0];

      // Fetch activities
      const response = await this.client.getActivities({
        oldest: oldestStr,
        newest: newest,
        limit: 50 // Reasonable limit for ChatGPT
      });

      // Filter by type if specified
      let activities = response.data || [];
      if (type) {
        activities = activities.filter(a => a.type === type);
      }

      // Format response for ChatGPT
      const formattedActivities = activities.map(a => this.formatActivity(a));

      return new Response(
        JSON.stringify({
          activities: formattedActivities,
          count: formattedActivities.length,
          period: {
            from: oldestStr,
            to: newest,
            days: days
          },
          filter: type ? { type } : null
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get activities: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve activities",
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
   * Format activity for ChatGPT-friendly response
   */
  private formatActivity(activity: IntervalsActivity): any {
    return {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      date: activity.start_date_local?.split('T')[0],
      time: activity.start_date_local?.split('T')[1]?.split('.')[0],
      duration_seconds: activity.moving_time,
      duration_formatted: this.formatDuration(activity.moving_time),
      distance_km: activity.distance ? (activity.distance / 1000).toFixed(2) : null,
      elevation_gain: activity.icu_elevation_gain,
      average_power: activity.icu_average_watts,
      normalized_power: activity.icu_normalized_watts,
      average_hr: activity.icu_average_hr,
      max_hr: activity.icu_max_hr,
      training_load: activity.icu_training_load,
      intensity_factor: activity.icu_intensity_factor,
      efficiency_factor: activity.icu_efficiency_factor,
      pace: activity.pace_formatted,
      speed_km_h: activity.icu_median_speed ? 
        (activity.icu_median_speed * 3.6).toFixed(1) : null,
      calories: activity.icu_joules ? 
        Math.round(activity.icu_joules / 4184) : null,
      feel: activity.feel,
      rpe: activity.icu_rpe,
      description: activity.description
    };
  }

  /**
   * Format duration from seconds to human-readable string
   */
  private formatDuration(seconds: number | undefined): string {
    if (!seconds) return "0:00";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
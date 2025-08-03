/**
 * Intervals.icu API Client
 * TypeScript implementation based on the Python version
 */

import { log } from "./logger.ts";
import { getErrorMessage } from "./utils/error-utils.ts";
import type {
  IntervalsActivity,
  IntervalsWellness,
  IntervalsEventData,
  IntervalsAthlete,
  IntervalsWorkout,
  IntervalsListResponse,
  IntervalsAPIOptions,
  ActivityFilters,
  WellnessFilters,
  EventFilters,
  IntervalsCustomItem,
} from "./intervals-types.ts";

export class IntervalsAPIClient {
  protected athleteId: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(options: IntervalsAPIOptions) {
    this.athleteId = options.athlete_id;
    this.apiKey = options.api_key;
    this.baseUrl = options.base_url || "https://intervals.icu";

    log("DEBUG", `Intervals API client initialized for athlete ${this.athleteId}`);
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1/athlete/${this.athleteId}${endpoint}`;
    
    const headers = {
      "Authorization": `Basic ${btoa(`API_KEY:${this.apiKey}`)}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    log("DEBUG", `Making request to ${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        log("ERROR", `API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Intervals.icu API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      log("DEBUG", `Request successful, received ${JSON.stringify(data).length} characters`);
      
      // Log response structure for debugging
      if (endpoint.includes('/wellness')) {
        log("DEBUG", `Wellness response type: ${Array.isArray(data) ? 'array' : typeof data}`);
        if (Array.isArray(data)) {
          log("DEBUG", `Wellness array length: ${data.length}`);
          // Log first entry structure to understand custom fields
          if (data.length > 0) {
            log("DEBUG", `First wellness entry keys: ${Object.keys(data[0]).join(', ')}`);
            // Check for user_data field
            if (data[0].user_data) {
              log("DEBUG", `user_data field found: ${JSON.stringify(data[0].user_data)}`);
            }
            // Log any fields that might be custom (not in standard list)
            const standardFields = ['id', 'date', 'weight', 'restingHR', 'hrv', 'sleepSecs', 'sleepQuality', 'fatigue', 'soreness', 'motivation', 'stress', 'mood', 'injury', 'notes', 'ctl', 'atl', 'rampRate', 'ctlLoad', 'atlLoad', 'sportInfo', 'updated'];
            const possibleCustomFields = Object.keys(data[0]).filter(key => !standardFields.includes(key));
            if (possibleCustomFields.length > 0) {
              log("DEBUG", `Possible custom fields: ${possibleCustomFields.join(', ')}`);
            }
          }
        }
      }
      
      return data as T;
    } catch (error) {
      log("ERROR", `Request failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  // Activities
  async getActivities(filters: ActivityFilters = {}): Promise<IntervalsListResponse<IntervalsActivity>> {
    const searchParams = new URLSearchParams();
    
    if (filters.type) searchParams.set("type", filters.type);
    if (filters.oldest) searchParams.set("oldest", filters.oldest);
    if (filters.newest) searchParams.set("newest", filters.newest);
    if (filters.limit) searchParams.set("limit", filters.limit.toString());
    if (filters.cursor) searchParams.set("cursor", filters.cursor);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const data = await this.makeRequest<IntervalsActivity[]>(`/activities${query}`);
    
    // Intervals.icu returns array directly, wrap it in our expected format
    return { data };
  }

  async getActivity(activityId: string): Promise<IntervalsActivity> {
    try {
      // Use the athlete-specific endpoint that accepts multiple IDs
      // We only pass one ID but the endpoint returns an array
      const data = await this.makeRequest<IntervalsActivity[]>(`/activities/${activityId}`);
      
      if (data.length === 0) {
        throw new Error(`Activity ${activityId} not found. This could mean: 1) The activity doesn't exist, 2) It's private/deleted, or 3) You don't have access to it.`);
      }
      
      return data[0];
    } catch (error) {
      if (getErrorMessage(error).includes('404')) {
        throw new Error(`Activity ${activityId} not found. Please verify the activity ID from get_activities results.`);
      }
      throw error;
    }
  }

  async updateActivity(activityId: number, data: Partial<IntervalsActivity>): Promise<IntervalsActivity> {
    // Note: The Intervals.icu API may not support updating activities via API
    // This returns 405 Method Not Allowed
    throw new Error("Activity updates are not supported by the Intervals.icu API");
  }

  async deleteActivity(activityId: number): Promise<void> {
    await this.makeRequest(`/activities/${activityId}`, {
      method: "DELETE",
    });
  }

  // Wellness
  async getWellnessData(filters: WellnessFilters = {}): Promise<IntervalsListResponse<IntervalsWellness>> {
    const searchParams = new URLSearchParams();
    
    if (filters.oldest) searchParams.set("oldest", filters.oldest);
    if (filters.newest) searchParams.set("newest", filters.newest);
    if (filters.limit) searchParams.set("limit", filters.limit.toString());
    if (filters.cursor) searchParams.set("cursor", filters.cursor);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const data = await this.makeRequest<IntervalsWellness[]>(`/wellness${query}`);
    
    // Intervals.icu returns array directly, wrap it in our expected format
    return { data };
  }

  async getWellnessEntry(date: string): Promise<IntervalsWellness> {
    return this.makeRequest<IntervalsWellness>(`/wellness/${date}`);
  }

  async updateWellnessEntry(date: string, data: Partial<IntervalsWellness>): Promise<IntervalsWellness> {
    return this.makeRequest<IntervalsWellness>(`/wellness/${date}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteWellnessEntry(date: string): Promise<void> {
    await this.makeRequest(`/wellness/${date}`, {
      method: "DELETE",
    });
  }

  // Events
  async getEvents(filters: EventFilters = {}): Promise<IntervalsListResponse<IntervalsEventData>> {
    const searchParams = new URLSearchParams();
    
    if (filters.category) searchParams.set("category", filters.category);
    if (filters.oldest) searchParams.set("oldest", filters.oldest);
    if (filters.newest) searchParams.set("newest", filters.newest);
    if (filters.limit) searchParams.set("limit", filters.limit.toString());
    if (filters.cursor) searchParams.set("cursor", filters.cursor);

    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const data = await this.makeRequest<IntervalsEventData[]>(`/events${query}`);
    
    // Intervals.icu returns array directly, wrap it in our expected format
    return { data };
  }

  async createEvent(data: Partial<IntervalsEventData>): Promise<IntervalsEventData> {
    return this.makeRequest<IntervalsEventData>("/events", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateEvent(eventId: string, data: Partial<IntervalsEventData>): Promise<IntervalsEventData> {
    return this.makeRequest<IntervalsEventData>(`/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.makeRequest(`/events/${eventId}`, {
      method: "DELETE",
    });
  }

  // Athlete
  async getAthlete(): Promise<IntervalsAthlete> {
    return this.makeRequest<IntervalsAthlete>("");
  }

  // Workouts
  async getWorkouts(): Promise<IntervalsListResponse<IntervalsWorkout>> {
    const data = await this.makeRequest<IntervalsWorkout[]>("/workouts");
    
    // Intervals.icu returns array directly, wrap it in our expected format
    return { data };
  }

  async getWorkout(workoutId: string): Promise<IntervalsWorkout> {
    return this.makeRequest<IntervalsWorkout>(`/workouts/${workoutId}`);
  }

  // Custom Items
  async getCustomItems(): Promise<IntervalsCustomItem[]> {
    return this.makeRequest<IntervalsCustomItem[]>("/custom-item");
  }

  async getCustomWellnessFields(): Promise<IntervalsCustomItem[]> {
    const items = await this.getCustomItems();
    // Filter for INPUT_FIELD type which are wellness custom fields
    return items.filter(item => item.type === 'INPUT_FIELD');
  }

  async getCustomActivityFields(): Promise<IntervalsCustomItem[]> {
    const items = await this.getCustomItems();
    // Filter for ACTIVITY_FIELD type
    return items.filter(item => item.type === 'ACTIVITY_FIELD');
  }
}
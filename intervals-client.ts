/**
 * Intervals.icu API Client
 * TypeScript implementation based on the Python version
 */

import { log } from "./logger.ts";
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
} from "./intervals-types.ts";

export class IntervalsAPIClient {
  private athleteId: string;
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
        }
      }
      
      return data as T;
    } catch (error) {
      log("ERROR", `Request failed: ${error.message}`);
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

  async getActivity(activityId: number): Promise<IntervalsActivity> {
    return this.makeRequest<IntervalsActivity>(`/activities/${activityId}`);
  }

  async updateActivity(activityId: number, data: Partial<IntervalsActivity>): Promise<IntervalsActivity> {
    return this.makeRequest<IntervalsActivity>(`/activities/${activityId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
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
}
/**
 * ChatGPT Actions - Wellness Handler
 * Handles wellness data endpoints for ChatGPT Actions
 */

import { IntervalsAPIClient } from "../intervals-client.ts";
import { UCRIntervalsClient } from "../ucr-intervals-client.ts";
import { log, debug, warn } from "../logger.ts";
import type { IntervalsWellness } from "../intervals-types.ts";

export class WellnessHandler {
  private client: IntervalsAPIClient;
  private ucrClient: UCRIntervalsClient;

  constructor(client: IntervalsAPIClient) {
    this.client = client;
    this.ucrClient = new UCRIntervalsClient({
      athlete_id: Deno.env.get("ATHLETE_ID")!,
      api_key: Deno.env.get("API_KEY")!
    });
  }

  /**
   * Get wellness data for a specific date
   * GET /api/v1/wellness
   */
  async getWellness(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const date = dateParam || new Date().toISOString().split('T')[0];

    // Validate date format
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date)) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid date format. Use YYYY-MM-DD." 
        }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    try {
      debug(`Getting wellness data for date: ${date}`);
      
      // Fetch wellness data
      const response = await this.client.getWellnessData({
        oldest: date,
        newest: date,
        limit: 1
      });

      const wellness = response.data?.[0];
      
      if (!wellness) {
        return new Response(
          JSON.stringify({
            date: date,
            message: "No wellness data available for this date",
            data: null
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // Format response for ChatGPT
      const formatted = this.formatWellness(wellness);

      return new Response(
        JSON.stringify({
          date: date,
          data: formatted,
          message: "Wellness data retrieved successfully"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get wellness data: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to retrieve wellness data",
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
   * Update wellness data
   * POST /api/v1/wellness/update
   */
  async updateWellness(req: Request): Promise<Response> {
    try {
      const body = await req.json();
      const {
        date = new Date().toISOString().split('T')[0],
        fatigue,
        stress,
        mood,
        motivation,
        injury,
        hrv,
        rhr,
        weight,
        sleep_hours,
        sleep_quality,
        calculate_ucr = true
      } = body;

      debug(`Updating wellness for ${date}`);

      // Build wellness update object
      const wellnessUpdate: any = {};
      
      // Map subjective metrics (1-5 scale)
      if (fatigue !== undefined) wellnessUpdate.fatigue = fatigue;
      if (stress !== undefined) wellnessUpdate.stress = stress;
      if (mood !== undefined) wellnessUpdate.mood = mood;
      if (motivation !== undefined) wellnessUpdate.motivation = motivation;
      if (injury !== undefined) wellnessUpdate.injury = injury;
      
      // Map objective metrics
      if (hrv !== undefined) wellnessUpdate.hrv = hrv;
      if (rhr !== undefined) wellnessUpdate.restingHR = rhr;
      if (weight !== undefined) wellnessUpdate.weight = weight;
      if (sleep_hours !== undefined) wellnessUpdate.sleepTime = sleep_hours;
      if (sleep_quality !== undefined) wellnessUpdate.sleepQuality = sleep_quality;

      // Update wellness data using PUT request
      await this.client.updateWellnessEntry(date, wellnessUpdate);

      // Calculate UCR if requested
      let ucrResult = null;
      if (calculate_ucr) {
        try {
          const ucr = await this.ucrClient.calculateUCRAssessment(date, true);
          ucrResult = {
            score: ucr.score,
            interpretation: ucr.recommendation?.description || "",
            recommendation: ucr.trainingRecommendation || ucr.recommendation?.action || ""
          };
        } catch (ucrError) {
          debug(`UCR calculation failed: ${ucrError}`);
          // Continue even if UCR fails
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          date: date,
          updated: wellnessUpdate,
          ucr: ucrResult,
          message: "Wellness data updated successfully"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to update wellness: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to update wellness data",
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
   * Format wellness data for ChatGPT-friendly response
   */
  private formatWellness(wellness: IntervalsWellness): any {
    return {
      // Subjective metrics (1-5 scale)
      subjective: {
        fatigue: wellness.fatigue,
        stress: wellness.stress,
        mood: wellness.mood,
        motivation: wellness.motivation,
        injury: wellness.injury,
        overall_feel: this.calculateOverallFeel(wellness)
      },
      // Objective metrics
      objective: {
        hrv: wellness.hrv,
        hrv_cv: wellness.hrvCV,
        resting_hr: wellness.restingHR,
        weight_kg: wellness.weight,
        body_fat_percent: wellness.bodyFat,
        sleep_hours: wellness.sleepTime,
        sleep_quality: wellness.sleepQuality,
        spo2: wellness.spO2,
        systolic_bp: wellness.systolic,
        diastolic_bp: wellness.diastolic
      },
      // UCR scores if available
      ucr: wellness.icu_ucr_score ? {
        score: wellness.icu_ucr_score,
        momentum: wellness.icu_ucr_momentum_7d,
        volatility: wellness.icu_ucr_volatility_14d,
        state: wellness.icu_ucr_state
      } : null,
      // Notes
      notes: wellness.comments
    };
  }

  /**
   * Calculate overall subjective feel
   */
  private calculateOverallFeel(wellness: IntervalsWellness): string {
    const metrics = [
      wellness.fatigue,
      wellness.stress,
      wellness.mood,
      wellness.motivation
    ].filter(v => v !== undefined && v !== null);

    if (metrics.length === 0) return "No data";

    const avg = metrics.reduce((sum, val) => sum + val, 0) / metrics.length;
    
    if (avg >= 4) return "Excellent";
    if (avg >= 3.5) return "Good";
    if (avg >= 3) return "Fair";
    if (avg >= 2.5) return "Below average";
    return "Poor";
  }
}
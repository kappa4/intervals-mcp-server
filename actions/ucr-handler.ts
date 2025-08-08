/**
 * ChatGPT Actions - UCR Handler
 * Handles UCR (Unified Continuous Readiness) endpoints for ChatGPT Actions
 */

import { UCRIntervalsClient } from "../ucr-intervals-client.ts";
import { log, debug, warn } from "../logger.ts";

export class UCRHandler {
  private ucrClient: UCRIntervalsClient;

  constructor() {
    this.ucrClient = new UCRIntervalsClient({
      athlete_id: Deno.env.get("ATHLETE_ID")!,
      api_key: Deno.env.get("API_KEY")!
    });
  }

  /**
   * Get UCR assessment for a specific date
   * GET /api/v1/ucr
   */
  async getUCR(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const date = dateParam || new Date().toISOString().split('T')[0];
    const includeTrends = url.searchParams.get("include_trends") !== "false";

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
      debug(`Getting UCR assessment for date: ${date}, include_trends: ${includeTrends}`);
      
      // Get UCR assessment
      const assessment = await this.ucrClient.calculateUCRAssessment(date, includeTrends);

      // Format response for ChatGPT
      const response = this.formatUCRResponse(assessment, date);

      return new Response(
        JSON.stringify(response),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warn(`Failed to get UCR assessment: ${errorMessage}`);
      return new Response(
        JSON.stringify({ 
          error: "Failed to calculate UCR assessment",
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
   * Format UCR assessment for ChatGPT-friendly response
   */
  private formatUCRResponse(assessment: any, date: string): any {
    const response: any = {
      date: date,
      score: Math.round(assessment.score * 10) / 10,
      interpretation: assessment.recommendation?.description || "",
      recommendation: assessment.trainingRecommendation || assessment.recommendation?.action || "",
      readiness_level: this.getReadinessLevel(assessment.score),
      
      // Components breakdown (updated weights based on UCR v2 configuration)
      components: {
        hrv: {
          score: assessment.components?.hrv || 0,
          weight: 40,
          contribution: assessment.components?.hrv || 0,
          status: this.getComponentStatus(assessment.components?.hrv, 40)
        },
        rhr: {
          score: assessment.components?.rhr || 0,
          weight: 25,  // Updated from 20 to 25 (HRV double-counting correction)
          contribution: assessment.components?.rhr || 0,
          status: this.getComponentStatus(assessment.components?.rhr, 25)
        },
        sleep: {
          score: assessment.components?.sleep || 0,
          weight: 15,  // Updated from 20 to 15 (Garmin HRV component overlap reduction)
          contribution: assessment.components?.sleep || 0,
          status: this.getComponentStatus(assessment.components?.sleep, 15)
        },
        subjective: {
          score: assessment.components?.subjective || 0,
          weight: 20,
          contribution: assessment.components?.subjective || 0,
          status: this.getComponentStatus(assessment.components?.subjective, 20)
        }
      }
    };

    // Add trends if available
    if (assessment.trend) {
      response.trends = {
        momentum_7d: {
          value: assessment.trend.momentum,
          interpretation: this.interpretMomentum(assessment.trend.momentum),
          description: `${assessment.trend.momentum.toFixed(1)}% change over 7 days`
        },
        volatility_14d: {
          value: assessment.trend.volatility,
          interpretation: this.interpretVolatility(assessment.trend.volatility),
          level: assessment.trend.volatilityLevel
        },
        state: {
          code: assessment.trend.trendStateCode,
          description: assessment.trend.trendState,
          interpretation: assessment.trend.interpretation
        }
      };
    }

    // Add training suggestions based on score
    response.training_suggestions = this.getTrainingSuggestions(assessment.score);

    return response;
  }

  /**
   * Get readiness level description
   */
  private getReadinessLevel(score: number): string {
    if (score >= 85) return "Excellent - Ready for high intensity";
    if (score >= 75) return "Good - Ready for normal training";
    if (score >= 65) return "Fair - Consider moderate intensity";
    if (score >= 55) return "Below average - Light training recommended";
    if (score >= 45) return "Poor - Recovery focus recommended";
    return "Very poor - Rest recommended";
  }

  /**
   * Get component status based on score and max possible score
   */
  private getComponentStatus(score: number, maxScore: number): string {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Good";
    if (percentage >= 60) return "Fair";
    if (percentage >= 45) return "Below average";
    return "Poor";
  }

  /**
   * Interpret momentum value
   */
  private interpretMomentum(momentum: number): string {
    if (momentum > 5) return "Strong upward trend";
    if (momentum > 2) return "Moderate upward trend";
    if (momentum > -2) return "Stable";
    if (momentum > -5) return "Moderate downward trend";
    return "Strong downward trend";
  }

  /**
   * Interpret volatility value
   */
  private interpretVolatility(volatility: number): string {
    if (volatility < 5) return "Very stable";
    if (volatility < 10) return "Stable";
    if (volatility < 15) return "Moderate variation";
    if (volatility < 20) return "High variation";
    return "Very high variation";
  }

  /**
   * Get training suggestions based on UCR score
   */
  private getTrainingSuggestions(score: number): string[] {
    if (score >= 85) {
      return [
        "Excellent day for high-intensity intervals or threshold work",
        "Consider a challenging workout or time trial",
        "Good opportunity for breakthrough sessions"
      ];
    } else if (score >= 75) {
      return [
        "Suitable for normal training load",
        "Can handle moderate to high intensity",
        "Good day for steady progress"
      ];
    } else if (score >= 65) {
      return [
        "Focus on aerobic base building",
        "Avoid very high intensity efforts",
        "Good for technique work and moderate volume"
      ];
    } else if (score >= 55) {
      return [
        "Keep intensity low to moderate",
        "Focus on recovery and easy aerobic work",
        "Consider shortening planned workouts"
      ];
    } else if (score >= 45) {
      return [
        "Prioritize recovery activities",
        "Very light active recovery only",
        "Focus on sleep and nutrition"
      ];
    } else {
      return [
        "Rest day strongly recommended",
        "Focus on recovery strategies",
        "Address any underlying stressors"
      ];
    }
  }
}
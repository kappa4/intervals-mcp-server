/**
 * Tests for ChatGPT Actions Streams Handler
 */

import { assertEquals, assertExists, assertArrayIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { StreamsHandler } from "../../actions/streams-handler.ts";
import { IntervalsAPIClient } from "../../intervals-client.ts";

// Mock data for testing
const mockActivity = {
  id: "test123",
  name: "Test Ride",
  type: "Ride",
  moving_time: 3600,
  icu_average_watts: 200,
  icu_normalized_watts: 210,
  icu_average_hr: 140,
  icu_max_hr: 165,
  icu_median_speed: 8.33, // 30 km/h
  icu_elevation_gain: 500,
  icu_elevation_loss: 450
};

const mockStreams = {
  watts: Array(3600).fill(0).map((_, i) => 150 + Math.sin(i / 100) * 50),
  heartrate: Array(3600).fill(0).map((_, i) => 130 + Math.sin(i / 50) * 20),
  cadence: Array(3600).fill(0).map((_, i) => 70 + Math.sin(i / 30) * 15),
  velocity_smooth: Array(3600).fill(0).map((_, i) => 7 + Math.sin(i / 80) * 2),
  altitude: Array(3600).fill(0).map((_, i) => 100 + Math.sin(i / 200) * 20),
  time: Array(3600).fill(0).map((_, i) => i),
  distance: Array(3600).fill(0).map((_, i) => i * 8.33)
};

// Mock client
class MockIntervalsClient extends IntervalsAPIClient {
  constructor() {
    super("test_athlete", "test_key");
  }

  async getActivity(id: string) {
    if (id === "test123") {
      return mockActivity;
    }
    throw new Error("Activity not found");
  }

  async getActivityStreams(id: string) {
    if (id === "test123") {
      return mockStreams;
    }
    throw new Error("Streams not found");
  }

  async getActivityIntervals(id: string) {
    if (id === "test123") {
      return [
        {
          name: "Warm-up",
          elapsed_time: 600,
          distance: 5000,
          average_watts: 150,
          normalized_power: 155,
          max_watts: 180,
          intensity: 0.74,
          average_heartrate: 125,
          max_heartrate: 135,
          average_cadence: 85,
          average_speed: 8.33,
          work: 90000,
          load: 10
        },
        {
          name: "Main Set",
          elapsed_time: 1800,
          distance: 15000,
          average_watts: 250,
          normalized_power: 260,
          max_watts: 350,
          intensity: 1.24,
          average_heartrate: 155,
          max_heartrate: 165,
          average_cadence: 90,
          average_speed: 8.33,
          work: 450000,
          load: 45
        }
      ];
    }
    throw new Error("Intervals not found");
  }
}

Deno.test("StreamsHandler - getActivityStreams returns raw data", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/test123/streams");
  const response = await handler.getActivityStreams(mockReq);
  
  assertEquals(response.status, 200);
  
  const data = await response.json();
  
  // Check basic structure
  assertExists(data.activity_id);
  assertExists(data.activity_name);
  assertExists(data.streams);
  assertExists(data.summary);
  
  // Check streams structure
  assertExists(data.streams.available_streams);
  assertExists(data.streams.statistics);
  assertExists(data.streams.data, "Raw data should be included");
  
  // Check that raw data arrays are present
  assertExists(data.streams.data.power, "Power data should be included");
  assertExists(data.streams.data.heart_rate, "Heart rate data should be included");
  assertExists(data.streams.data.cadence, "Cadence data should be included");
  assertExists(data.streams.data.speed, "Speed data should be included");
  assertExists(data.streams.data.altitude, "Altitude data should be included");
  assertExists(data.streams.data.time, "Time data should be included");
  assertExists(data.streams.data.distance, "Distance data should be included");
  
  // Check data array lengths
  assertEquals(data.streams.data.power.length, 3600, "Power data should have 3600 points");
  assertEquals(data.streams.data.heart_rate.length, 3600, "HR data should have 3600 points");
  assertEquals(data.streams.data.cadence.length, 3600, "Cadence data should have 3600 points");
});

Deno.test("StreamsHandler - getActivityStreams calculates statistics correctly", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/test123/streams");
  const response = await handler.getActivityStreams(mockReq);
  
  const data = await response.json();
  
  // Check power statistics
  assertExists(data.streams.statistics.power);
  assertEquals(data.streams.statistics.power.average, 200);
  assertEquals(data.streams.statistics.power.normalized, 210);
  
  // Check heart rate statistics
  assertExists(data.streams.statistics.heart_rate);
  assertEquals(data.streams.statistics.heart_rate.average, 140);
  assertEquals(data.streams.statistics.heart_rate.max, 165);
  assertExists(data.streams.statistics.heart_rate.zones);
  
  // Check speed statistics
  assertExists(data.streams.statistics.speed);
  assertExists(data.streams.statistics.speed.average_kmh);
  assertExists(data.streams.statistics.speed.max_kmh);
  assertExists(data.streams.statistics.speed.pace_per_km);
});

Deno.test("StreamsHandler - getActivityStreams handles missing activity ID", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities//streams");
  const response = await handler.getActivityStreams(mockReq);
  
  assertEquals(response.status, 400);
  
  const data = await response.json();
  assertExists(data.error);
  assertEquals(data.error, "Activity ID is required");
});

Deno.test("StreamsHandler - getActivityStreams handles non-existent activity", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/nonexistent/streams");
  const response = await handler.getActivityStreams(mockReq);
  
  assertEquals(response.status, 500);
  
  const data = await response.json();
  assertExists(data.error);
  assertExists(data.details);
});

Deno.test("StreamsHandler - getActivityIntervals returns formatted intervals", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/test123/intervals");
  const response = await handler.getActivityIntervals(mockReq);
  
  assertEquals(response.status, 200);
  
  const data = await response.json();
  
  // Check basic structure
  assertExists(data.activity_id);
  assertExists(data.activity_name);
  assertExists(data.intervals);
  assertExists(data.summary);
  
  // Check intervals data
  assertEquals(data.intervals.length, 2);
  
  // Check first interval
  const firstInterval = data.intervals[0];
  assertEquals(firstInterval.number, 1);
  assertEquals(firstInterval.name, "Warm-up");
  assertExists(firstInterval.duration_seconds);
  assertExists(firstInterval.duration_formatted);
  assertExists(firstInterval.power);
  assertExists(firstInterval.heart_rate);
  
  // Check summary
  assertEquals(data.summary.total_intervals, 2);
  assertExists(data.summary.average_interval_duration);
  assertExists(data.summary.hardest_interval);
  assertExists(data.summary.longest_interval);
});

Deno.test("StreamsHandler - data arrays contain valid numbers", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/test123/streams");
  const response = await handler.getActivityStreams(mockReq);
  
  const data = await response.json();
  
  // Check that power data contains valid numbers
  const powerData = data.streams.data.power;
  for (let i = 0; i < Math.min(10, powerData.length); i++) {
    assertEquals(typeof powerData[i], "number", `Power data point ${i} should be a number`);
  }
  
  // Check that heart rate data contains valid numbers
  const hrData = data.streams.data.heart_rate;
  for (let i = 0; i < Math.min(10, hrData.length); i++) {
    assertEquals(typeof hrData[i], "number", `HR data point ${i} should be a number`);
  }
  
  // Check speed data is in km/h (converted from m/s)
  const speedData = data.streams.data.speed;
  assertEquals(speedData.length, 3600);
  // Speed should be around 25-32 km/h (7-9 m/s * 3.6)
  const avgSpeed = speedData.reduce((a, b) => a + b, 0) / speedData.length;
  assertEquals(avgSpeed > 20 && avgSpeed < 40, true, "Average speed should be in reasonable range");
});

Deno.test("StreamsHandler - HR zones calculation", async () => {
  const client = new MockIntervalsClient();
  const handler = new StreamsHandler(client);
  
  const mockReq = new Request("http://localhost:8000/api/v1/activities/test123/streams");
  const response = await handler.getActivityStreams(mockReq);
  
  const data = await response.json();
  
  const zones = data.streams.statistics.heart_rate.zones;
  assertExists(zones);
  assertExists(zones.zone1_recovery);
  assertExists(zones.zone2_aerobic);
  assertExists(zones.zone3_tempo);
  assertExists(zones.zone4_threshold);
  assertExists(zones.zone5_vo2max);
  
  // All zones should be percentages
  for (const [zone, value] of Object.entries(zones)) {
    assertEquals(value.includes("%"), true, `Zone ${zone} should be a percentage`);
  }
});
/**
 * Enhanced Test Framework for MCP Tools
 * より便利なテストフレームワーク機能
 */

import { assertEquals, assertExists, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";

export interface TestConfig {
  baseUrl: string;
  accessToken?: string;
  timeout?: number;
  retryCount?: number;
}

export interface TestCase {
  name: string;
  method: string;
  params?: any;
  expectedStatus?: number;
  expectedResult?: any;
  validate?: (result: any) => void;
  beforeTest?: () => Promise<any>;
  afterTest?: (originalData: any) => Promise<void>;
}

export class MCPTestClient {
  private config: TestConfig;
  private requestCount = 0;
  private totalDuration = 0;

  constructor(config: TestConfig) {
    this.config = {
      timeout: 30000,
      retryCount: 3,
      ...config
    };
  }

  async request(
    method: string,
    params: any = {},
    options: { retry?: boolean } = {}
  ): Promise<any> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    
    if (this.config.accessToken) {
      headers["Authorization"] = `Bearer ${this.config.accessToken}`;
    }

    const body = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    };

    const startTime = Date.now();
    let lastError: Error | null = null;
    const maxRetries = options.retry ? this.config.retryCount! : 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${this.config.baseUrl}/`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        
        const data = await response.json();
        
        this.requestCount++;
        this.totalDuration += Date.now() - startTime;

        if (data.error) {
          throw new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
        }

        return data.result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.log(`  ⚠️  Retry ${attempt}/${maxRetries} for ${method}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }

  async callTool(toolName: string, args: any = {}): Promise<any> {
    return this.request("tools/call", { name: toolName, arguments: args });
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      totalDuration: this.totalDuration,
      averageDuration: this.requestCount > 0 ? this.totalDuration / this.requestCount : 0
    };
  }
}

export class TestRunner {
  private client: MCPTestClient;
  private results: Array<{
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }> = [];

  constructor(client: MCPTestClient) {
    this.client = client;
  }

  async run(testCase: TestCase): Promise<void> {
    const startTime = Date.now();
    let originalData: any = null;

    try {
      console.log(`Testing ${testCase.name}...`);

      // Before test hook
      if (testCase.beforeTest) {
        originalData = await testCase.beforeTest();
        if (originalData === null || originalData === undefined) {
          console.log(`  ⏭️  Skipping ${testCase.name} - no data to backup`);
          this.results.push({
            name: testCase.name,
            passed: true,
            duration: Date.now() - startTime
          });
          return;
        }
      }

      // Execute test
      let result: any;
      if (testCase.method === "tools/call") {
        const [toolName, args] = testCase.params;
        result = await this.client.callTool(toolName, args);
      } else {
        result = await this.client.request(testCase.method, testCase.params);
      }

      // Validate result
      if (testCase.validate) {
        testCase.validate(result);
      } else if (testCase.expectedResult) {
        assertEquals(result, testCase.expectedResult);
      } else {
        assertExists(result);
      }

      console.log(`  ✅ ${testCase.name} passed`);
      this.results.push({
        name: testCase.name,
        passed: true,
        duration: Date.now() - startTime
      });

    } catch (error) {
      console.error(`  ❌ ${testCase.name} failed: ${error}`);
      this.results.push({
        name: testCase.name,
        passed: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      // After test hook (cleanup)
      if (testCase.afterTest && originalData !== null) {
        try {
          await testCase.afterTest(originalData);
          console.log(`  ✅ Data restored for ${testCase.name}`);
        } catch (error) {
          console.error(`  ❌ Failed to restore data: ${error}`);
        }
      }
    }
  }

  async runAll(testCases: TestCase[]): Promise<void> {
    console.log(`Running ${testCases.length} tests...\n`);

    for (const testCase of testCases) {
      await this.run(testCase);
    }

    this.printSummary();
  }

  printSummary(): void {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log("\n=== Test Summary ===");
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    
    const stats = this.client.getStats();
    console.log(`\n=== Request Stats ===`);
    console.log(`Total Requests: ${stats.requestCount}`);
    console.log(`Average Response Time: ${stats.averageDuration.toFixed(2)}ms`);

    if (failed > 0) {
      console.log("\n=== Failed Tests ===");
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`❌ ${result.name}: ${result.error}`);
      });
    }

    if (failed > 0) {
      throw new Error(`${failed} tests failed`);
    }
  }

  getResults() {
    return this.results;
  }
}

// Dynamic test case generator
export async function generateTestCasesFromTools(
  client: MCPTestClient
): Promise<TestCase[]> {
  const toolsResult = await client.request("tools/list");
  const tools = toolsResult.tools;

  const readOnlyTools = [
    "get_athlete",
    "get_activities", 
    "get_wellness",
    "get_custom_fields",
    "get_ucr_assessment",
    "calculate_ucr_trends",
    "check_ucr_setup",
    "batch_calculate_ucr"
  ];

  return tools.map((tool: any) => {
    const isReadOnly = readOnlyTools.includes(tool.name);
    
    // Generate default arguments
    const args: Record<string, any> = {};
    if (tool.inputSchema?.properties) {
      for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
        if (schema.type === "string") {
          if (key === "date" || key === "end_date") {
            args[key] = new Date().toISOString().split('T')[0];
          } else if (key === "start_date") {
            const date = new Date();
            date.setDate(date.getDate() - 7);
            args[key] = date.toISOString().split('T')[0];
          } else {
            args[key] = schema.default || "";
          }
        } else if (schema.type === "boolean") {
          args[key] = schema.default || false;
        } else if (schema.type === "integer" || schema.type === "number") {
          args[key] = schema.default || 0;
        }
      }
    }

    const testCase: TestCase = {
      name: `${tool.name} (${isReadOnly ? 'read-only' : 'with rollback'})`,
      method: "tools/call",
      params: [tool.name, args],
      validate: (result) => {
        assertExists(result);
        if (result.content) {
          assert(Array.isArray(result.content), "Content should be an array");
          assert(result.content.length > 0, "Content should not be empty");
        }
      }
    };

    // Add backup/restore for writable tools
    if (!isReadOnly) {
      const today = new Date().toISOString().split('T')[0];
      
      testCase.beforeTest = async () => {
        try {
          const wellness = await client.callTool("get_wellness", { date: today });
          if (wellness.content && wellness.content[0]) {
            const data = JSON.parse(wellness.content[0].text);
            return data.length > 0 ? data[0] : null;
          }
        } catch (error) {
          console.log(`  ⚠️  Could not fetch original data: ${error}`);
          return null;
        }
      };

      testCase.afterTest = async (originalData) => {
        const revertArgs: Record<string, any> = { date: today };
        
        if (tool.name === "update_wellness") {
          if (originalData.hrv_morning) revertArgs.hrv_morning = originalData.hrv_morning;
          if (originalData.resting_hr) revertArgs.resting_hr = originalData.resting_hr;
          if (originalData.comments) revertArgs.comments = originalData.comments;
        } else if (tool.name === "update_wellness_assessment") {
          if (originalData.fatigue) revertArgs.fatigue = originalData.fatigue;
          if (originalData.stress) revertArgs.stress = originalData.stress;
          if (originalData.motivation) revertArgs.motivation = originalData.motivation;
          if (originalData.soreness) revertArgs.soreness = originalData.soreness;
          if (originalData.injury) revertArgs.injury = originalData.injury;
        }
        
        await client.callTool(tool.name, revertArgs);
      };
    }

    return testCase;
  });
}

// Assertion helpers
export function assertDeepEquals(actual: any, expected: any, message?: string) {
  assertEquals(JSON.stringify(actual), JSON.stringify(expected), message);
}

export function assertContains(actual: string, expected: string, message?: string) {
  assert(actual.includes(expected), message || `Expected "${actual}" to contain "${expected}"`);
}

export function assertMatches(actual: string, pattern: RegExp, message?: string) {
  assert(pattern.test(actual), message || `Expected "${actual}" to match ${pattern}`);
}

// Retry helper
export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}
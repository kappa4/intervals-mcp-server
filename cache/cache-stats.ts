/**
 * Advanced cache statistics and monitoring
 */

import { log } from "../logger.ts";

export interface CacheStatistics {
  // Basic metrics
  totalHits: number;
  totalMisses: number;
  totalSets: number;
  totalDeletes: number;
  totalErrors: number;
  
  // Performance metrics
  avgGetTime: number;
  avgSetTime: number;
  maxGetTime: number;
  maxSetTime: number;
  
  // Data metrics
  totalBytesStored: number;
  totalBytesRetrieved: number;
  largestEntry: number;
  
  // Time-based metrics
  metricsStartTime: number;
  lastResetTime: number;
  uptime: number;
  
  // Hit rate calculations
  hitRate: number;
  missRate: number;
  
  // Data type breakdown
  dataTypeStats: Map<string, DataTypeStats>;
}

export interface DataTypeStats {
  dataType: string;
  hits: number;
  misses: number;
  sets: number;
  avgSize: number;
  totalSize: number;
  hitRate: number;
}

export class CacheStatsCollector {
  private stats: CacheStatistics;
  private operationTimes: {
    get: number[];
    set: number[];
  };
  private readonly maxTimeSamples = 1000;

  constructor() {
    this.stats = this.createEmptyStats();
    this.operationTimes = {
      get: [],
      set: []
    };
  }

  private createEmptyStats(): CacheStatistics {
    return {
      totalHits: 0,
      totalMisses: 0,
      totalSets: 0,
      totalDeletes: 0,
      totalErrors: 0,
      avgGetTime: 0,
      avgSetTime: 0,
      maxGetTime: 0,
      maxSetTime: 0,
      totalBytesStored: 0,
      totalBytesRetrieved: 0,
      largestEntry: 0,
      metricsStartTime: Date.now(),
      lastResetTime: Date.now(),
      uptime: 0,
      hitRate: 0,
      missRate: 0,
      dataTypeStats: new Map()
    };
  }

  /**
   * Record a cache hit
   */
  recordHit(dataType: string, dataSize: number, operationTime: number): void {
    this.stats.totalHits++;
    this.stats.totalBytesRetrieved += dataSize;
    
    this.recordGetTime(operationTime);
    this.updateDataTypeStats(dataType, 'hit', dataSize);
    this.updateRates();
  }

  /**
   * Record a cache miss
   */
  recordMiss(dataType: string, operationTime: number): void {
    this.stats.totalMisses++;
    
    this.recordGetTime(operationTime);
    this.updateDataTypeStats(dataType, 'miss', 0);
    this.updateRates();
  }

  /**
   * Record a cache set operation
   */
  recordSet(dataType: string, dataSize: number, operationTime: number): void {
    this.stats.totalSets++;
    this.stats.totalBytesStored += dataSize;
    this.stats.largestEntry = Math.max(this.stats.largestEntry, dataSize);
    
    this.recordSetTime(operationTime);
    this.updateDataTypeStats(dataType, 'set', dataSize);
  }

  /**
   * Record a cache delete operation
   */
  recordDelete(dataType: string): void {
    this.stats.totalDeletes++;
    this.updateDataTypeStats(dataType, 'delete', 0);
  }

  /**
   * Record an error
   */
  recordError(dataType: string, operation: string, error: Error): void {
    this.stats.totalErrors++;
    log("WARN", `Cache error in ${operation} for ${dataType}: ${error.message}`);
  }

  /**
   * Get current statistics
   */
  getStats(): CacheStatistics {
    this.stats.uptime = Date.now() - this.stats.metricsStartTime;
    return { ...this.stats };
  }

  /**
   * Get statistics for a specific data type
   */
  getDataTypeStats(dataType: string): DataTypeStats | undefined {
    return this.stats.dataTypeStats.get(dataType);
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.stats = this.createEmptyStats();
    this.operationTimes = {
      get: [],
      set: []
    };
    log("INFO", "Cache statistics reset");
  }

  /**
   * Generate a formatted report
   */
  generateReport(): string {
    const stats = this.getStats();
    const uptimeHours = (stats.uptime / 3600000).toFixed(2);
    
    let report = `=== Cache Statistics Report ===\n`;
    report += `Uptime: ${uptimeHours} hours\n\n`;
    
    report += `Operations:\n`;
    report += `  Total Hits: ${stats.totalHits}\n`;
    report += `  Total Misses: ${stats.totalMisses}\n`;
    report += `  Total Sets: ${stats.totalSets}\n`;
    report += `  Total Deletes: ${stats.totalDeletes}\n`;
    report += `  Total Errors: ${stats.totalErrors}\n\n`;
    
    report += `Performance:\n`;
    report += `  Hit Rate: ${stats.hitRate.toFixed(2)}%\n`;
    report += `  Miss Rate: ${stats.missRate.toFixed(2)}%\n`;
    report += `  Avg Get Time: ${stats.avgGetTime.toFixed(2)}ms\n`;
    report += `  Avg Set Time: ${stats.avgSetTime.toFixed(2)}ms\n`;
    report += `  Max Get Time: ${stats.maxGetTime.toFixed(2)}ms\n`;
    report += `  Max Set Time: ${stats.maxSetTime.toFixed(2)}ms\n\n`;
    
    report += `Data Volume:\n`;
    report += `  Total Stored: ${this.formatBytes(stats.totalBytesStored)}\n`;
    report += `  Total Retrieved: ${this.formatBytes(stats.totalBytesRetrieved)}\n`;
    report += `  Largest Entry: ${this.formatBytes(stats.largestEntry)}\n\n`;
    
    if (stats.dataTypeStats.size > 0) {
      report += `Data Type Breakdown:\n`;
      for (const [type, typeStats] of stats.dataTypeStats) {
        report += `  ${type}:\n`;
        report += `    Hits: ${typeStats.hits} (${typeStats.hitRate.toFixed(2)}%)\n`;
        report += `    Misses: ${typeStats.misses}\n`;
        report += `    Sets: ${typeStats.sets}\n`;
        report += `    Avg Size: ${this.formatBytes(typeStats.avgSize)}\n`;
      }
    }
    
    return report;
  }

  /**
   * Log statistics periodically
   */
  startPeriodicLogging(intervalMs: number = 300000): void { // Default: 5 minutes
    setInterval(() => {
      const stats = this.getStats();
      log("INFO", `Cache stats - Hit rate: ${stats.hitRate.toFixed(2)}%, Total ops: ${stats.totalHits + stats.totalMisses + stats.totalSets}`);
      
      // Log detailed report every hour
      if (stats.uptime % 3600000 < intervalMs) {
        log("INFO", "\n" + this.generateReport());
      }
    }, intervalMs);
  }

  private recordGetTime(time: number): void {
    this.operationTimes.get.push(time);
    if (this.operationTimes.get.length > this.maxTimeSamples) {
      this.operationTimes.get.shift();
    }
    
    this.stats.maxGetTime = Math.max(this.stats.maxGetTime, time);
    this.stats.avgGetTime = this.calculateAverage(this.operationTimes.get);
  }

  private recordSetTime(time: number): void {
    this.operationTimes.set.push(time);
    if (this.operationTimes.set.length > this.maxTimeSamples) {
      this.operationTimes.set.shift();
    }
    
    this.stats.maxSetTime = Math.max(this.stats.maxSetTime, time);
    this.stats.avgSetTime = this.calculateAverage(this.operationTimes.set);
  }

  private updateDataTypeStats(
    dataType: string, 
    operation: 'hit' | 'miss' | 'set' | 'delete',
    dataSize: number
  ): void {
    let typeStats = this.stats.dataTypeStats.get(dataType);
    if (!typeStats) {
      typeStats = {
        dataType,
        hits: 0,
        misses: 0,
        sets: 0,
        avgSize: 0,
        totalSize: 0,
        hitRate: 0
      };
      this.stats.dataTypeStats.set(dataType, typeStats);
    }
    
    switch (operation) {
      case 'hit':
        typeStats.hits++;
        break;
      case 'miss':
        typeStats.misses++;
        break;
      case 'set':
        typeStats.sets++;
        typeStats.totalSize += dataSize;
        typeStats.avgSize = typeStats.totalSize / typeStats.sets;
        break;
    }
    
    // Update hit rate for this data type
    const total = typeStats.hits + typeStats.misses;
    typeStats.hitRate = total > 0 ? (typeStats.hits / total) * 100 : 0;
  }

  private updateRates(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    if (total > 0) {
      this.stats.hitRate = (this.stats.totalHits / total) * 100;
      this.stats.missRate = (this.stats.totalMisses / total) * 100;
    }
  }

  private calculateAverage(times: number[]): number {
    if (times.length === 0) return 0;
    const sum = times.reduce((acc, time) => acc + time, 0);
    return sum / times.length;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}
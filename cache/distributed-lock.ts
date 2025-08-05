/**
 * Distributed lock implementation using Deno KV
 * Prevents duplicate execution across multiple isolates in serverless environments
 */

import { log } from "../logger.ts";

export interface LockOptions {
  ttlMs?: number; // Time to live in milliseconds
  retryAttempts?: number;
  retryDelayMs?: number;
}

export class DistributedLock {
  private kv: Deno.Kv;
  private kvPath?: string;

  constructor(kvPath?: string) {
    this.kvPath = kvPath;
  }

  /**
   * Initialize the KV connection
   */
  async initialize(): Promise<void> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.kvPath);
      log("DEBUG", "DistributedLock: KV connection established");
    }
  }

  /**
   * Attempt to acquire a lock
   * @returns true if lock was acquired, false otherwise
   */
  async acquireLock(
    key: string,
    options: LockOptions = {},
  ): Promise<boolean> {
    await this.initialize();

    const {
      ttlMs = 60000, // Default 1 minute TTL
      retryAttempts = 0,
      retryDelayMs = 100,
    } = options;

    const lockKey = ["locks", key];
    const lockValue = {
      owner: crypto.randomUUID(),
      timestamp: Date.now(),
      ttl: ttlMs,
    };

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        // Atomic check and set
        const result = await this.kv.atomic()
          .check({ key: lockKey, versionstamp: null }) // Only set if key doesn't exist
          .set(lockKey, lockValue, { expireIn: ttlMs })
          .commit();

        if (result.ok) {
          log("DEBUG", `DistributedLock: Acquired lock for ${key}`);
          return true;
        }

        // Check if existing lock has expired
        const existing = await this.kv.get(lockKey);
        if (existing.value) {
          const existingLock = existing.value as typeof lockValue;
          const elapsed = Date.now() - existingLock.timestamp;

          if (elapsed > existingLock.ttl) {
            // Lock has expired, try to take it over
            const takeoverResult = await this.kv.atomic()
              .check({ key: lockKey, versionstamp: existing.versionstamp })
              .set(lockKey, lockValue, { expireIn: ttlMs })
              .commit();

            if (takeoverResult.ok) {
              log(
                "DEBUG",
                `DistributedLock: Took over expired lock for ${key}`,
              );
              return true;
            }
          }
        }

        if (attempt < retryAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      } catch (error) {
        log(
          "ERROR",
          `DistributedLock: Error acquiring lock for ${key}:`,
          error,
        );
        if (attempt === retryAttempts) {
          throw error;
        }
      }
    }

    log(
      "DEBUG",
      `DistributedLock: Failed to acquire lock for ${key} after ${
        retryAttempts + 1
      } attempts`,
    );
    return false;
  }

  /**
   * Release a lock
   */
  async releaseLock(key: string, owner?: string): Promise<boolean> {
    await this.initialize();

    const lockKey = ["locks", key];

    try {
      if (owner) {
        // Only release if we own the lock
        const existing = await this.kv.get(lockKey);
        if (existing.value) {
          const existingLock = existing.value as { owner: string };
          if (existingLock.owner !== owner) {
            log(
              "WARN",
              `DistributedLock: Cannot release lock ${key} - not the owner`,
            );
            return false;
          }
        }
      }

      await this.kv.delete(lockKey);
      log("DEBUG", `DistributedLock: Released lock for ${key}`);
      return true;
    } catch (error) {
      log("ERROR", `DistributedLock: Error releasing lock for ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a lock exists and is valid
   */
  async isLocked(key: string): Promise<boolean> {
    await this.initialize();

    const lockKey = ["locks", key];
    const result = await this.kv.get(lockKey);

    if (!result.value) {
      return false;
    }

    const lock = result.value as { timestamp: number; ttl: number };
    const elapsed = Date.now() - lock.timestamp;

    return elapsed <= lock.ttl;
  }

  /**
   * Close the KV connection
   */
  async close(): Promise<void> {
    if (this.kv) {
      await this.kv.close();
      this.kv = null as any;
    }
  }
}

/**
 * Decorator function to run a function with distributed lock
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options?: LockOptions,
): Promise<T | null> {
  const lock = new DistributedLock();

  try {
    const acquired = await lock.acquireLock(lockKey, options);
    if (!acquired) {
      log(
        "INFO",
        `Skipping execution - lock ${lockKey} held by another instance`,
      );
      return null;
    }

    return await fn();
  } finally {
    await lock.releaseLock(lockKey);
    await lock.close();
  }
}

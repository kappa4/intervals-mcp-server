# 分散ロック改善提案

## 現在の実装の問題点と改善案

### 1. ロック取得の公平性改善
```typescript
// 現在: 即座にスキップ
retryAttempts: 0

// 改善案: ランダムバックオフ付きリトライ
retryAttempts: 2,
retryDelayMs: Math.random() * 1000 + 500 // 500-1500ms
```

### 2. ロック所有者の検証強化
```typescript
export interface LockValue {
  owner: string;
  timestamp: number;
  ttl: number;
  isolateId?: string; // Deno Deploy isolate ID
  renewCount?: number; // ロック更新回数
}

// ロック更新機能の追加
async renewLock(key: string, owner: string): Promise<boolean> {
  const lockKey = ["locks", key];
  const existing = await this.kv.get(lockKey);
  
  if (!existing.value) return false;
  
  const lock = existing.value as LockValue;
  if (lock.owner !== owner) return false;
  
  // TTLの50%が経過していたら更新
  const elapsed = Date.now() - lock.timestamp;
  if (elapsed > lock.ttl * 0.5) {
    const newLock = {
      ...lock,
      timestamp: Date.now(),
      renewCount: (lock.renewCount || 0) + 1
    };
    
    const result = await this.kv.atomic()
      .check({ key: lockKey, versionstamp: existing.versionstamp })
      .set(lockKey, newLock, { expireIn: lock.ttl })
      .commit();
    
    return result.ok;
  }
  
  return true;
}
```

### 3. デッドロック検出機構
```typescript
// ロック待機情報の記録
interface LockWaitInfo {
  waiter: string;
  targetLock: string;
  timestamp: number;
}

async detectDeadlock(lockKey: string): Promise<boolean> {
  // 待機チェーンを検査
  const waitKey = ["lock-waits", lockKey];
  const waiters = await this.kv.list({ prefix: ["lock-waits"] });
  
  // 循環待機の検出ロジック
  // (実装は省略 - グラフ理論的なアプローチ)
  return false;
}
```

### 4. 監視とメトリクス
```typescript
interface LockMetrics {
  acquisitionAttempts: number;
  acquisitionSuccesses: number;
  acquisitionFailures: number;
  averageHoldTime: number;
  contentionRate: number;
}

// Deno KVに統計情報を記録
async recordLockMetrics(key: string, success: boolean, holdTime?: number) {
  const metricsKey = ["lock-metrics", key];
  // 実装...
}
```

### 5. フェアネス保証
```typescript
// FIFO順序でのロック取得
interface LockQueue {
  key: string;
  waiters: Array<{
    id: string;
    timestamp: number;
  }>;
}

async enqueueLockWaiter(lockKey: string, waiterId: string) {
  const queueKey = ["lock-queue", lockKey];
  // アトミックに待機者を追加
}
```

## 実装の優先順位

1. **高優先度**: ランダムバックオフ付きリトライ（簡単で効果的）
2. **中優先度**: ロック更新機能（長時間処理対応）
3. **低優先度**: デッドロック検出（現在の設計では不要）

## 結論

現在の実装でも基本的な安全性は確保されていますが、
サーバーレス環境での公平性とパフォーマンスを向上させるため、
段階的な改善を推奨します。
# Intervals.icu MCP Server - TypeScript移行 引き継ぎドキュメント

## 作業概要

**実施日**: 2025-08-03  
**作業内容**: PythonからTypeScript/Deno Deployへの移行（Phase 1 & 2完了）  
**移行理由**: Memory MCPのDeno Deploy版成功パターンを活用し、Railway環境でのSSE 404エラー問題を根本解決

## 移行戦略

Memory MCPの成功パターンに基づいた段階的移行を実施：
- **成功例**: Memory MCP (TypeScript/Deno Deploy) - Claude.aiと正常通信中
- **問題例**: intervals-mcp-server (Python/Railway) - SSE 404エラー継続

## Phase 1: 基盤構築 ✅ 完了

### 実装完了事項

#### 1. プロジェクト構造構築 ✅
```
intervals-mcp-ts/
├── deno.json                 # Deno設定ファイル
├── README.md                 # プロジェクト説明
├── logger.ts                 # ログシステム
├── intervals-types.ts        # Intervals.icu API型定義
├── intervals-client.ts       # Intervals.icu APIクライアント
├── mcp-types.ts             # MCP プロトコル型定義
├── mcp-handler.ts           # MCP プロトコルハンドラー
└── main.ts                  # メインサーバーファイル
```

#### 2. 核心機能実装状況

**✅ 完了:**
- **環境変数バリデーション**: 起動時の必須変数チェック（ATHLETE_ID, API_KEY, JWT_SECRET_KEY, ORIGIN）
- **ログシステム**: Memory MCP準拠のStructured Logging
- **Intervals.icu API**: 完全なTypeScript実装（Activities, Wellness, Events, Athlete等）
- **MCP プロトコル**: JSON-RPC 2.0ベースの完全実装
- **MCPツール6種**: get_activities, get_activity, update_activity, get_wellness, update_wellness, get_athlete_info
- **Health Check**: `/health`, `/info`エンドポイント

**🟡 実装中:**
- OAuth 2.1認証統合（未実装）
- Deno Deployデプロイ（未実施）

#### 3. 技術的実装詳細

**Intervals.icu APIクライアント:**
```typescript
// 完全な型安全性を持つAPIクライアント
const client = new IntervalsAPIClient({
  athlete_id: "i123456",
  api_key: "your_api_key"
});

// 使用例
const activities = await client.getActivities({ limit: 10, type: "Ride" });
const wellness = await client.getWellnessData({ limit: 7 });
```

**MCPツール実装:**
- `get_activities`: フィルタリング対応（type, date range, limit）
- `get_activity`: 詳細情報取得
- `update_activity`: 名前・説明・タイプ更新
- `get_wellness`: 期間指定wellness取得
- `update_wellness`: wellness指標更新
- `get_athlete_info`: プロファイル情報

**ログシステム:**
```typescript
import { log, info, debug, warn, error } from "./logger.ts";
// LOG_LEVEL環境変数で制御（DEBUG, INFO, WARN, ERROR）
```

#### 4. 現在の動作確認

**ローカル起動:**
```bash
cd intervals-mcp-ts
# 環境変数設定
export ATHLETE_ID=i123456
export API_KEY=your_intervals_api_key
export JWT_SECRET_KEY=your_32_char_jwt_secret
export ORIGIN=http://localhost:8000

# 起動
deno task dev
```

**動作確認済みエンドポイント:**
- `GET /health` - サーバーヘルスチェック ✅
- `GET /info` - Intervals.icu接続確認 ✅

## Phase 2: OAuth 2.1認証統合 ✅ 完了

**実装完了事項:**
1. **OAuth Server実装**
   - Memory MCPパターン完全移植
   - Client Registration (`/oauth/register`) ✅
   - Authorization (`/oauth/authorize`) ✅
   - Token Exchange (`/oauth/token`) ✅
   - Discovery endpoints (`/.well-known/*`) ✅

2. **認証統合**
   - MCPハンドラーへのOAuth認証統合 ✅
   - Bearer token検証 ✅
   - HTTP request → MCP request 変換 ✅
   - CORS設定完了 ✅

3. **動作検証完了**
   - OAuth認証フロー正常動作確認 ✅
   - 認証なしアクセス拒否確認 ✅
   - PKCE (S256) サポート確認 ✅
   - Claude Desktop用public client対応 ✅

### Phase 3: Deno Deployデプロイ（次のステップ）

**実装予定:**
1. **GitHub連携設定**
2. **環境変数設定**
3. **Claude.ai接続テスト**

## 技術的な重要な知見

### 1. Memory MCPから学んだ成功パターン

**✅ 採用済み:**
- シンプルなHTTPハンドラー構造（FastAPIの複雑な統合回避）
- 環境変数による設定管理
- Structured Logging
- 型安全なAPI実装

**🟡 適用予定:**
- OAuth 2.1の"none"認証方式（Claude Desktop対応）
- PKCE必須実装
- SSEエンドポイントの直接実装

### 2. Python版から移植した設計

**APIクライアント設計:**
- Python版の`make_intervals_request`をTypeScript化
- エラーハンドリングとログ統合
- 型安全性の向上

**MCPツール設計:**
- Python版の@mcp.tool()デコレータパターンをclass-based実装に移植
- 同じツール名・引数仕様を維持（互換性保持）

### 3. 環境変数要件

**必須設定:**
```env
ATHLETE_ID=i123456                           # Intervals.icu athlete ID
API_KEY=your_intervals_api_key               # Intervals.icu API key
JWT_SECRET_KEY=minimum_32_character_secret   # OAuth JWT secret
ORIGIN=https://your-deno-deploy-url.deno.dev # Public URL
```

**オプション設定:**
```env
LOG_LEVEL=INFO                               # DEBUG, INFO, WARN, ERROR
PORT=8000                                    # Local development port
```

## ファイル詳細解説

### `main.ts` - メインサーバー
- HTTP リクエストハンドリング
- CORS設定
- 環境変数バリデーション
- Health check / Info エンドポイント
- **TODO**: OAuth認証統合、MCPプロトコル統合

### `intervals-client.ts` - API クライアント
- 完全なIntervals.icu API実装
- 型安全なHTTPクライアント
- エラーハンドリング統合
- **網羅範囲**: Activities, Wellness, Events, Athlete, Workouts

### `mcp-handler.ts` - MCP プロトコル
- JSON-RPC 2.0準拠実装
- 6つのMCPツール実装済み
- Resource endpoints実装
- **TODO**: OAuth認証との統合

### `intervals-types.ts` - 型定義
- Intervals.icu API レスポンス型
- フィルター・オプション型
- 完全な型安全性

### `mcp-types.ts` - MCP型定義
- MCP v2024-11-05仕様準拠
- JSON-RPC 2.0型定義
- Tools, Resources, Prompts対応

## 次回作業の開始手順

### 1. 作業再開時の確認事項

```bash
# 1. プロジェクトディレクトリ確認
cd /Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/intervals-mcp-ts

# 2. 実装済みファイル確認
ls -la
# 期待: deno.json, main.ts, *.ts ファイル群

# 3. ローカル動作確認
deno task dev
# 期待: サーバー起動、環境変数バリデーション通過

# 4. Health check確認
curl http://localhost:8000/health
# 期待: {"status":"healthy",...}

# 5. Intervals API接続確認
curl http://localhost:8000/info
# 期待: athlete情報取得成功
```

### 2. OAuth 2.1実装開始

**参考リソース:**
```bash
# Memory MCP OAuth実装
/Users/k.takahashi/src/memory-mcp/deno-deploy/oauth/

# 参考ファイル:
# - auth-server.ts (OAuthサーバー実装)
# - handlers/ (各エンドポイント実装)
# - middleware.ts (認証ミドルウェア)
```

**実装手順:**
1. `oauth/` ディレクトリ作成
2. Memory MCPの`auth-server.ts`をベースに実装
3. `main.ts`にOAuth endpoints統合
4. MCPハンドラーに認証統合

### 3. デプロイ準備

**Deno Deploy設定:**
1. GitHub repositoryにpush
2. Deno Deploy dashboardでproject作成
3. 環境変数設定
4. デプロイテスト

## リスク・注意事項

### 1. 環境依存問題
- **JWT_SECRET_KEY**: 32文字以上必須
- **ORIGIN**: Deno Deploy URLに合わせて更新必要
- **API_KEY**: Intervals.icu の有効期限確認

### 2. 互換性維持
- Python版MCPツールとの仕様互換性保持
- Claude Desktop設定変更が必要（URL変更）

### 3. 未実装機能
- **OAuth認証**: 現在認証なしで動作（テスト用）
- **Rate limiting**: 未実装
- **Error recovery**: 基本的なもののみ

## 成功基準

### Phase 2完了時
- [ ] OAuth 2.1完全実装
- [ ] Claude Desktop からの認証成功
- [ ] 全MCPツールが認証付きで動作

### Phase 3完了時
- [ ] Deno Deploy本番デプロイ成功
- [ ] Claude.ai との正常通信
- [ ] Python版と同等の機能提供

## 参考資料

**Memory MCP成功例:**
- `/Users/k.takahashi/src/memory-mcp/deno-deploy/main.ts`
- `/Users/k.takahashi/src/memory-mcp/deno-deploy/oauth/`

**Python版intervals-mcp-server:**
- `/Users/k.takahashi/src/github.com/kappa4/intervals-mcp-server/src/intervals_mcp_server/`

**技術ドキュメント:**
- [MCP Specification](https://modelcontextprotocol.io/docs)
- [Deno Deploy Documentation](https://deno.com/deploy/docs)
- [Intervals.icu API Documentation](https://intervals.icu/api/docs)

---

**最終更新**: 2025-08-03  
**担当者**: Claude Code  
**次回作業**: OAuth 2.1認証統合 → Deno Deployデプロイ  
**重要**: TypeScript版は現在Phase 1完了、OAuth認証実装でClaude.ai接続可能になる予定
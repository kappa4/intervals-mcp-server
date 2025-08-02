# Remote MCP Server実装計画書（改訂版）

## 概要
現在のIntervals.icu MCP ServerはHTTP/SSEトランスポートを部分的にサポートしていますが、完全なRemote MCP仕様に準拠していません。本計画書では、**シンプルで実用的な**認証機能を含むRemote MCP対応を実装するための作業内容を定めます。

## 現状分析

### 既存の実装
- FastAPIを使用したHTTPサーバー機能
- SSEトランスポートの基本実装（`/sse`エンドポイント）
- stdioモードとHTTPモードの切り替え機能
- Intervals.icu APIへの認証（API Key方式）

### 不足している機能
1. **認証機能**
   - 現在は認証なしでSSEエンドポイントにアクセス可能
   - API Key認証の実装なし
   - 基本的なアクセス制御なし

2. **セキュリティ機能**
   - Originヘッダーの検証なし
   - CORS設定が過度に緩い（`allow_origins=["*"]`）
   - HTTPS強制の仕組みなし

3. **エラーハンドリング**
   - JSON-RPC 2.0準拠のエラーレスポンス不足
   - 接続エラーの適切な処理なし
   - 再接続メカニズムの欠如

4. **監視・ロギング**
   - 接続イベントのログ記録なし
   - エラー率の監視機能なし
   - パフォーマンスメトリクスなし

## 実装計画（段階的アプローチ）

### フェーズ1: セキュリティ基盤の構築（優先度: 最高）

#### 1.1 基本的なセキュリティ機能
- Originヘッダーの検証実装
- CORS設定の厳格化（許可するオリジンを明示的に指定）
- HTTPS強制のミドルウェア追加

#### 1.2 シンプルな認証機能
- API Key認証の実装（ヘッダーベース）
- 認証ミドルウェアの作成
- エラーレスポンスの標準化

#### 1.3 ロギング・監視基盤
- 接続イベントのログ記録
- エラー発生時の詳細ログ
- 基本的なメトリクス収集

### フェーズ2: SSE実装の改善（優先度: 高）

#### 2.1 エラーハンドリングの強化
- JSON-RPC 2.0準拠のエラーレスポンス
- 接続エラーの適切な処理
- クライアントへの明確なエラー通知

#### 2.2 接続の安定性向上
- 再接続サポートの実装
- ハートビート機能の追加
- タイムアウト処理の改善

### フェーズ3: テストとドキュメント（優先度: 高）

#### 3.1 包括的なテストスイート
- 認証機能のテスト
- SSE接続のテスト
- エラーケースのテスト
- セキュリティテスト

#### 3.2 ドキュメント更新
- README.mdの更新（正確な機能説明）
- API Key設定ガイドの追加
- トラブルシューティングガイド

### フェーズ4: 将来の拡張（優先度: 低）

#### 4.1 高度な認証（オプション）
- OAuth 2.0サポート（必要に応じて）
- JWT認証（必要に応じて）

#### 4.2 パフォーマンス最適化
- 接続プーリング
- レスポンスキャッシング
- 負荷分散対応

## 実装詳細

### API Key認証の実装

#### 必要なライブラリ（最小限）
```toml
# 追加ライブラリは不要（FastAPIの標準機能で実装可能）
```

#### 環境変数の追加
```env
# 認証設定
MCP_API_KEY=your_secure_api_key_here

# セキュリティ設定
ALLOWED_ORIGINS=https://claude.ai,https://app.claude.ai
ENFORCE_HTTPS=true
```

### セキュリティ実装の詳細

#### API Key認証の実装
```python
from fastapi import Header, HTTPException

async def verify_api_key(x_api_key: str = Header(None)):
    """シンプルなAPI Key認証"""
    expected_key = os.getenv("MCP_API_KEY")
    if not expected_key:
        logger.warning("MCP_API_KEY not configured, authentication disabled")
        return  # 開発環境では認証をスキップ
    
    if not x_api_key or x_api_key != expected_key:
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing API key"
        )
```

#### Originヘッダーの検証
```python
async def verify_origin(origin: str = Header(None)):
    """オリジン検証ミドルウェア"""
    allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
    if not allowed_origins:
        return  # 設定されていない場合はスキップ
    
    if origin and origin not in allowed_origins:
        raise HTTPException(
            status_code=403,
            detail=f"Origin {origin} not allowed"
        )
```

#### HTTPS強制の実装
```python
from fastapi import Request

async def enforce_https(request: Request):
    """HTTPS接続を強制"""
    if os.getenv("ENFORCE_HTTPS", "false").lower() == "true":
        if request.url.scheme != "https":
            raise HTTPException(
                status_code=400,
                detail="HTTPS required"
            )
```

## テスト計画

### 単体テスト
1. API Key認証の検証ロジック
2. Originヘッダー検証ロジック
3. HTTPS強制ミドルウェア
4. エラーレスポンスのフォーマット

### 統合テスト
1. API Key認証付きSSE接続
2. 無効な認証情報での接続拒否
3. 許可されていないオリジンからのアクセス拒否
4. エラーケースの適切な処理

### E2Eテスト
1. Claude Desktopからの接続テスト
2. 再接続の動作確認
3. 長時間接続の安定性
4. 同時複数接続の処理

### テストコード例
```python
# test_auth.py
async def test_api_key_authentication():
    # 有効なAPI Keyでのテスト
    headers = {"X-API-Key": "valid_key"}
    response = await client.get("/sse", headers=headers)
    assert response.status_code == 200
    
    # 無効なAPI Keyでのテスト
    headers = {"X-API-Key": "invalid_key"}
    response = await client.get("/sse", headers=headers)
    assert response.status_code == 401
```

## リスクと対策

### リスク1: 既存ユーザーへの影響
- **対策**: API Key認証をオプション機能として実装（環境変数未設定時は無効）
- **移行計画**: ドキュメントで段階的な移行手順を提供

### リスク2: 設定ミスによるアクセス不能
- **対策**: 明確なエラーメッセージとトラブルシューティングガイド
- **フォールバック**: stdioモードの維持

### リスク3: セキュリティ設定の不備
- **対策**: デフォルトで安全な設定を採用
- **監査**: 設定値の妥当性チェック機能

## 現実的なタイムライン

### Week 1: フェーズ1（セキュリティ基盤）
- セキュリティミドルウェア実装: 2日
- API Key認証実装: 1日
- ロギング機能追加: 1日
- 単体テスト作成: 1日

### Week 2: フェーズ2（SSE改善）
- エラーハンドリング改善: 2日
- 再接続機能実装: 2日
- 統合テスト作成: 1日

### Week 3: フェーズ3（テストとドキュメント）
- E2Eテスト実装: 2日
- ドキュメント更新: 2日
- 最終確認とバグ修正: 1日

## 成功基準

1. Claude DesktopからRemote MCPサーバーとして接続可能
2. API Key認証による基本的なアクセス制御
3. セキュアな接続（HTTPS推奨、Origin検証）
4. 既存のstdioモードとの完全な互換性維持
5. 明確なエラーメッセージとログ出力
6. 包括的なテストカバレッジ（70%以上）

## 実装の具体例

### Claude Desktop設定例
```json
{
  "mcpServers": {
    "intervals-remote": {
      "url": "https://your-server.com/sse",
      "transport": "sse",
      "headers": {
        "X-API-Key": "your_secure_api_key"
      }
    }
  }
}
```

### 環境変数設定例
```bash
# .env.remote
MCP_API_KEY=your_secure_random_key
ALLOWED_ORIGINS=https://claude.ai,https://app.claude.ai
ENFORCE_HTTPS=true
LOG_LEVEL=INFO
```

## 次のステップ

1. この改訂版計画書のレビューと承認
2. セキュリティミドルウェアの実装から開始
3. 段階的な実装とテスト
4. ドキュメントの同時更新
5. ユーザーフィードバックの収集

## 重要な決定事項

1. **認証方式**: シンプルなAPI Key認証から開始
2. **移行戦略**: 既存ユーザーに影響を与えない段階的導入
3. **セキュリティレベル**: 実用的なレベルから開始し、必要に応じて強化
4. **テスト方針**: 実装と並行してテストを作成

## 既知の課題と解決策（memory-mcpプロジェクトからの学び）

### FastMCPの制限事項

1. **ミドルウェアサポートなし**
   - `@mcp.middleware`デコレーターは使用不可
   - 解決策：プロキシレベルでの認証実装を推奨

2. **HTTPヘッダーへのアクセス制限**
   - ツール関数からリクエストヘッダーにアクセス不可
   - 解決策：認証はプロキシ/ゲートウェイレイヤーで実装

3. **トランスポート名の正しい指定**
   - 誤：`http`または`sse`
   - 正：`streamable-http`（FastMCPで使用）

### MCPプロトコル実装の注意点

1. **初期化シーケンスの厳密な遵守**
   ```
   1. Client → Server: Initialize Request
   2. Server → Client: Initialize Response (with mcp-session-id header)
   3. Client → Server: Initialized Notification（必須！）
   4. Client → Server: 通常のリクエスト
   ```
   **重要**: 手順3の`notifications/initialized`を送信しないと、以降のリクエストがすべて失敗

2. **パラメータ名の規約**
   - ❌ snake_case（例：`protocol_version`）
   - ✅ camelCase（例：`protocolVersion`）

3. **必須ヘッダーの設定**
   ```
   Content-Type: application/json
   Accept: application/json, text/event-stream  # 両方必要
   ```

4. **セッション管理**
   - 初期化レスポンスの`mcp-session-id`ヘッダーを保存
   - 後続リクエストで同じセッションIDを送信

### 推奨されるプロキシベース認証アーキテクチャ

```
[Claude Desktop] → [Auth Proxy] → [MCP Server]
                    ↑
                    認証実装はここ
```

#### Cloudflare Workers例（推奨）
```javascript
export default {
  async fetch(request, env) {
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== env.MCP_API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // MCPサーバーへプロキシ
    const newRequest = new Request(env.MCP_SERVER_URL, request);
    return fetch(newRequest);
  }
}
```

#### Nginx例
```nginx
location /mcp {
    if ($http_x_api_key != "your-api-key") {
        return 401;
    }
    proxy_pass http://localhost:8000;
    proxy_set_header Accept "application/json, text/event-stream";
}
```

### デバッグとテストのヒント

1. **エラーメッセージの確認**
   - "Received request before initialization was complete" → `notifications/initialized`が未送信
   - "Invalid request parameters" → パラメータ名がsnake_case
   - "Bad Request: Missing session ID" → セッションIDヘッダーが未設定

2. **SSEレスポンスの処理**
   ```python
   for line in response.iter_lines():
       if line:
           line_str = line.decode('utf-8')
           if line_str.startswith('data: '):
               json_data = json.loads(line_str[6:])  # "data: "の後がJSON
   ```

3. **手動テスト用curl例**
   ```bash
   # 初期化リクエスト
   curl -X POST http://localhost:8000/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "clientInfo": {"name": "test", "version": "1.0"}}, "id": 1}'
   ```

## 参考資料

- [Model Context Protocol Specification](https://modelcontextprotocol.io/docs)
- [FastAPI Security Documentation](https://fastapi.tiangolo.com/tutorial/security/)
- [Anthropic MCP Documentation](https://support.anthropic.com/en/articles/11175166)
- [SSE W3C Specification](https://www.w3.org/TR/eventsource/)
- [memory-mcpプロジェクトの実装経験](https://github.com/kappa4/memory-mcp)
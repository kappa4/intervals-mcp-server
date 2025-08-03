# Railway.app トラブルシューティングガイド

## ログ確認の効率的な方法

```bash
# 最新20行を取得（短時間で終了）
railway logs | head -20

# 最後30行を取得（エラー確認に便利）
railway logs | tail -30

# 特定行数範囲を取得
railway logs | tail -50 | head -20

# ビルドログのみ確認
railway logs --build

# デプロイログのみ確認  
railway logs --deployment
```

## 発生した問題と解決策

### 1. main.py not found エラー
**問題**: `/usr/local/bin/python: can't open file '/app/main.py': [Errno 2] No such file or directory`

**解決策**: `railway.toml`に`startCommand = "python app.py"`を追加

```toml
[deploy]
startCommand = "python app.py"
healthcheckPath = "/health"
healthcheckTimeout = 300
restartPolicyType = "ON_FAILURE"
```

### 2. ログレベル問題（stderr vs stdout）
**問題**: INFOレベルのログがエラーとして表示される

**解決策**: `logging.StreamHandler(sys.stdout)`を使用
```python
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
```

### 3. request.send属性エラー
**問題**: `AttributeError: 'Request' object has no attribute 'send'`

**解決策**: 環境適応型send関数選択
```python
# 環境適応型send関数選択
if hasattr(request, 'send') and hasattr(request.send, '__wrapped__'):
    send_func = request.send.__wrapped__  # ローカル開発環境
else:
    send_func = request._send  # Railway本番環境
```

### 4. OAuth Discovery エンドポイント404
**問題**: `/.well-known/oauth-protected-resource` → 404 Not Found

**解決策**: app.pyに OAuth Discovery エンドポイントを追加
```python
@app.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource_metadata():
    return get_protected_resource_metadata()

@app.get("/.well-known/oauth-authorization-server") 
async def oauth_authorization_server_metadata():
    return get_authorization_server_metadata()

@app.get("/.well-known/jwks.json")
async def jwks_endpoint():
    return create_jwks()
```

### 5. ASGI メッセージエラー（部分的解決）
**問題**: `RuntimeError: Unexpected ASGI message 'http.response.start' sent, after response already completed`

**根本原因**: app.pyで新しいFastAPIインスタンスを作成していたため、ミドルウェアとライフサイクル管理が重複

**解決策**: 既存のappインスタンスを使用
```python
# 修正前
from intervals_mcp_server.server import mcp
app = FastAPI(...)  # 新しいインスタンス

# 修正後  
from intervals_mcp_server.server import mcp, app  # 既存を使用
```

**現状**: ASGIエラーは解決、OAuth Discovery正常、但しSSEエンドポイントで404エラー継続

### 6. SSE エンドポイント404エラー（原因特定）
**問題**: `curl -I https://server/` → 404 Not Found

**根本原因**: Memory MCPの成功パターンと比較した結果、FastMCPとFastAPIの手動統合が原因と判明

**Memory MCP成功パターン**:
```python
mcp = FastMCP("Memory Service with OAuth")
# OAuth Provider設定
mcp.run(transport='streamable-http')  # エンドポイント自動生成
```

**intervals-mcp-server問題パターン**:
```python  
mcp = FastMCP(...)
app = FastAPI(...)  # 手動統合
# 複雑なSSEエンドポイント手動実装
```

**解決策**: Memory MCPパターンに変更
- 手動FastAPI統合を廃止
- `mcp.run(transport='streamable-http')`に変更  
- FastMCPネイティブ機能を活用

## Railway環境とローカル環境の違い

| 項目 | ローカル環境 | Railway環境 |
|------|-------------|-------------|
| send関数 | `request.send.__wrapped__` | `request._send` |
| ログ出力 | stderr/stdout両方可 | stdoutのみ推奨 |
| 起動ファイル | 任意 | `startCommand`で指定必要 |
|環境変数 | `.env`ファイル | Railway dashboard |

## 推奨デバッグフロー

1. `railway logs | tail -20` でエラー確認
2. ローカルでsimple_integrated.pyが動作するか確認  
3. 環境差異を考慮した修正
4. `railway up` でデプロイ
5. cURLでエンドポイントテスト

## 設定済み環境変数
- `ATHLETE_ID`: i72555
- `BASE_URL`: https://web-production-3b15c.up.railway.app  
- `JWT_SECRET_KEY`: 設定済み
- `API_KEY`: 設定済み
- `ALLOWED_ORIGINS`: https://claude.ai
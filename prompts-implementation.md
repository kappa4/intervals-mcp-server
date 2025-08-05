# prompts/list実装案

MCPのprompts機能を実装することで、Claude.aiでより良いユーザー体験を提供できます。

## 実装例

```typescript
// mcp-handler.ts に追加
case "prompts/list":
  result = await this.handleListPrompts();
  break;

private async handleListPrompts(): Promise<ListPromptsResponse> {
  return {
    prompts: [
      {
        name: "morning_routine",
        description: "朝のルーティンチェック（UCR評価とウェルネス更新）",
        arguments: [
          {
            name: "fatigue",
            description: "疲労度 (1-5)",
            required: false
          },
          {
            name: "stress",
            description: "ストレス (1-5)",
            required: false
          }
        ]
      },
      {
        name: "training_analysis",
        description: "トレーニング分析（最近のアクティビティとUCRトレンド）",
        arguments: [
          {
            name: "days",
            description: "分析期間（日数）",
            required: false
          }
        ]
      }
    ]
  };
}
```

## メリット
- Claude.aiでプリセットプロンプトが使える
- ユーザーの利便性向上
- 一般的なワークフローの標準化
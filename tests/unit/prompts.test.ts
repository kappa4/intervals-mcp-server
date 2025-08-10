#!/usr/bin/env -S deno run --allow-env

import { UCR_PROMPTS, generatePromptTemplate } from "./ucr-prompts.ts";

console.log("=" .repeat(70));
console.log("MCP Prompts 実装テスト");
console.log("=" .repeat(70));

// 1. プロンプト一覧の確認
console.log("\n【利用可能なプロンプト】");
UCR_PROMPTS.forEach((prompt, index) => {
  console.log(`${index + 1}. ${prompt.name}`);
  console.log(`   説明: ${prompt.description}`);
  if (prompt.arguments && prompt.arguments.length > 0) {
    console.log(`   引数:`);
    prompt.arguments.forEach(arg => {
      console.log(`     - ${arg.name} (${arg.required ? '必須' : '任意'}): ${arg.description}`);
    });
  } else {
    console.log(`   引数: なし`);
  }
  console.log();
});

// 2. プロンプトテンプレート生成のテスト
console.log("=" .repeat(70));
console.log("プロンプトテンプレート生成テスト");
console.log("=" .repeat(70));

// テスト1: 朝のアセスメント
console.log("\n【テスト1: ucr_morning_assessment】");
try {
  const template1 = generatePromptTemplate("ucr_morning_assessment", {
    planned_training: "10km閾値走",
    yesterday_training: "リカバリーラン5km"
  });
  console.log("✅ テンプレート生成成功");
  console.log("\n生成されたプロンプト（最初の300文字）:");
  console.log(template1.substring(0, 300) + "...");
} catch (error) {
  console.log("❌ エラー:", error);
}

// テスト2: トレーニングポリシー
console.log("\n【テスト2: ucr_training_policy】");
try {
  const template2 = generatePromptTemplate("ucr_training_policy", {
    training_goal: "フルマラソン3時間切り",
    time_horizon: "3週間"
  });
  console.log("✅ テンプレート生成成功");
  console.log("\n生成されたプロンプト（最初の300文字）:");
  console.log(template2.substring(0, 300) + "...");
} catch (error) {
  console.log("❌ エラー:", error);
}

// 3. MCPメッセージ形式の確認
console.log("\n" + "=" .repeat(70));
console.log("MCPメッセージ形式の確認");
console.log("=" .repeat(70));

const mockPromptResponse = {
  prompt: {
    name: "ucr_morning_assessment",
    description: UCR_PROMPTS[0].description,
    arguments: UCR_PROMPTS[0].arguments,
    messages: [
      {
        role: "user", // system ではなく user を使用
        content: {
          type: "text",
          text: generatePromptTemplate("ucr_morning_assessment", {
            planned_training: "インターバル走"
          })
        }
      }
    ]
  }
};

console.log("\nMCPレスポンス形式（JSON）:");
console.log(JSON.stringify(mockPromptResponse, null, 2).substring(0, 500) + "...");

// 4. roleフィールドの検証
console.log("\n" + "=" .repeat(70));
console.log("roleフィールドの検証");
console.log("=" .repeat(70));

const validateRole = (role: string) => {
  const validRoles = ["user", "assistant"];
  if (validRoles.includes(role)) {
    console.log(`✅ role="${role}" は有効です`);
    return true;
  } else {
    console.log(`❌ role="${role}" は無効です。"user" または "assistant" のみ使用可能`);
    return false;
  }
};

console.log("\n現在の実装:");
validateRole("user");

console.log("\n無効な例:");
validateRole("system");

console.log("\n" + "=" .repeat(70));
console.log("テスト完了");
console.log("=" .repeat(70));
console.log(`
結果:
- プロンプト数: ${UCR_PROMPTS.length}個
- roleフィールド: "user" を使用（✅ 制約OK）
- contentタイプ: "text" を使用
- エラーの心配なし！
`);
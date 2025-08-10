// 直接API呼び出しをテスト
const athleteId = "i72555";
const apiKey = "196l99q9husoccp97i5djt9pt";

const date = "2025-08-07";
const url = `https://intervals.icu/api/v1/athlete/${athleteId}/wellness?newest=${date}&oldest=${date}`;

// Basic認証ヘッダー作成
const auth = btoa(`API_KEY:${apiKey}`);

console.log("Testing direct API call...");
console.log("URL:", url);
console.log("Auth header:", `Basic ${auth}`);

try {
  const response = await fetch(url, {
    headers: {
      "Authorization": `Basic ${auth}`,
      "Accept": "application/json"
    }
  });

  console.log("Response status:", response.status);
  
  if (response.ok) {
    const data = await response.json();
    console.log("Data received:", JSON.stringify(data, null, 2));
  } else {
    const error = await response.text();
    console.log("Error response:", error);
  }
} catch (error) {
  console.error("Request failed:", error);
}

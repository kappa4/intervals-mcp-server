#!/usr/bin/env -S deno run --allow-net --allow-env --unstable-kv
/**
 * Register Claude Web Client Script
 * Run this once to register the clients that Claude Web expects
 */

// Add parent directory to import path
import { ClientStorage } from "../oauth/storage/clients.ts";
import type { OAuthClient } from "../oauth/types.ts";

const clientStorage = new ClientStorage();

// Claude Web's expected clients (multiple IDs due to rotation)
const claudeClients: OAuthClient[] = [
  {
    client_id: "vxOwrOKlZZO40tGXzqeR0A",  // Legacy ID
    client_secret: undefined, // Public client
    client_name: "Claude (Legacy)",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    is_public_client: true,
    created_at: Date.now(),
  },
  {
    client_id: "FTv44phrjVgJyzvJrU7dGg",  // Current ID (as of 2025-08-03)
    client_secret: undefined, // Public client
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    is_public_client: true,
    created_at: Date.now(),
  },
];

console.log("Registering Claude Web clients...\n");

let successCount = 0;
let skipCount = 0;

for (const client of claudeClients) {
  console.log(`Registering ${client.client_name}...`);
  console.log("Client ID:", client.client_id);
  
  try {
    // Check if already exists
    const existing = await clientStorage.get(client.client_id);
    if (existing) {
      console.log("⏭️  Client already registered, skipping");
      skipCount++;
    } else {
      await clientStorage.store(client);
      console.log("✅ Client registered successfully!");
      successCount++;
    }
  } catch (error) {
    console.error("❌ Client registration failed:", error);
  }
  console.log();
}

console.log(`\nSummary:`);
console.log(`✅ Registered: ${successCount}`);
console.log(`⏭️  Skipped: ${skipCount}`);
console.log(`\nYou can now use Claude Web with this MCP server.`);

// Close Deno KV connection
Deno.exit(0);
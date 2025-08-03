#!/usr/bin/env -S deno run --allow-net --allow-env
/**
 * Check Deno KV for registered OAuth clients
 * This utility helps debug OAuth client registration issues
 */

import { ClientStorage } from "../oauth/storage/clients.ts";

console.log("=== Checking Deno KV for OAuth Clients ===\n");

const clientStorage = new ClientStorage();

try {
  // List all registered clients
  const clients = await clientStorage.list();
  
  console.log(`Found ${clients.length} registered client(s):\n`);
  
  for (const client of clients) {
    console.log(`Client: ${client.client_name}`);
    console.log(`  - ID: ${client.client_id}`);
    console.log(`  - Secret: ${client.client_secret ? "[REDACTED]" : "undefined (public client)"}`);
    console.log(`  - Redirect URIs: ${client.redirect_uris.join(", ")}`);
    console.log(`  - Grant Types: ${client.grant_types.join(", ")}`);
    console.log(`  - Auth Method: ${client.token_endpoint_auth_method}`);
    console.log(`  - Public Client: ${client.is_public_client}`);
    console.log(`  - Created: ${new Date(client.created_at).toISOString()}`);
    console.log();
  }
  
  // Check specifically for Claude Web clients
  const claudeClientIds = [
    "vxOwrOKlZZO40tGXzqeR0A",  // Legacy
    "FTv44phrjVgJyzvJrU7dGg"   // Current
  ];
  
  console.log("Checking for specific Claude client IDs:");
  for (const clientId of claudeClientIds) {
    const client = await clientStorage.get(clientId);
    if (client) {
      console.log(`✅ ${clientId} is registered (${client.client_name})`);
    } else {
      console.log(`❌ ${clientId} NOT found`);
    }
  }
  
} catch (error) {
  console.error("Error checking KV:", error);
}

// Note: In local dev, this creates a local KV database
// In Deno Deploy, this connects to the production KV service
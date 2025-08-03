/**
 * Temporary endpoint to check KV storage in production
 * Add this to main.ts temporarily to debug
 */

import { ClientStorage } from "./oauth/storage/clients.ts";

export async function handleKVCheck(): Promise<Response> {
  const clientStorage = new ClientStorage();
  
  try {
    const clients = await clientStorage.list();
    const claudeClientId = "vxOwrOKlZZO40tGXzqeR0A";
    const claudeClient = await clientStorage.get(claudeClientId);
    
    // Test client validation
    const validationResult = await clientStorage.validateCredentials(claudeClientId);
    
    return new Response(
      JSON.stringify({
        totalClients: clients.length,
        clients: clients.map(c => ({
          id: c.client_id,
          name: c.client_name,
          created: new Date(c.created_at).toISOString(),
          isPublic: c.is_public_client,
          authMethod: c.token_endpoint_auth_method
        })),
        claudeClientRegistered: !!claudeClient,
        claudeClient: claudeClient ? {
          id: claudeClient.client_id,
          name: claudeClient.client_name,
          redirectUris: claudeClient.redirect_uris,
          isPublic: claudeClient.is_public_client,
          authMethod: claudeClient.token_endpoint_auth_method
        } : null,
        validationPassed: !!validationResult
      }, null, 2),
      { 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: "Failed to check KV",
        message: error.message 
      }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}
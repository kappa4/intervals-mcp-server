/**
 * OAuth 2.1 Authorization Server for Intervals MCP Server
 * Based on Memory MCP successful implementation
 */

import { ClientStorage } from "./storage/clients.ts";
import { CodeStorage } from "./storage/codes.ts";
import { TokenStorage } from "./storage/tokens.ts";
import { createDiscoveryHandler, createProtectedResourceHandler } from "./handlers/discovery.ts";
import { createRegistrationHandler } from "./handlers/register.ts";
import { createAuthorizationHandler } from "./handlers/authorize.ts";
import { createTokenHandler } from "./handlers/token.ts";
import { createAuthMiddleware, type AuthContext } from "./middleware.ts";
import { log, info } from "../logger.ts";

export class OAuthServer {
  private clientStorage: ClientStorage;
  private codeStorage: CodeStorage;
  private tokenStorage: TokenStorage;
  private origin: string;

  // Handlers
  public handleDiscovery: (req: Request) => Promise<Response>;
  public handleProtectedResource: (req: Request) => Promise<Response>;
  public handleRegistration: (req: Request) => Promise<Response>;
  public handleAuthorization: (req: Request) => Promise<Response>;
  public handleToken: (req: Request) => Promise<Response>;
  public authenticate: (req: Request) => Promise<AuthContext>;

  constructor(origin: string) {
    this.origin = origin;
    
    // Initialize storage (in-memory for demo/single instance)
    this.clientStorage = new ClientStorage();
    this.codeStorage = new CodeStorage();
    this.tokenStorage = new TokenStorage();

    // Initialize handlers
    this.handleDiscovery = createDiscoveryHandler(origin);
    this.handleProtectedResource = createProtectedResourceHandler(origin);
    this.handleRegistration = createRegistrationHandler(this.clientStorage);
    this.handleAuthorization = createAuthorizationHandler(
      this.clientStorage,
      this.codeStorage
    );
    this.handleToken = createTokenHandler(
      this.clientStorage,
      this.codeStorage,
      this.tokenStorage
    );
    this.authenticate = createAuthMiddleware(this.tokenStorage);

    info(`[OAuth] OAuth 2.1 server initialized with origin: ${origin}`);
  }

  /**
   * Initialize the OAuth server and register Claude Web client
   */
  async initialize(): Promise<void> {
    // Register Claude Web client on startup
    await this.registerClaudeWebClient();
    info("[OAuth] OAuth server initialization complete");
  }

  /**
   * Route OAuth requests to appropriate handlers
   */
  async handleRequest(req: Request, path: string): Promise<Response | null> {
    log("DEBUG", `[OAuth] Handling request: ${req.method} ${path}`);

    // OAuth discovery endpoints
    if (path === "/.well-known/oauth-authorization-server" || 
        path === "/.well-known/oauth-authorization-server/mcp") {
      return this.handleDiscovery(req);
    }
    
    if (path === "/.well-known/oauth-protected-resource" || 
        path === "/.well-known/oauth-protected-resource/mcp") {
      return this.handleProtectedResource(req);
    }
    
    // OAuth endpoints
    if (path === "/oauth/register") {
      return this.handleRegistration(req);
    }
    
    if (path === "/oauth/authorize") {
      return this.handleAuthorization(req);
    }
    
    if (path === "/oauth/token") {
      return this.handleToken(req);
    }

    // Not an OAuth endpoint
    return null;
  }

  /**
   * Clean up expired tokens and codes (optional maintenance)
   */
  async cleanup(): Promise<void> {
    await Promise.all([
      this.codeStorage.cleanupExpired(),
      this.tokenStorage.cleanupExpired(),
    ]);
    log("INFO", "[OAuth] Cleanup completed - expired tokens and codes removed");
  }

  /**
   * Get storage instances for debugging/monitoring
   */
  getStorage() {
    return {
      clients: this.clientStorage,
      codes: this.codeStorage,
      tokens: this.tokenStorage,
    };
  }
  
  /**
   * Register Claude Web's expected clients on startup
   * Claude.ai uses fixed client_ids instead of Dynamic Client Registration
   */
  private async registerClaudeWebClient() {
    // Claude.ai uses different client_ids - register all known ones
    const claudeClients = [
      {
        client_id: "vxOwrOKlZZO40tGXzqeR0A",  // Previously known ID
        client_secret: undefined,
        client_name: "Claude (Legacy)",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        is_public_client: true,
        created_at: Date.now(),
      },
      {
        client_id: "FTv44phrjVgJyzvJrU7dGg",  // Currently used ID
        client_secret: undefined,
        client_name: "Claude",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        is_public_client: true,
        created_at: Date.now(),
      }
    ];
    
    for (const claudeClient of claudeClients) {
      try {
        // Check if client already exists
        const existing = await this.clientStorage.get(claudeClient.client_id);
        if (!existing) {
          await this.clientStorage.store(claudeClient);
          info("[OAuth] Claude Web client registered on startup:", claudeClient.client_id);
        } else {
          log("DEBUG", "[OAuth] Claude Web client already registered:", claudeClient.client_id);
        }
      } catch (error) {
        log("ERROR", "[OAuth] Error registering Claude Web client:", error);
      }
    }
  }
}
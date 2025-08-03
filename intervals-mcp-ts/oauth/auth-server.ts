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
   * Route OAuth requests to appropriate handlers
   */
  async handleRequest(req: Request, path: string): Promise<Response | null> {
    log(`[OAuth] Handling request: ${req.method} ${path}`);

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
    log("[OAuth] Cleanup completed - expired tokens and codes removed");
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
}
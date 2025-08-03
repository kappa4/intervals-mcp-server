#!/bin/bash

# Fix log calls in OAuth files
echo "Fixing log calls in OAuth files..."

# auth-server.ts
sed -i '' 's/log("\[OAuth\] Error registering Claude Web client:", error);/log("ERROR", "[OAuth] Error registering Claude Web client:", error);/g' oauth/auth-server.ts

# authorize.ts
sed -i '' 's/log("\[OAuth\] Authorization request:", JSON/log("DEBUG", "[OAuth] Authorization request:", JSON/g' oauth/handlers/authorize.ts
sed -i '' 's/log("\[OAuth\] Registered clients:", allClients/log("DEBUG", "[OAuth] Registered clients:", allClients/g' oauth/handlers/authorize.ts

# discovery.ts
sed -i '' 's/log("\[OAuth\] Returning discovery metadata:", JSON/log("DEBUG", "[OAuth] Returning discovery metadata:", JSON/g' oauth/handlers/discovery.ts

# register.ts
sed -i '' 's/log("\[OAuth\] Method:", req.method);/log("DEBUG", "[OAuth] Method:", req.method);/g' oauth/handlers/register.ts
sed -i '' 's/log("\[OAuth\] Content-Type:", req.headers/log("DEBUG", "[OAuth] Content-Type:", req.headers/g' oauth/handlers/register.ts
sed -i '' 's/log("\[OAuth\] Responding to OPTIONS preflight");/log("DEBUG", "[OAuth] Responding to OPTIONS preflight");/g' oauth/handlers/register.ts

# token.ts
sed -i '' 's/log("\[OAuth\] Token request:", JSON/log("DEBUG", "[OAuth] Token request:", JSON/g' oauth/handlers/token.ts

# middleware.ts
sed -i '' 's/log("\[Auth\] Authorization header:", authHeader/log("DEBUG", "[Auth] Authorization header:", authHeader/g' oauth/middleware.ts
sed -i '' 's/log("\[Auth\] No Bearer token found");/log("DEBUG", "[Auth] No Bearer token found");/g' oauth/middleware.ts
sed -i '' 's/log("\[Auth\] Extracted token (first 20 chars):", token/log("DEBUG", "[Auth] Extracted token (first 20 chars):", token/g' oauth/middleware.ts
sed -i '' 's/log("\[Auth\] Token lookup result:", accessToken/log("DEBUG", "[Auth] Token lookup result:", accessToken/g' oauth/middleware.ts

echo "Done!"
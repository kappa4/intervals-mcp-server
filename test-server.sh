#!/bin/bash

# Kill any existing server
pkill -f "deno run.*main.ts" 2>/dev/null

# Set environment variables
export ATHLETE_ID=i72555
export API_KEY=196l99q9husoccp97i5djt9pt
export JWT_SECRET_KEY=test_jwt_secret_key_minimum_32_chars
export ORIGIN=http://localhost:8001
export PORT=8001

# Start server in background with proper process management
echo "Starting server on port 8001..."
deno run --allow-net --allow-env --allow-read main.ts > server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (max 3 seconds)
for i in {1..6}; do
  if curl -s http://localhost:8001/health > /dev/null 2>&1; then
    echo "Server is ready!"
    echo "Server PID: $SERVER_PID"
    echo "To stop: kill $SERVER_PID"
    exit 0
  fi
  echo "Waiting for server to start... ($i/6)"
  sleep 0.5
done

echo "Server failed to start. Check server.log for details"
tail -20 server.log
exit 1
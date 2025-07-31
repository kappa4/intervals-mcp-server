# Intervals.icu MCP Server
[![smithery badge](https://smithery.ai/badge/@mvilanova/intervals-mcp-server)](https://smithery.ai/server/@mvilanova/intervals-mcp-server)

Model Context Protocol (MCP) server for connecting Claude with the Intervals.icu API. It provides tools for authentication and data retrieval for activities, events, and wellness data.

If you find the Model Context Protocol (MCP) server useful, please consider supporting its continued development with a donation.

## Requirements

- Python 3.12 or higher
- [Model Context Protocol (MCP) Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- httpx
- python-dotenv

## Setup

### 1. Install uv (recommended)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Clone this repository

```bash
git clone https://github.com/mvilanova/intervals-mcp-server.git
cd intervals-mcp-server
```

### 3. Create and activate a virtual environment

```bash
# Create virtual environment with Python 3.12
uv venv --python 3.12

# Activate virtual environment
# On macOS/Linux:
source .venv/bin/activate
# On Windows:
.venv\Scripts\activate
```

### 4. Sync project dependencies

```bash
uv sync
```

### 5. Set up environment variables

Make a copy of `.env.example` and name it `.env` by running the following command:

```bash
cp .env.example .env
```

Then edit the `.env` file and set your Intervals.icu athlete id and API key:

```
API_KEY=your_intervals_api_key_here
ATHLETE_ID=your_athlete_id_here
```

#### Getting your Intervals.icu API Key

1. Log in to your Intervals.icu account
2. Go to Settings > API
3. Generate a new API key

#### Finding your Athlete ID

Your athlete ID is typically visible in the URL when you're logged into Intervals.icu. It looks like:
- `https://intervals.icu/athlete/i12345/...` where `i12345` is your athlete ID

## Updating

This project is actively developed, with new features and fixes added regularly. To stay up to date, follow these steps:

### 1. Pull the latest changes from `main`

> ⚠️ Make sure you don’t have uncommitted changes before running this command.

```bash
git checkout main && git pull
```

### 2. Update Python dependencies

Activate your virtual environment and sync dependencies:

```bash
source .venv/bin/activate
uv sync
```

### Troubleshooting

If Claude Desktop fails due to configuration changes, follow these steps:

1. Delete the existing entry in claude_desktop_config.json.
2. Reconfigure Claude Desktop from the intervals_mcp_server directory:

```bash
mcp install src/intervals_mcp_server/server.py --name "Intervals.icu" --with-editable . --env-file .env
```

## Usage

### Running as a Remote MCP Server

The server now supports running as a remote HTTP/SSE server, which allows it to be deployed to cloud platforms and accessed from anywhere.

#### 1. Running locally as HTTP server

```bash
# Using uvicorn directly
uvicorn intervals_mcp_server.server:app --host 0.0.0.0 --port 8000

# Or using Python
python src/intervals_mcp_server/server.py
```

The server will be available at `http://localhost:8000`. You can check the health status at `http://localhost:8000/health`.

#### 2. Deploying to cloud platforms

This server can be deployed to various cloud platforms:

- **Railway**: Use the included `Procfile`
- **Heroku**: Use the included `Procfile`
- **Cloudflare Workers**: Adapt the code as needed
- **Any platform supporting Python/FastAPI**

Make sure to set the required environment variables:
- `API_KEY`: Your Intervals.icu API key
- `ATHLETE_ID`: Your athlete ID
- `PORT`: The port to bind to (often set automatically by the platform)

#### 3. Connecting from Claude Desktop

To connect to a remote MCP server from Claude Desktop, update your configuration:

```json
{
  "mcpServers": {
    "intervals-remote": {
      "url": "https://your-server-url.com/sse",
      "transport": "sse"
    }
  }
}
```

### Running as a Local MCP Server

#### Option 1: Using STDIO mode with Claude Desktop

##### 1. Configure Claude Desktop

To use this server locally with Claude Desktop, you need to add it to your Claude Desktop configuration.

1. Manually configure Claude Desktop by editing your `claude_desktop_config.json` file:

   - On macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - On Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the following configuration to the file:

```json
{
  "mcpServers": {
    "Intervals.icu": {
      "command": "/Users/<USERNAME>/.local/bin/uv",
      "args": [
        "run",
        "--directory",
        "/path/to/intervals-mcp-server",
        "python",
        "-m",
        "intervals_mcp_server.server",
        "--stdio"
      ],
      "env": {
        "INTERVALS_API_BASE_URL": "https://intervals.icu/api/v1",
        "ATHLETE_ID": "<YOUR_ATHLETE_ID>",
        "API_KEY": "<YOUR_API_KEY>",
        "LOG_LEVEL": "INFO",
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

Where:
- `/Users/<USERNAME>/.local/bin/uv` should be replaced with the actual path to your `uv` installation (run `which uv` to find it)
- `/path/to/intervals-mcp-server` should be replaced with the actual path to your cloned repository

Note: The `--stdio` flag and `MCP_MODE: "stdio"` are essential for running in STDIO mode with Claude Desktop.

If you see errors like `spawn uv ENOENT`, make sure to use the full path to `uv` (found with `which uv`).

3. Restart Claude Desktop.

##### 2. Use the MCP server with Claude

Once the server is running and Claude Desktop is configured, you can use the following tools to ask questions about your past and future activities, events, and wellness data.

- `get_activities`: Retrieve a list of activities
- `get_activity_details`: Get detailed information for a specific activity
- `get_activity_intervals`: Get detailed interval data for a specific activity
- `get_wellness_data`: Fetch wellness data
- `get_events`: Retrieve upcoming events (workouts, races, etc.)
- `get_event_by_id`: Get detailed information for a specific event

#### Option 2: Running locally as HTTP server

You can also run the server locally as an HTTP/SSE server and connect to it from Claude Desktop or other MCP clients:

1. Start the server:
```bash
# Using Python directly (runs on port 8000 by default)
python src/intervals_mcp_server/server.py

# Or using uvicorn with custom port
uvicorn intervals_mcp_server.server:app --host 0.0.0.0 --port 8000
```

2. Configure Claude Desktop to connect to the local HTTP server:
```json
{
  "mcpServers": {
    "intervals-local-http": {
      "url": "http://localhost:8000/sse",
      "transport": "sse"
    }
  }
}
```

3. The server will automatically load environment variables from your `.env` file

## Development and testing

Install development dependencies and run the test suite with:

```bash
uv sync --all-extras
pytest -v tests
```

### Running the server locally

To start the server manually (useful when developing or testing), run:

```bash
# Run as HTTP/SSE server (default)
python src/intervals_mcp_server/server.py

# Run as stdio server (legacy MCP mode)
python src/intervals_mcp_server/server.py --stdio

# Or using MCP CLI for stdio mode
mcp run src/intervals_mcp_server/server.py
```

## License

The GNU General Public License v3.0

## Featured

### Glama.ai

<a href="https://glama.ai/mcp/servers/@mvilanova/intervals-mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@mvilanova/intervals-mcp-server/badge" alt="Intervals.icu Server MCP server" />
</a>

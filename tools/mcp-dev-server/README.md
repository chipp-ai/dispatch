# MCP Dev Server

Model Context Protocol server for managing chipp-deno development servers and searching logs.

## Tools

| Tool | Description |
|------|-------------|
| `dev_server_restart` | Restart dev servers (Deno API, Svelte SPA, Cloudflare Worker) |
| `dev_server_stop` | Stop all development server processes |
| `dev_server_status` | Check running servers and port usage |
| `dev_logs_search` | Search logs for a pattern with context |
| `dev_logs_errors` | Find recent errors in logs |
| `dev_logs_tail` | Get last N lines from most recent log |
| `dev_logs_list` | List available log files |

## Setup

### 1. Install dependencies

```bash
cd tools/mcp-dev-server
npm install
```

### 2. Configure Claude Code

Add to your `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "mcpServers": {
    "dev-server": {
      "command": "node",
      "args": ["tools/mcp-dev-server/index.js"],
      "env": {
        "REPO_ROOT": "/path/to/chipp-deno"
      }
    }
  }
}
```

## Usage

Once configured, Claude can use natural language to manage dev servers:

- "Restart the dev server"
- "Show me recent errors in the logs"
- "What's running on port 8000?"
- "Search logs for 'database connection'"
- "Tail the latest log file"

## Ports

| Port | Service |
|------|---------|
| 8000 | Deno API server |
| 5173 | Vite dev server (Svelte SPA) |
| 8788 | Cloudflare Worker |

## Log Files

Logs are stored in `.scratch/logs/` with the naming convention `chipp-deno-YYYYMMDD-HHMMSS.log`.

A symlink `chipp-deno-latest.log` always points to the most recent log file.

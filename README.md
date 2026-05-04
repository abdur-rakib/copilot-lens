# copilot-lens 🔍

Local dashboard for visualizing **GitHub Copilot CLI** usage statistics.
Zero-install, privacy-first — your data never leaves your machine.

Inspired by [claude-lens](https://github.com/foyzulkarim/claude-lens).

## Quick Start

### ⚡ Zero-install (recommended)

```bash
npx github:abdur-rakib/copilot-lens
```

Open **http://localhost:3456** in your browser. That's it — no cloning, no `npm install`.

### 🛠 Manual install

```bash
git clone https://github.com/abdur-rakib/copilot-lens.git
cd copilot-lens && npm install && npm start
```

Open **http://localhost:3456** in your browser.

### ⚙️ Custom port or Copilot directory

```bash
PORT=4000 npx github:abdur-rakib/copilot-lens
# or
COPILOT_DIR=/custom/path npx github:abdur-rakib/copilot-lens
```

## What You'll See

| Section | Description |
|---------|-------------|
| **Today / All-Time** | Sessions, messages, tool calls, premium requests, est. cost |
| **Cache Analytics** | Hit rate, cost with/without cache, total savings |
| **Daily Breakdown** | Per-day table of all metrics |
| **Tool Analytics** | Bar chart of tool usage with drill-down details |
| **Projects** | Activity grouped by repository |
| **Command History** | Recent Copilot CLI commands |

## Configuration

Copy `.env.example` to `.env` to customise:

| Variable | Default | Description |
|----------|---------|-------------|
| `COPILOT_DIR` | `~/.copilot` | Path to Copilot state directory |
| `PORT` | `3456` | Server port |
| `RATE_INPUT` | `5.0` | $/1M input tokens |
| `RATE_OUTPUT` | `25.0` | $/1M output tokens |
| `RATE_CACHE_READ` | `0.5` | $/1M cache-read tokens |
| `RATE_CACHE_CREATE` | `6.25` | $/1M cache-create tokens |

Default rates reflect **AWS Bedrock cross-region (ap-southeast-2)** pricing.

## How It Works

copilot-lens reads data from `~/.copilot/session-state/`:

- **`workspace.yaml`** — Session metadata (project, branch, timestamps)
- **`events.jsonl`** — Event stream with token counts, tool calls, and `session.shutdown` analytics
- **`command-history-state.json`** — CLI command history

All processing happens locally. No data is sent anywhere.

## Architecture

Two files:
- `server.js` — Express API server (7 endpoints)
- `index.html` — Single-page dashboard (HTML + CSS + JS)

Dependencies: `express`, `dotenv` — that's it.

## API Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/stats` | Aggregate statistics |
| `GET /api/sessions` | Session list with metadata |
| `GET /api/history` | Command history |
| `GET /api/daily-costs` | Per-day breakdown with token/cost data |
| `GET /api/projects` | Project-level aggregation |
| `GET /api/tool-calls` | Tool usage counts |
| `GET /api/tool-details/:toolName` | Detailed calls for a specific tool |

## License

MIT

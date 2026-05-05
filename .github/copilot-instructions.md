# Copilot Instructions

## Commands

```bash
npm start          # Start the Express server (port 3456 by default)
npm run dev        # Start with nodemon (auto-restart on file changes)
```

No build step. No test suite. No linter configured.

## Architecture

This is a **two-file application** with a supporting data layer:

- **`server.js`** — Express API server with 9 endpoints. Reads `~/.copilot/session-state/` directly from the filesystem on every request (no caching, no database). Uses streaming `readline` for parsing `events.jsonl` files.
- **`index.html`** — Single-page dashboard. Vanilla HTML/CSS/JS + Chart.js (loaded via CDN). No bundler or framework.
- **`sources/cli.js`** — Reads Copilot CLI sessions from `~/.copilot/session-state/<uuid>/`. Each session dir contains `workspace.yaml` (metadata) and `events.jsonl` (token/tool events). Uses sync `fs.readFileSync` (not streaming).
- **`sources/vscode.js`** — Reads VS Code chat sessions from `~/Library/Application Support/Code/User/workspaceStorage/` (path varies by OS). Parses `chatSessions/*.json` files.
- **`sources/mapper.js`** — Defines the `UnifiedSession` typedef and exports `mapCLI()` and `mapVSCode()` to normalize both sources into the same schema. **This is the canonical data contract** — all consumers depend on this shape.

## Key Conventions

### Data flow
Raw files → `sources/cli.js` or `sources/vscode.js` → `mapCLI()`/`mapVSCode()` in `mapper.js` → `UnifiedSession` objects → consumed by `server.js` endpoints or returned directly as JSON.

### Event types parsed from `events.jsonl`
- `session.shutdown` — aggregated token counts, cost, premium requests, code change stats
- `user.message` — counted to get `messageCount`
- `tool.execution_start` — counted to get `toolCallCount`; arguments captured for tool analytics
- `tool.execution_complete` — success/failure status

### Cost calculation (two separate implementations)
`mapper.js` has a hardcoded `calculateCost()` function (fallback when `costUsd` is null). `server.js` uses the `RATES` object built from env vars (`RATE_INPUT`, `RATE_OUTPUT`, `RATE_CACHE_READ`, `RATE_CACHE_CREATE`). When adding new cost logic, prefer the env-driven approach in `server.js`.

### YAML parsing
`workspace.yaml` is parsed with a simple custom regex — not a YAML library. The format is strictly `key: value` per line.

### Environment config
Copy `.env.example` to `.env`. Key vars: `COPILOT_DIR` (default `~/.copilot`), `PORT` (default `3456`), and four `RATE_*` vars for token pricing (defaults reflect AWS Bedrock cross-region ap-southeast-2 pricing).

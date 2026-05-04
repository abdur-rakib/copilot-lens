# Copilot-Lens Design Spec

> A local web dashboard for visualizing GitHub Copilot CLI usage statistics, mirroring [claude-lens](https://github.com/foyzulkarim/claude-lens) architecture.

**Date:** 2026-05-04
**Status:** Approved

---

## 1. Overview

Copilot-lens is a zero-dependency local web dashboard that reads data from `~/.copilot/session-state/` and presents token costs, cache performance, tool call analytics, project activity, and prompt history in a dark-themed web UI. The entire project is 2 source files (`server.js` + `index.html`), 2 runtime dependencies (`express` + `dotenv`), and runs on `localhost:3456`.

### Design Principles

- **Minimal mirror of claude-lens** — same 2-file architecture, same zero-install `npx` approach
- **No external API calls** — passive reader of local filesystem data only
- **No build step** — vanilla HTML/CSS/JS frontend
- **Zero new dependencies** — express + dotenv only (no js-yaml, no better-sqlite3)

---

## 2. Architecture

### Files

```
copilot-lens/
├── .env.example          # Environment variable template
├── .gitignore
├── README.md
├── package.json          # v1.0.0, bin entry for npx
├── server.js             # Entire backend (Express, ~350 lines)
└── index.html            # Entire frontend (vanilla HTML/CSS/JS, ~800 lines)
```

### Data Sources

| Source File | Location | Format | Purpose |
|---|---|---|---|
| `workspace.yaml` | `session-state/*/workspace.yaml` | YAML (flat key-value) | Session metadata: id, name, cwd, branch, timestamps |
| `events.jsonl` | `session-state/*/events.jsonl` | NDJSON | All session events: lifecycle, tool calls, token usage |
| `command-history-state.json` | `~/.copilot/command-history-state.json` | JSON array of strings | Prompt/command history |

### Data Flow

```
~/.copilot/
  ├── command-history-state.json  → GET /api/history
  └── session-state/*/
      ├── workspace.yaml          → GET /api/sessions, GET /api/projects
      └── events.jsonl            → GET /api/stats
                                  → GET /api/daily-costs
                                  → GET /api/tool-calls
                                  → GET /api/tool-details/:name
```

Frontend loads 5 endpoints in parallel via `Promise.all`, then renders 6 dashboard sections.

---

## 3. Backend: server.js

### Startup & Configuration

```javascript
const COPILOT_DIR = process.env.COPILOT_DIR || path.join(os.homedir(), ".copilot");
const PORT = parseInt(process.env.PORT || "3456", 10);

const RATES = {
  input:       parseFloat(process.env.RATE_INPUT       ?? "5.0")  / 1e6,
  output:      parseFloat(process.env.RATE_OUTPUT      ?? "25.0") / 1e6,
  cacheRead:   parseFloat(process.env.RATE_CACHE_READ  ?? "0.5")  / 1e6,
  cacheCreate: parseFloat(process.env.RATE_CACHE_CREATE ?? "6.25") / 1e6,
};
```

- Validate `COPILOT_DIR` exists at startup; warn (don't exit) if `session-state/` is empty
- Port configurable via `PORT` env var (unlike claude-lens's hardcoded 3456)

### YAML Parser Helper (no dependency)

```javascript
function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}
```

Handles the flat key-value structure of `workspace.yaml` without requiring `js-yaml`.

### JSONL Parsing Strategy

- Use Node.js `readline` with `fs.createReadStream` for streaming line-by-line parsing (same as claude-lens)
- Filter for specific `type` values per endpoint
- Unlike claude-lens: **log stream errors** instead of silently swallowing them
- Malformed lines: skip with `console.warn`, don't crash

### API Endpoints

#### `GET /api/stats`

Scans all `events.jsonl` files for `session.shutdown` events. Aggregates:

```json
{
  "totalSessions": 17,
  "totalPremiumRequests": 34.3,
  "totalApiDurationMs": 1842000,
  "totalInputTokens": 12500000,
  "totalOutputTokens": 135000,
  "totalCacheReadTokens": 10200000,
  "totalCacheWriteTokens": 890000,
  "modelBreakdown": {
    "claude-opus-4.6": { "requests": 52, "cost": 9 }
  }
}
```

#### `GET /api/daily-costs`

Groups `session.shutdown` data by `timestamp.slice(0, 10)`:

```json
{
  "days": [{
    "date": "2026-05-01",
    "sessions": 3, "messages": 45, "toolCalls": 120,
    "input": 296000, "output": 4300, "cacheRead": 227800, "cacheWrite": 67500,
    "premiumRequests": 3.0,
    "estimatedCost": 1.85,
    "models": { "claude-opus-4.6": 3 }
  }],
  "totals": { "..." },
  "rates": { "input": 5.0, "output": 25.0, "cacheRead": 0.5, "cacheCreate": 6.25 }
}
```

Message counts and tool call counts are derived by scanning `user.message` and `tool.execution_start` events in each session's `events.jsonl`, grouped to the same day as the session.

#### `GET /api/sessions`

Reads all `workspace.yaml` files, enriched with shutdown event data:

```json
[{
  "id": "uuid",
  "name": "Research Express Gateway",
  "cwd": "/path/to/project",
  "branch": "feat/subscription",
  "createdAt": "2026-05-01T00:50:20Z",
  "updatedAt": "2026-05-01T02:30:00Z",
  "premiumRequests": 10.65,
  "linesAdded": 1081,
  "linesRemoved": 66
}]
```

#### `GET /api/tool-calls`

Aggregates `tool.execution_start` events across all sessions:

```json
{
  "tools": [{ "tool": "bash", "count": 412 }, { "tool": "read", "count": 280 }],
  "byProject": { "sub-connect": { "bash": 120, "read": 88 } }
}
```

Project is derived from the session's `workspace.yaml` `cwd` (last path component).

#### `GET /api/tool-details/:toolName`

Returns individual invocations by joining `tool.execution_start` with `tool.execution_complete` (matched by `toolCallId`):

```json
[{
  "tool": "bash",
  "project": "sub-connect",
  "timestamp": "2026-05-01T01:15:00Z",
  "arguments": { "command": "npm test", "description": "Run test suite" },
  "success": true,
  "model": "gpt-4.1"
}]
```

Sorted newest-first. Tool-specific argument extraction:

| Tool | Fields Extracted |
|---|---|
| `bash` | `command`, `description` |
| `read`, `edit`, `create` | `path` or `file_path` |
| `grep` | `pattern`, `paths`, `glob` |
| `glob` | `pattern`, `paths` |
| `task` | `description`, `agent_type` |
| *(other)* | `arguments` truncated to 200 chars |

#### `GET /api/projects`

Groups sessions by `workspace.yaml` `cwd`:

```json
[{
  "name": "sub-connect",
  "fullPath": "/Users/bs01080/Desktop/GP/projects/SOL/sub-connect",
  "sessions": 3,
  "premiumRequests": 14.65,
  "firstSeen": "2026-05-02T01:54:52Z",
  "lastSeen": "2026-05-04T11:31:00Z"
}]
```

Sorted by session count descending.

#### `GET /api/history`

Reads `command-history-state.json` (flat string array):

```json
[{ "display": "research express gateway stack", "index": 0 }]
```

Simpler than claude-lens's history — no timestamps, session IDs, or project associations.

---

## 4. Frontend: index.html

### Design System

- **Theme**: GitHub dark palette (`#0d1117` bg, `#161b22` surface, `#c9d1d9` text, `#30363d` borders)
- **Font**: SF Mono → Cascadia Code → Fira Code (system monospace stack)
- **Layout**: CSS Grid
- **Charts**: Pure CSS width-based horizontal bar charts (no charting library)
- **No framework**: Vanilla HTML/CSS/JS, single `<style>` + `<script>` block

### Dashboard Sections (top to bottom)

#### 1. Summary Panel — Today vs. All-Time

Two side-by-side panels showing:
- Sessions count
- Premium requests (primary cost metric)
- Estimated cost in USD (secondary)
- Cache hit rate %
- Tool calls count
- Top 3 models used (with request counts)
- Cache savings estimate

#### 2. Cache Performance Cards

4 metric cards:
- Cache hit rate (%)
- Cost with cache (est. USD)
- Cost without cache (est. USD)
- Savings (est. USD)

#### 3. Daily Breakdown Table

| Date | Sessions | Messages | Tool Calls | Cache Read | Cache Write | Hit Rate | Premium Req | Est. Cost |
|---|---|---|---|---|---|---|---|---|

Sorted newest-first.

#### 4. Tool Call Analytics

Horizontal CSS bar chart sorted by count descending. Clickable rows expand to show individual invocations via `loadToolDetails(toolName)`:
- Shows up to 200 calls with tool-specific fields
- ✅/❌ success indicator per call (Copilot-specific feature)

#### 5. Project Activity Table

| Project | Sessions | Premium Requests | Last Active |
|---|---|---|---|

Derived from workspace.yaml `cwd` grouping.

#### 6. Prompt History

Simple list from `command-history-state.json`. No tabs or filtering (flat array without project association).

### JavaScript Architecture

```javascript
async function load() {
  const [stats, history, toolData, projects, costData] = await Promise.all([
    fetch('/api/stats').then(r => r.json()),
    fetch('/api/history').then(r => r.json()),
    fetch('/api/tool-calls').then(r => r.json()),
    fetch('/api/projects').then(r => r.json()),
    fetch('/api/daily-costs').then(r => r.json()),
  ]);
  renderSummary(costData, stats);
  renderDailyCosts(costData);
  renderTools(toolData);
  renderProjects(projects);
  renderHistory(history);
}
```

### Export

`exportToolCalls()` generates a `.txt` Blob download of tool call details (same as claude-lens).

---

## 5. Configuration

### `.env.example`

```
COPILOT_DIR=/Users/yourname/.copilot
PORT=3456
RATE_INPUT=5.0
RATE_OUTPUT=25.0
RATE_CACHE_READ=0.5
RATE_CACHE_CREATE=6.25
```

### `package.json`

```json
{
  "name": "copilot-lens",
  "version": "1.0.0",
  "private": true,
  "bin": { "copilot-lens": "server.js" },
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "dotenv": "^17.4.2",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.14"
  }
}
```

### Execution

```bash
# Zero-install
npx github:foyzulkarim/copilot-lens

# Local
git clone https://github.com/foyzulkarim/copilot-lens.git
cd copilot-lens && npm install && node server.js
```

---

## 6. Error Handling

| Scenario | Behavior |
|---|---|
| `COPILOT_DIR` doesn't exist | Hard exit with clear error message |
| `session-state/` empty | Start server, show "No sessions found" in UI |
| Malformed YAML line | Skip line, `console.warn` |
| Malformed JSONL line | Skip line, `console.warn` |
| Stream read error | Log error, resolve with partial data (don't crash) |
| Missing `session.shutdown` event | Session appears in list but with no cost data |
| Endpoint error | `res.status(500).json({ error: err.message })` |

---

## 7. Differences from claude-lens

| Aspect | claude-lens | copilot-lens |
|---|---|---|
| Data directory | `~/.claude` | `~/.copilot` |
| Session metadata | Embedded in JSONL | Separate `workspace.yaml` |
| Primary cost metric | USD (configurable rates) | Premium requests + est. USD |
| Token data source | Every assistant message line | `session.shutdown` aggregate event |
| Tool success tracking | Not available | ✅/❌ from `tool.execution_complete` |
| Port | Hardcoded 3456 | Configurable via `PORT` env |
| Prompt history | Rich (timestamped, per-project) | Simple (flat string array) |
| YAML parsing | N/A | Custom regex helper (no dependency) |
| Error handling | Silent swallowing | Logged warnings |

---

## 8. Out of Scope (v1)

- Reading `session.db` SQLite (conversation content)
- GitHub API integration (billing/quota data)
- Authentication on endpoints
- Response caching / ETags
- Pagination on large result sets
- WebSocket live updates
- Light theme toggle
- Date range filtering

# Copilot-Lens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web dashboard that reads `~/.copilot/session-state/` data and visualizes Copilot CLI usage (costs, cache, tools, projects).

**Architecture:** Two files — `server.js` (Express backend, 7 REST endpoints) + `index.html` (vanilla HTML/CSS/JS dashboard). Reads `workspace.yaml` (flat YAML, custom parser) and `events.jsonl` (streaming readline) from each session directory. No build step, no framework.

**Tech Stack:** Node.js 18+, Express 4.21, dotenv, vanilla HTML/CSS/JS

**Spec:** `docs/superpowers/specs/2026-05-04-copilot-lens-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "copilot-lens",
  "version": "1.0.0",
  "description": "Local dashboard for visualizing GitHub Copilot CLI usage statistics",
  "private": true,
  "bin": {
    "copilot-lens": "server.js"
  },
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

- [ ] **Step 2: Create .env.example**

```
COPILOT_DIR=/Users/yourname/.copilot
PORT=3456
RATE_INPUT=5.0
RATE_OUTPUT=25.0
RATE_CACHE_READ=0.5
RATE_CACHE_CREATE=6.25
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: scaffold project with package.json and config files

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Server — Core Setup & Helpers

**Files:**
- Create: `server.js`

This task creates the server skeleton with startup validation, configuration, the YAML parser helper, JSONL streaming helper, and session directory discovery. No endpoints yet — just the foundation.

- [ ] **Step 1: Create server.js with core setup**

```javascript
#!/usr/bin/env node
require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const app = express();
const PORT = parseInt(process.env.PORT || "3456", 10);
const COPILOT_DIR =
  process.env.COPILOT_DIR || path.join(os.homedir(), ".copilot");
const SESSION_STATE_DIR = path.join(COPILOT_DIR, "session-state");

const RATES = {
  input: parseFloat(process.env.RATE_INPUT ?? "5.0") / 1e6,
  output: parseFloat(process.env.RATE_OUTPUT ?? "25.0") / 1e6,
  cacheRead: parseFloat(process.env.RATE_CACHE_READ ?? "0.5") / 1e6,
  cacheCreate: parseFloat(process.env.RATE_CACHE_CREATE ?? "6.25") / 1e6,
};

if (!fs.existsSync(COPILOT_DIR)) {
  console.error(
    `COPILOT_DIR "${COPILOT_DIR}" does not exist. Set COPILOT_DIR in .env or ensure ~/.copilot exists.`
  );
  process.exit(1);
}

if (!fs.existsSync(SESSION_STATE_DIR)) {
  console.warn(
    `Warning: session-state directory not found at "${SESSION_STATE_DIR}". Dashboard will show no data.`
  );
}

// --- Helpers ---

function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
}

function getSessionDirs() {
  if (!fs.existsSync(SESSION_STATE_DIR)) return [];
  return fs
    .readdirSync(SESSION_STATE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SESSION_STATE_DIR, d.name));
}

function readWorkspace(sessionDir) {
  const yamlPath = path.join(sessionDir, "workspace.yaml");
  if (!fs.existsSync(yamlPath)) return null;
  try {
    const content = fs.readFileSync(yamlPath, "utf8");
    return parseWorkspaceYaml(content);
  } catch (err) {
    console.warn(`Warning: failed to read ${yamlPath}: ${err.message}`);
    return null;
  }
}

function parseEventsJsonl(sessionDir, filterTypes) {
  const eventsPath = path.join(sessionDir, "events.jsonl");
  if (!fs.existsSync(eventsPath)) return Promise.resolve([]);

  return new Promise((resolve) => {
    const results = [];
    const stream = fs.createReadStream(eventsPath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      try {
        const event = JSON.parse(line);
        if (!filterTypes || filterTypes.includes(event.type)) {
          results.push(event);
        }
      } catch {
        // skip malformed lines
      }
    });

    rl.on("close", () => resolve(results));
    rl.on("error", (err) => {
      console.warn(`Warning: error reading ${eventsPath}: ${err.message}`);
      resolve(results);
    });
  });
}

function shortProjectName(cwdPath) {
  if (!cwdPath) return "unknown";
  return cwdPath.split("/").pop() || cwdPath.split("\\").pop() || "unknown";
}

// --- Static file serving ---
app.use(express.static(__dirname));

// --- (endpoints will be added in subsequent tasks) ---

app.listen(PORT, () => {
  console.log(`copilot-lens running at http://localhost:${PORT}`);
  console.log(`Reading data from: ${COPILOT_DIR}`);
});
```

- [ ] **Step 2: Verify server starts**

Run: `node server.js`
Expected: Output `copilot-lens running at http://localhost:3456` and `Reading data from: /Users/.../.copilot`
Stop: Ctrl+C

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add server core with config, helpers, and startup validation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Server — Stats, Sessions, History Endpoints

**Files:**
- Modify: `server.js` (add 3 endpoints before `app.listen`)

- [ ] **Step 1: Add GET /api/stats endpoint**

Insert before the `app.listen` line in `server.js`:

```javascript
// --- API Endpoints ---

app.get("/api/stats", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const totals = {
      totalSessions: 0,
      totalPremiumRequests: 0,
      totalApiDurationMs: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalCacheWriteTokens: 0,
      totalReasoningTokens: 0,
      modelBreakdown: {},
    };

    for (const dir of sessionDirs) {
      const shutdowns = await parseEventsJsonl(dir, ["session.shutdown"]);
      for (const event of shutdowns) {
        const d = event.data || {};
        totals.totalSessions++;
        totals.totalPremiumRequests += d.totalPremiumRequests || 0;
        totals.totalApiDurationMs += d.totalApiDurationMs || 0;

        const metrics = d.modelMetrics || {};
        for (const [model, info] of Object.entries(metrics)) {
          if (!totals.modelBreakdown[model]) {
            totals.modelBreakdown[model] = { requests: 0, cost: 0 };
          }
          totals.modelBreakdown[model].requests +=
            info.requests?.count || 0;
          totals.modelBreakdown[model].cost += info.requests?.cost || 0;

          const usage = info.usage || {};
          totals.totalInputTokens += usage.inputTokens || 0;
          totals.totalOutputTokens += usage.outputTokens || 0;
          totals.totalCacheReadTokens += usage.cacheReadTokens || 0;
          totals.totalCacheWriteTokens += usage.cacheWriteTokens || 0;
          totals.totalReasoningTokens += usage.reasoningTokens || 0;
        }
      }
    }

    totals.totalPremiumRequests =
      Math.round(totals.totalPremiumRequests * 100) / 100;
    res.json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add GET /api/sessions endpoint**

Insert after `/api/stats`:

```javascript
app.get("/api/sessions", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const sessions = [];

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      if (!ws) continue;

      const shutdowns = await parseEventsJsonl(dir, ["session.shutdown"]);
      const shutdown = shutdowns[shutdowns.length - 1]?.data || {};

      sessions.push({
        id: ws.id || path.basename(dir),
        name: ws.name || ws.summary || "Untitled",
        cwd: ws.cwd || "",
        branch: ws.branch || "",
        createdAt: ws.created_at || "",
        updatedAt: ws.updated_at || "",
        premiumRequests: shutdown.totalPremiumRequests || 0,
        linesAdded: shutdown.codeChanges?.linesAdded || 0,
        linesRemoved: shutdown.codeChanges?.linesRemoved || 0,
      });
    }

    sessions.sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
    );
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Add GET /api/history endpoint**

Insert after `/api/sessions`:

```javascript
app.get("/api/history", (req, res) => {
  try {
    const historyPath = path.join(COPILOT_DIR, "command-history-state.json");
    if (!fs.existsSync(historyPath)) {
      return res.json([]);
    }
    const raw = JSON.parse(fs.readFileSync(historyPath, "utf8"));
    const entries = (Array.isArray(raw) ? raw : []).map((item, index) => ({
      display: typeof item === "string" ? item : String(item),
      index,
    }));
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Verify endpoints**

Run: `node server.js &`
Then:
- `curl -s http://localhost:3456/api/stats | head -c 200`
  Expected: JSON with `totalSessions`, `totalPremiumRequests`, etc.
- `curl -s http://localhost:3456/api/sessions | head -c 200`
  Expected: JSON array of session objects with `id`, `name`, `cwd`
- `curl -s http://localhost:3456/api/history | head -c 200`
  Expected: JSON array of `{ display, index }` objects

Stop server, then:

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add /api/stats, /api/sessions, and /api/history endpoints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Server — Daily Costs & Projects Endpoints

**Files:**
- Modify: `server.js` (add 2 endpoints)

- [ ] **Step 1: Add GET /api/daily-costs endpoint**

Insert after `/api/history` in `server.js`:

```javascript
app.get("/api/daily-costs", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const daily = {};

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      const events = await parseEventsJsonl(dir, [
        "session.shutdown",
        "user.message",
        "tool.execution_start",
      ]);

      const sessionDay = ws?.created_at ? ws.created_at.slice(0, 10) : null;

      let messages = 0;
      let toolCalls = 0;

      for (const event of events) {
        if (event.type === "user.message") {
          messages++;
        } else if (event.type === "tool.execution_start") {
          toolCalls++;
        } else if (event.type === "session.shutdown") {
          const d = event.data || {};
          const day = event.timestamp
            ? event.timestamp.slice(0, 10)
            : sessionDay;
          if (!day) continue;

          if (!daily[day]) {
            daily[day] = {
              date: day,
              sessions: 0,
              messages: 0,
              toolCalls: 0,
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              reasoningTokens: 0,
              premiumRequests: 0,
              models: {},
            };
          }

          daily[day].sessions++;
          daily[day].messages += messages;
          daily[day].toolCalls += toolCalls;
          daily[day].premiumRequests += d.totalPremiumRequests || 0;

          const metrics = d.modelMetrics || {};
          for (const [model, info] of Object.entries(metrics)) {
            daily[day].models[model] =
              (daily[day].models[model] || 0) + (info.requests?.count || 0);

            const usage = info.usage || {};
            daily[day].input += usage.inputTokens || 0;
            daily[day].output += usage.outputTokens || 0;
            daily[day].cacheRead += usage.cacheReadTokens || 0;
            daily[day].cacheWrite += usage.cacheWriteTokens || 0;
            daily[day].reasoningTokens += usage.reasoningTokens || 0;
          }
        }
      }
    }

    const days = Object.values(daily)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => {
        const estimatedCost =
          d.input * RATES.input +
          d.output * RATES.output +
          d.cacheRead * RATES.cacheRead +
          d.cacheWrite * RATES.cacheCreate;
        return {
          ...d,
          estimatedCost: Math.round(estimatedCost * 100) / 100,
          premiumRequests: Math.round(d.premiumRequests * 100) / 100,
        };
      });

    const totals = days.reduce(
      (acc, d) => {
        acc.sessions += d.sessions;
        acc.messages += d.messages;
        acc.toolCalls += d.toolCalls;
        acc.input += d.input;
        acc.output += d.output;
        acc.cacheRead += d.cacheRead;
        acc.cacheWrite += d.cacheWrite;
        acc.reasoningTokens += d.reasoningTokens;
        acc.premiumRequests += d.premiumRequests;
        acc.estimatedCost += d.estimatedCost;
        for (const [model, count] of Object.entries(d.models || {})) {
          acc.models[model] = (acc.models[model] || 0) + count;
        }
        return acc;
      },
      {
        sessions: 0,
        messages: 0,
        toolCalls: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        reasoningTokens: 0,
        premiumRequests: 0,
        estimatedCost: 0,
        models: {},
      }
    );
    totals.premiumRequests = Math.round(totals.premiumRequests * 100) / 100;
    totals.estimatedCost = Math.round(totals.estimatedCost * 100) / 100;

    res.json({
      days,
      totals,
      rates: {
        input: parseFloat(process.env.RATE_INPUT ?? "5.0"),
        output: parseFloat(process.env.RATE_OUTPUT ?? "25.0"),
        cacheRead: parseFloat(process.env.RATE_CACHE_READ ?? "0.5"),
        cacheCreate: parseFloat(process.env.RATE_CACHE_CREATE ?? "6.25"),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add GET /api/projects endpoint**

Insert after `/api/daily-costs`:

```javascript
app.get("/api/projects", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const projects = {};

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      if (!ws || !ws.cwd) continue;

      const fullPath = ws.cwd;
      const name = shortProjectName(fullPath);

      if (!projects[fullPath]) {
        projects[fullPath] = {
          name,
          fullPath,
          sessions: 0,
          premiumRequests: 0,
          firstSeen: null,
          lastSeen: null,
        };
      }

      projects[fullPath].sessions++;

      const ts = ws.created_at;
      if (ts) {
        if (
          !projects[fullPath].firstSeen ||
          ts < projects[fullPath].firstSeen
        ) {
          projects[fullPath].firstSeen = ts;
        }
        if (
          !projects[fullPath].lastSeen ||
          ts > projects[fullPath].lastSeen
        ) {
          projects[fullPath].lastSeen = ts;
        }
      }

      const shutdowns = await parseEventsJsonl(dir, ["session.shutdown"]);
      for (const event of shutdowns) {
        projects[fullPath].premiumRequests +=
          event.data?.totalPremiumRequests || 0;
      }
    }

    const result = Object.values(projects)
      .map((p) => ({
        ...p,
        premiumRequests: Math.round(p.premiumRequests * 100) / 100,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verify endpoints**

Run: `node server.js &`
Then:
- `curl -s http://localhost:3456/api/daily-costs | head -c 300`
  Expected: JSON with `days` array, `totals`, `rates`
- `curl -s http://localhost:3456/api/projects | head -c 200`
  Expected: JSON array with `name`, `sessions`, `premiumRequests`

Stop server, then:

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /api/daily-costs and /api/projects endpoints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Server — Tool Calls & Tool Details Endpoints

**Files:**
- Modify: `server.js` (add 2 endpoints)

- [ ] **Step 1: Add GET /api/tool-calls endpoint**

Insert after `/api/projects` in `server.js`:

```javascript
app.get("/api/tool-calls", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const toolCounts = {};
    const toolsByProject = {};

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      const project = shortProjectName(ws?.cwd);
      const events = await parseEventsJsonl(dir, ["tool.execution_start"]);

      for (const event of events) {
        const toolName = event.data?.toolName || event.data?.tool || "unknown";
        toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;

        if (!toolsByProject[project]) toolsByProject[project] = {};
        toolsByProject[project][toolName] =
          (toolsByProject[project][toolName] || 0) + 1;
      }
    }

    const tools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tool, count]) => ({ tool, count }));

    res.json({ tools, byProject: toolsByProject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add GET /api/tool-details/:toolName endpoint**

Insert after `/api/tool-calls`:

```javascript
app.get("/api/tool-details/:toolName", async (req, res) => {
  try {
    const targetTool = req.params.toolName;
    const sessionDirs = getSessionDirs();
    const calls = [];

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      const project = shortProjectName(ws?.cwd);
      const events = await parseEventsJsonl(dir, [
        "tool.execution_start",
        "tool.execution_complete",
      ]);

      const completions = {};
      for (const event of events) {
        if (event.type === "tool.execution_complete" && event.data?.toolCallId) {
          completions[event.data.toolCallId] = event.data;
        }
      }

      for (const event of events) {
        if (event.type !== "tool.execution_start") continue;
        const toolName = event.data?.toolName || event.data?.tool || "unknown";
        if (toolName !== targetTool) continue;

        const args = event.data?.arguments || {};
        const completion = completions[event.data?.toolCallId] || {};

        let extracted;
        switch (toolName) {
          case "bash":
            extracted = {
              command: args.command,
              description: args.description,
            };
            break;
          case "read":
          case "edit":
          case "create":
            extracted = { path: args.path || args.file_path };
            break;
          case "grep":
            extracted = {
              pattern: args.pattern,
              paths: args.paths,
              glob: args.glob,
            };
            break;
          case "glob":
            extracted = { pattern: args.pattern, paths: args.paths };
            break;
          case "task":
            extracted = {
              description: args.description,
              agent_type: args.agent_type,
            };
            break;
          default:
            extracted = {
              input: JSON.stringify(args).slice(0, 200),
            };
        }

        calls.push({
          tool: toolName,
          project,
          timestamp: event.timestamp || "",
          arguments: extracted,
          success: completion.success ?? null,
          model: completion.model || "",
        });
      }
    }

    calls.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    res.json(calls.slice(0, 500));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Verify endpoints**

Run: `node server.js &`
Then:
- `curl -s http://localhost:3456/api/tool-calls | head -c 300`
  Expected: JSON with `tools` array sorted by count, `byProject` object
- `curl -s http://localhost:3456/api/tool-details/bash | head -c 300`
  Expected: JSON array with `tool`, `project`, `timestamp`, `arguments`, `success`

Stop server, then:

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat: add /api/tool-calls and /api/tool-details endpoints

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Frontend — HTML Structure & CSS

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create index.html with structure and styles**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Copilot Lens — Usage Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      line-height: 1.6;
    }

    h1 {
      font-size: 1.5rem;
      color: #58a6ff;
      margin-bottom: 8px;
    }

    h1 .subtitle {
      font-size: 0.85rem;
      color: #8b949e;
      font-weight: normal;
    }

    h2 {
      font-size: 1.1rem;
      color: #c9d1d9;
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #21262d;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }

    .summary-panel {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px;
    }

    .summary-panel h3 {
      font-size: 0.9rem;
      color: #8b949e;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 0.85rem;
    }

    .stat-row .label { color: #8b949e; }
    .stat-row .value { color: #c9d1d9; font-weight: 600; }
    .stat-row .value.highlight { color: #58a6ff; }
    .stat-row .value.green { color: #3fb950; }
    .stat-row .value.orange { color: #d29922; }

    .cache-cards {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .cache-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }

    .cache-card .card-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #58a6ff;
    }

    .cache-card .card-label {
      font-size: 0.75rem;
      color: #8b949e;
      margin-top: 4px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 16px;
      font-size: 0.8rem;
    }

    th {
      background: #21262d;
      color: #8b949e;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td {
      padding: 8px 12px;
      border-top: 1px solid #21262d;
      color: #c9d1d9;
    }

    tr:hover td { background: #1c2128; }

    .bar-cell {
      position: relative;
      padding-right: 60px;
    }

    .bar {
      height: 20px;
      background: #1f6feb;
      border-radius: 3px;
      min-width: 2px;
    }

    .bar-count {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.8rem;
      color: #8b949e;
    }

    .tool-row { cursor: pointer; }
    .tool-row:hover td { background: #1c2128; }

    .tool-detail {
      display: none;
      background: #0d1117;
    }

    .tool-detail td {
      padding: 6px 12px 6px 32px;
      font-size: 0.75rem;
      color: #8b949e;
    }

    .success-badge {
      display: inline-block;
      width: 16px;
      text-align: center;
    }

    .success-badge.pass { color: #3fb950; }
    .success-badge.fail { color: #f85149; }

    .history-list {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 12px;
      max-height: 400px;
      overflow-y: auto;
    }

    .history-item {
      padding: 6px 8px;
      font-size: 0.8rem;
      border-bottom: 1px solid #21262d;
      color: #c9d1d9;
    }

    .history-item:last-child { border-bottom: none; }

    .models-list {
      margin-top: 8px;
      font-size: 0.8rem;
    }

    .model-badge {
      display: inline-block;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 12px;
      padding: 2px 8px;
      margin: 2px 4px 2px 0;
      font-size: 0.7rem;
      color: #8b949e;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #8b949e;
      font-size: 0.9rem;
    }

    .export-btn {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 14px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .export-btn:hover { background: #30363d; }

    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: 1fr; }
      .cache-cards { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <h1>🔭 Copilot Lens <span class="subtitle">— GitHub Copilot CLI Usage Dashboard</span></h1>

  <div id="summary-section">
    <div class="summary-grid">
      <div class="summary-panel" id="today-panel">
        <h3>Today</h3>
        <div id="today-stats"></div>
      </div>
      <div class="summary-panel" id="alltime-panel">
        <h3>All Time</h3>
        <div id="alltime-stats"></div>
      </div>
    </div>
  </div>

  <div id="cache-cards" class="cache-cards"></div>

  <h2>Daily Breakdown</h2>
  <div id="daily-costs">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Sessions</th>
          <th>Messages</th>
          <th>Tool Calls</th>
          <th>Cache Read</th>
          <th>Cache Write</th>
          <th>Hit Rate</th>
          <th>Premium Req</th>
          <th>Est. Cost</th>
        </tr>
      </thead>
      <tbody id="daily-body"></tbody>
    </table>
  </div>

  <h2>Tool Call Analytics <button class="export-btn" onclick="exportToolCalls()">Export</button></h2>
  <table id="tool-calls-table">
    <thead>
      <tr>
        <th>Tool</th>
        <th>Usage</th>
      </tr>
    </thead>
    <tbody id="tools-body"></tbody>
  </table>

  <h2>Project Activity</h2>
  <table>
    <thead>
      <tr>
        <th>Project</th>
        <th>Sessions</th>
        <th>Premium Req</th>
        <th>Last Active</th>
      </tr>
    </thead>
    <tbody id="projects-body"></tbody>
  </table>

  <h2>Prompt History</h2>
  <div id="history-section" class="history-list"></div>

  <script>
    // JavaScript will be added in Task 7
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify HTML loads**

Run: `node server.js &`
Open `http://localhost:3456` in browser.
Expected: Dark-themed page with title "🔭 Copilot Lens", empty tables and sections visible.
Stop server.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add dashboard HTML structure and CSS styling

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Frontend — JavaScript Rendering

**Files:**
- Modify: `index.html` (replace the empty `<script>` block)

- [ ] **Step 1: Add all JavaScript rendering logic**

Replace `// JavaScript will be added in Task 7` and the surrounding `<script>` tags in `index.html` with:

```html
  <script>
    function fmt(n) {
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
      return n.toLocaleString();
    }

    function pct(num, denom) {
      if (!denom) return "0.0%";
      return ((num / denom) * 100).toFixed(1) + "%";
    }

    function escapeHtml(str) {
      const d = document.createElement("div");
      d.textContent = str;
      return d.innerHTML;
    }

    function renderStatRows(container, data) {
      container.innerHTML = data
        .map(
          (r) =>
            `<div class="stat-row"><span class="label">${r.label}</span><span class="value ${r.cls || ""}">${r.value}</span></div>`
        )
        .join("");
    }

    function topModels(models, n) {
      return Object.entries(models || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(
          ([m, c]) =>
            `<span class="model-badge">${escapeHtml(m)} (${c})</span>`
        )
        .join("");
    }

    function renderSummary(costData, stats) {
      const today = new Date().toISOString().slice(0, 10);
      const todayData = costData.days.find((d) => d.date === today) || {
        sessions: 0,
        messages: 0,
        toolCalls: 0,
        premiumRequests: 0,
        estimatedCost: 0,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        models: {},
      };
      const t = costData.totals;

      const todayHitRate = pct(
        todayData.cacheRead,
        todayData.input + todayData.cacheRead + todayData.cacheWrite
      );
      const allHitRate = pct(
        t.cacheRead,
        t.input + t.cacheRead + t.cacheWrite
      );

      renderStatRows(document.getElementById("today-stats"), [
        { label: "Sessions", value: todayData.sessions },
        { label: "Messages", value: todayData.messages },
        { label: "Tool Calls", value: todayData.toolCalls },
        {
          label: "Premium Requests",
          value: todayData.premiumRequests,
          cls: "highlight",
        },
        {
          label: "Est. Cost",
          value: "$" + todayData.estimatedCost.toFixed(2),
          cls: "orange",
        },
        { label: "Cache Hit Rate", value: todayHitRate, cls: "green" },
      ]);
      document.getElementById("today-stats").innerHTML +=
        `<div class="models-list">${topModels(todayData.models, 3)}</div>`;

      renderStatRows(document.getElementById("alltime-stats"), [
        { label: "Sessions", value: t.sessions },
        { label: "Messages", value: t.messages },
        { label: "Tool Calls", value: t.toolCalls },
        {
          label: "Premium Requests",
          value: t.premiumRequests,
          cls: "highlight",
        },
        {
          label: "Est. Cost",
          value: "$" + t.estimatedCost.toFixed(2),
          cls: "orange",
        },
        { label: "Cache Hit Rate", value: allHitRate, cls: "green" },
      ]);
      document.getElementById("alltime-stats").innerHTML +=
        `<div class="models-list">${topModels(t.models, 3)}</div>`;
    }

    function renderCacheCards(costData) {
      const t = costData.totals;
      const totalInput = t.input + t.cacheRead + t.cacheWrite;
      const hitRate = totalInput ? ((t.cacheRead / totalInput) * 100).toFixed(1) : "0.0";
      const withCache = t.estimatedCost;
      const noCacheCost =
        (t.input + t.cacheRead + t.cacheWrite) * (costData.rates.input / 1e6) +
        t.output * (costData.rates.output / 1e6);
      const noCacheRounded = Math.round(noCacheCost * 100) / 100;
      const saved = Math.round((noCacheRounded - withCache) * 100) / 100;

      document.getElementById("cache-cards").innerHTML = [
        { value: hitRate + "%", label: "Cache Hit Rate" },
        { value: "$" + withCache.toFixed(2), label: "Cost (with cache)" },
        { value: "$" + noCacheRounded.toFixed(2), label: "Cost (no cache)" },
        { value: "$" + Math.max(0, saved).toFixed(2), label: "Savings" },
      ]
        .map(
          (c) =>
            `<div class="cache-card"><div class="card-value">${c.value}</div><div class="card-label">${c.label}</div></div>`
        )
        .join("");
    }

    function renderDailyCosts(costData) {
      const body = document.getElementById("daily-body");
      body.innerHTML = costData.days
        .map((d) => {
          const totalInput = d.input + d.cacheRead + d.cacheWrite;
          const hitRate = totalInput
            ? ((d.cacheRead / totalInput) * 100).toFixed(1) + "%"
            : "—";
          return `<tr>
            <td>${d.date}</td>
            <td>${d.sessions}</td>
            <td>${d.messages}</td>
            <td>${d.toolCalls}</td>
            <td>${fmt(d.cacheRead)}</td>
            <td>${fmt(d.cacheWrite)}</td>
            <td>${hitRate}</td>
            <td>${d.premiumRequests}</td>
            <td>$${d.estimatedCost.toFixed(2)}</td>
          </tr>`;
        })
        .join("");
    }

    let currentToolData = null;

    function renderTools(toolData) {
      currentToolData = toolData;
      const body = document.getElementById("tools-body");
      const maxCount = toolData.tools.length
        ? toolData.tools[0].count
        : 1;

      body.innerHTML = toolData.tools
        .map(
          (t) => `
          <tr class="tool-row" onclick="loadToolDetails('${escapeHtml(t.tool)}', this)">
            <td>${escapeHtml(t.tool)}</td>
            <td class="bar-cell">
              <div class="bar" style="width: ${(t.count / maxCount) * 100}%"></div>
              <span class="bar-count">${t.count}</span>
            </td>
          </tr>
          <tr class="tool-detail" id="detail-${escapeHtml(t.tool)}">
            <td colspan="2" id="detail-content-${escapeHtml(t.tool)}">Loading...</td>
          </tr>`
        )
        .join("");
    }

    async function loadToolDetails(toolName, row) {
      const detailRow = document.getElementById("detail-" + toolName);
      if (!detailRow) return;

      const isVisible = detailRow.style.display === "table-row";
      detailRow.style.display = isVisible ? "none" : "table-row";
      if (isVisible) return;

      const contentCell = document.getElementById("detail-content-" + toolName);
      contentCell.textContent = "Loading...";

      try {
        const calls = await fetch("/api/tool-details/" + encodeURIComponent(toolName)).then((r) => r.json());
        if (!calls.length) {
          contentCell.textContent = "No details available.";
          return;
        }

        contentCell.innerHTML = calls
          .slice(0, 200)
          .map((c) => {
            const badge = c.success === true
              ? '<span class="success-badge pass">✓</span>'
              : c.success === false
                ? '<span class="success-badge fail">✗</span>'
                : '<span class="success-badge">—</span>';
            const args = Object.entries(c.arguments || {})
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}: ${escapeHtml(String(v))}`)
              .join(" | ");
            return `<div style="padding:4px 0;border-bottom:1px solid #21262d">
              ${badge} <span style="color:#8b949e">${escapeHtml(c.timestamp?.slice(0, 19) || "")}</span>
              <span style="color:#58a6ff">${escapeHtml(c.project)}</span>
              ${args ? `<br><span style="color:#c9d1d9;padding-left:24px">${args}</span>` : ""}
            </div>`;
          })
          .join("");
      } catch {
        contentCell.textContent = "Error loading details.";
      }
    }

    function renderProjects(projects) {
      const body = document.getElementById("projects-body");
      body.innerHTML = projects
        .map(
          (p) => `<tr>
            <td title="${escapeHtml(p.fullPath)}">${escapeHtml(p.name)}</td>
            <td>${p.sessions}</td>
            <td>${p.premiumRequests}</td>
            <td>${p.lastSeen ? p.lastSeen.slice(0, 10) : "—"}</td>
          </tr>`
        )
        .join("");
    }

    function renderHistory(history) {
      const container = document.getElementById("history-section");
      if (!history.length) {
        container.innerHTML = '<div class="empty-state">No command history found.</div>';
        return;
      }
      container.innerHTML = history
        .map(
          (h) =>
            `<div class="history-item">${escapeHtml(h.display)}</div>`
        )
        .join("");
    }

    function exportToolCalls() {
      if (!currentToolData) return;
      const lines = currentToolData.tools.map(
        (t) => `${t.tool}: ${t.count} calls`
      );
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "copilot-tool-calls.txt";
      a.click();
    }

    async function load() {
      try {
        const [stats, history, toolData, projects, costData] =
          await Promise.all([
            fetch("/api/stats").then((r) => r.json()),
            fetch("/api/history").then((r) => r.json()),
            fetch("/api/tool-calls").then((r) => r.json()),
            fetch("/api/projects").then((r) => r.json()),
            fetch("/api/daily-costs").then((r) => r.json()),
          ]);

        renderSummary(costData, stats);
        renderCacheCards(costData);
        renderDailyCosts(costData);
        renderTools(toolData);
        renderProjects(projects);
        renderHistory(history);
      } catch (err) {
        document.body.innerHTML +=
          '<div class="empty-state">Error loading dashboard: ' +
          escapeHtml(err.message) +
          "</div>";
      }
    }

    load();
  </script>
```

- [ ] **Step 2: Verify full dashboard**

Run: `node server.js`
Open `http://localhost:3456` in browser.
Expected:
- Summary panel shows Today vs. All-Time with premium requests, est. cost, cache hit rate
- Cache cards show hit rate, costs, savings
- Daily breakdown table populated with rows
- Tool call bar chart shows tools sorted by count, rows are clickable
- Project activity table shows projects with session counts
- Prompt history list shows command history entries

Stop server.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add dashboard JavaScript rendering and interactivity

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# 🔭 Copilot Lens

Local dashboard for visualizing [GitHub Copilot CLI](https://docs.github.com/en/copilot) usage statistics. Reads data from `~/.copilot` and presents token costs, cache performance, tool call analytics, and project activity.

![Dashboard Screenshot](images/dashboard.png)

## Quick Start

```bash
npx github:foyzulkarim/copilot-lens
```

Then open [http://localhost:3456](http://localhost:3456).

## Local Setup

```bash
git clone https://github.com/foyzulkarim/copilot-lens.git
cd copilot-lens
npm install
cp .env.example .env   # optional — edit to customize
node server.js
```

## Features

- **Today vs All-Time stats** — sessions, premium requests, estimated cost
- **Cache performance** — hit rate and savings vs no-cache baseline
- **Daily cost & cache table** — per-day token breakdown with estimated spend
- **Tool call analytics** — which tools Copilot used most, with drill-down and success/failure indicators
- **Project activity** — sessions and premium requests per project
- **Configurable pricing** — swap between Bedrock and Anthropic API rates via `.env`

## Configuration

All options set via `.env` file:

| Variable | Default | Description |
|---|---|---|
| `COPILOT_DIR` | `~/.copilot` | Path to Copilot data directory |
| `PORT` | `3456` | Dashboard server port |
| `RATE_INPUT` | `5.0` | Input token price (USD per 1M tokens) |
| `RATE_OUTPUT` | `25.0` | Output token price (USD per 1M tokens) |
| `RATE_CACHE_READ` | `0.5` | Cache read price (USD per 1M tokens) |
| `RATE_CACHE_CREATE` | `6.25` | Cache write price (USD per 1M tokens) |

> Default rates match **Bedrock cross-region inference (ap-southeast-2)**. For Anthropic API rates: `RATE_INPUT=15`, `RATE_OUTPUT=75`, `RATE_CACHE_READ=1.5`, `RATE_CACHE_CREATE=18.75`.

## Requirements

- Node.js 18+
- GitHub Copilot CLI installed (data lives in `~/.copilot`)

## Inspired By

[claude-lens](https://github.com/foyzulkarim/claude-lens) — the same concept for Claude Code.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start and configuration guide

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Smoke Test & Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Start server and test all endpoints**

Run: `node server.js &`

```bash
echo "=== /api/stats ===" && curl -s http://localhost:3456/api/stats | python3 -m json.tool | head -15
echo "=== /api/sessions ===" && curl -s http://localhost:3456/api/sessions | python3 -m json.tool | head -15
echo "=== /api/history ===" && curl -s http://localhost:3456/api/history | python3 -m json.tool | head -10
echo "=== /api/daily-costs ===" && curl -s http://localhost:3456/api/daily-costs | python3 -m json.tool | head -20
echo "=== /api/projects ===" && curl -s http://localhost:3456/api/projects | python3 -m json.tool | head -15
echo "=== /api/tool-calls ===" && curl -s http://localhost:3456/api/tool-calls | python3 -m json.tool | head -15
echo "=== /api/tool-details/bash ===" && curl -s http://localhost:3456/api/tool-details/bash | python3 -m json.tool | head -15
```

Expected: All endpoints return valid JSON with real data from `~/.copilot`.

- [ ] **Step 2: Visual verification in browser**

Open `http://localhost:3456` in browser.
Verify all 6 sections render with actual data:
1. ✅ Summary panel (Today + All-Time) with premium requests and est. cost
2. ✅ Cache cards (4 metrics)
3. ✅ Daily breakdown table
4. ✅ Tool call bar chart (click a row to verify drill-down)
5. ✅ Project activity table
6. ✅ Prompt history list

- [ ] **Step 3: Test export**

Click "Export" button next to Tool Call Analytics.
Expected: Browser downloads `copilot-tool-calls.txt` with tool names and counts.

Stop server.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

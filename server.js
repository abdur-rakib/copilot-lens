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

// --- API endpoints ---

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

app.listen(PORT, () => {
  console.log(`copilot-lens running at http://localhost:${PORT}`);
  console.log(`Reading data from: ${COPILOT_DIR}`);
});

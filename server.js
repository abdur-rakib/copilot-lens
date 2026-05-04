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
            totals.modelBreakdown[model] = {
              requests: 0,
              cost: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              reasoningTokens: 0,
            };
          }
          totals.modelBreakdown[model].requests += info.requests?.count || 0;
          totals.modelBreakdown[model].cost += info.requests?.cost || 0;

          const usage = info.usage || {};
          totals.modelBreakdown[model].inputTokens += usage.inputTokens || 0;
          totals.modelBreakdown[model].outputTokens += usage.outputTokens || 0;
          totals.modelBreakdown[model].cacheReadTokens += usage.cacheReadTokens || 0;
          totals.modelBreakdown[model].cacheWriteTokens += usage.cacheWriteTokens || 0;
          totals.modelBreakdown[model].reasoningTokens += usage.reasoningTokens || 0;

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

app.listen(PORT, () => {
  console.log(`copilot-lens running at http://localhost:${PORT}`);
  console.log(`Reading data from: ${COPILOT_DIR}`);
});

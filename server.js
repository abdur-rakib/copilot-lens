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

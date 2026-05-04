'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { mapCLI } = require('./mapper');

/**
 * Get the copilot directory path.
 * @returns {string}
 */
function getCLIDir() {
  return process.env.COPILOT_DIR || path.join(os.homedir(), '.copilot');
}

/**
 * Parse a simple workspace.yaml (key: value per line).
 * @param {string} content
 * @returns {Object}
 */
function parseWorkspaceYaml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Parse events.jsonl and return parsed event objects.
 * @param {string} filePath
 * @returns {Object[]}
 */
function parseEventsFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

/**
 * Aggregate token usage across all models in modelMetrics.
 * @param {Object} modelMetrics
 * @returns {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number }}
 */
function sumTokenUsage(modelMetrics) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  if (!modelMetrics || typeof modelMetrics !== 'object') return totals;
  for (const model of Object.values(modelMetrics)) {
    const usage = model.usage || {};
    totals.inputTokens += usage.inputTokens || 0;
    totals.outputTokens += usage.outputTokens || 0;
    totals.cacheReadTokens += usage.cacheReadTokens || 0;
    totals.cacheWriteTokens += usage.cacheWriteTokens || 0;
  }
  return totals;
}

/**
 * Sum cost across all models in modelMetrics.
 * @param {Object} modelMetrics
 * @returns {number|null}
 */
function sumCost(modelMetrics) {
  if (!modelMetrics || typeof modelMetrics !== 'object') return null;
  let total = 0;
  let hasCost = false;
  for (const model of Object.values(modelMetrics)) {
    const cost = model.requests?.cost;
    if (typeof cost === 'number') {
      total += cost;
      hasCost = true;
    }
  }
  return hasCost ? total : null;
}

/**
 * Read all CLI sessions from session-state directory.
 * @returns {import('./mapper').UnifiedSession[]}
 */
function getCLISessions() {
  const copilotDir = getCLIDir();
  const sessionStateDir = path.join(copilotDir, 'session-state');

  if (!fs.existsSync(sessionStateDir)) return [];

  let dirs;
  try {
    dirs = fs.readdirSync(sessionStateDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }

  const sessions = [];

  for (const dirName of dirs) {
    const dirPath = path.join(sessionStateDir, dirName);
    const workspacePath = path.join(dirPath, 'workspace.yaml');

    if (!fs.existsSync(workspacePath)) continue;

    let workspace;
    try {
      workspace = parseWorkspaceYaml(fs.readFileSync(workspacePath, 'utf8'));
    } catch {
      continue;
    }

    const events = parseEventsFile(path.join(dirPath, 'events.jsonl'));

    // Find last session.shutdown event
    let shutdown = null;
    for (const evt of events) {
      if (evt.type === 'session.shutdown') shutdown = evt;
    }

    const messageCount = events.filter(e => e.type === 'user.message').length;
    const toolCallCount = events.filter(e => e.type === 'tool.execution_start').length;

    const data = shutdown?.data || {};
    const modelMetrics = data.modelMetrics || {};
    const modelKeys = Object.keys(modelMetrics);
    const primaryModel = modelKeys[0] || 'unknown';

    const tokenUsage = sumTokenUsage(modelMetrics);
    const costUsd = sumCost(modelMetrics);
    const premiumRequests = data.totalPremiumRequests ?? null;
    const durationMs = data.totalApiDurationMs || 0;

    const timestamp = shutdown?.timestamp || workspace.updated_at || workspace.created_at || new Date().toISOString();

    const sessionData = {
      session_id: workspace.id || dirName,
      timestamp,
      session: {
        id: workspace.id || dirName,
        name: workspace.name || workspace.summary || 'Untitled',
        project: workspace.cwd || null,
        branch: workspace.branch || null,
        model: primaryModel,
        totalMessages: messageCount,
        totalToolCalls: toolCallCount,
        durationMs,
      },
      tokenUsage,
      premiumRequests,
      costUsd,
    };

    sessions.push(mapCLI(sessionData));
  }

  // Sort by startTime descending
  sessions.sort((a, b) => b.startTime - a.startTime);
  return sessions;
}

module.exports = { getCLISessions, getCLIDir };

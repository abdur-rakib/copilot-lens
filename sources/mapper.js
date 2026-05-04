/**
 * @typedef {Object} UnifiedSession
 * @property {string} id - unique session ID
 * @property {'cli'|'vscode'} source - data origin
 * @property {string} title - session name/title
 * @property {string|null} project - project/folder name
 * @property {string|null} branch - git branch (CLI only)
 * @property {string} model - primary model used
 * @property {string[]} models - all models used in session
 * @property {number} messageCount - number of messages/exchanges
 * @property {number} toolCallCount - tool invocations count
 * @property {number} startTime - epoch ms
 * @property {number} endTime - epoch ms
 * @property {number} durationMs - total elapsed
 * @property {number|null} inputTokens - CLI only
 * @property {number|null} outputTokens - CLI only
 * @property {number|null} cacheReadTokens - CLI only
 * @property {number|null} cacheWriteTokens - CLI only
 * @property {number|null} premiumRequests - CLI only
 * @property {number|null} costUsd - CLI only
 */

const path = require('path');

/**
 * Calculate estimated cost from token counts using Claude Sonnet pricing.
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {number} cacheReadTokens
 * @param {number} cacheWriteTokens
 * @returns {number} cost in USD
 */
function calculateCost(inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0) {
  return (
    (inputTokens * 5) / 1000000 +
    (outputTokens * 25) / 1000000 +
    (cacheReadTokens * 0.5) / 1000000 +
    (cacheWriteTokens * 6.25) / 1000000
  );
}

/**
 * Map a CLI session.shutdown event to the unified session schema.
 * @param {Object} sessionData - The full session.shutdown event object
 * @returns {UnifiedSession}
 */
function mapCLI(sessionData) {
  const session = sessionData.session || {};
  const tokenUsage = sessionData.tokenUsage || {};
  const timestamp = sessionData.timestamp ? new Date(sessionData.timestamp).getTime() : Date.now();

  const inputTokens = tokenUsage.inputTokens ?? null;
  const outputTokens = tokenUsage.outputTokens ?? null;
  const cacheReadTokens = tokenUsage.cacheReadTokens ?? null;
  const cacheWriteTokens = tokenUsage.cacheWriteTokens ?? null;

  const durationMs = session.durationMs || 0;
  const endTime = timestamp;
  const startTime = durationMs ? endTime - durationMs : endTime;

  let costUsd = sessionData.costUsd ?? null;
  if (costUsd == null && inputTokens != null) {
    costUsd = calculateCost(
      inputTokens || 0,
      outputTokens || 0,
      cacheReadTokens || 0,
      cacheWriteTokens || 0
    );
  }

  const model = session.model || 'unknown';

  return {
    id: session.id || sessionData.session_id || 'unknown',
    source: 'cli',
    title: session.name || 'Untitled',
    project: session.project ? path.basename(session.project) : null,
    branch: session.branch ?? null,
    model,
    models: [model],
    messageCount: session.totalMessages || 0,
    toolCallCount: session.totalToolCalls || 0,
    startTime,
    endTime,
    durationMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    premiumRequests: sessionData.premiumRequests ?? null,
    costUsd,
  };
}

/**
 * Map a VS Code chatSession JSON to the unified session schema.
 * @param {Object} sessionJson - Parsed chatSession JSON
 * @param {string} [workspacePath] - Path to the workspace folder
 * @returns {UnifiedSession}
 */
function mapVSCode(sessionJson, workspacePath) {
  const requests = sessionJson.requests || [];

  // Title: customTitle or first message text truncated to 60 chars
  let title = sessionJson.customTitle || '';
  if (!title && requests.length > 0) {
    const msg = requests[0].message;
    const text = msg?.parts?.[0]?.text || msg?.text || '';
    title = text.length > 60 ? text.slice(0, 60) : text;
  }
  title = title || 'Untitled';

  // Models: collect unique modelIds, strip "copilot/" prefix
  const stripPrefix = (id) => (id || '').replace(/^copilot\//, '');
  const modelIds = requests.map((r) => stripPrefix(r.modelId)).filter(Boolean);
  const models = [...new Set(modelIds)];

  // Primary model: most frequently used
  const freq = {};
  for (const m of modelIds) {
    freq[m] = (freq[m] || 0) + 1;
  }
  const model = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

  // Tool call count: sum of toolCallRounds lengths
  let toolCallCount = 0;
  for (const req of requests) {
    const rounds = req.result?.metadata?.toolCallRounds;
    if (Array.isArray(rounds)) {
      toolCallCount += rounds.length;
    }
  }

  const startTime = sessionJson.creationDate || 0;
  const endTime = sessionJson.lastMessageDate || startTime;

  return {
    id: sessionJson.sessionId || 'unknown',
    source: 'vscode',
    title,
    project: workspacePath ? path.basename(workspacePath) : null,
    branch: null,
    model,
    models,
    messageCount: requests.length,
    toolCallCount,
    startTime,
    endTime,
    durationMs: endTime - startTime,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    premiumRequests: null,
    costUsd: null,
  };
}

module.exports = { mapCLI, mapVSCode, calculateCost };

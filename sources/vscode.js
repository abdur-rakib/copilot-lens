'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { mapVSCode } = require('./mapper');

/**
 * Detect the VS Code user data path based on OS.
 * @returns {string|null}
 */
function getVSCodeUserDataPath() {
  if (process.env.VSCODE_DATA_PATH) return process.env.VSCODE_DATA_PATH;
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Code', 'User');
    case 'linux':
      return path.join(home, '.config', 'Code', 'User');
    case 'win32':
      return path.join(process.env.APPDATA || '', 'Code', 'User');
    default:
      return null;
  }
}

/**
 * Read all VS Code chat sessions from workspaceStorage.
 * @returns {import('./mapper').UnifiedSession[]}
 */
function getVSCodeSessions() {
  const userDataPath = getVSCodeUserDataPath();
  if (!userDataPath) return [];

  const workspaceStoragePath = path.join(userDataPath, 'workspaceStorage');
  if (!fs.existsSync(workspaceStoragePath)) return [];

  const sessions = [];
  let workspaceDirs;
  try {
    workspaceDirs = fs.readdirSync(workspaceStoragePath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of workspaceDirs) {
    if (!entry.isDirectory()) continue;

    const workspaceDir = path.join(workspaceStoragePath, entry.name);

    // Resolve workspace path from workspace.json
    let workspacePath = null;
    const workspaceJsonPath = path.join(workspaceDir, 'workspace.json');
    try {
      const raw = fs.readFileSync(workspaceJsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.folder) {
        workspacePath = new URL(parsed.folder).pathname;
      }
    } catch {
      // workspace.json missing or malformed — skip workspace path resolution
    }

    // Read chat sessions
    const chatSessionsDir = path.join(workspaceDir, 'chatSessions');
    if (!fs.existsSync(chatSessionsDir)) continue;

    let sessionFiles;
    try {
      sessionFiles = fs.readdirSync(chatSessionsDir);
    } catch {
      continue;
    }

    for (const file of sessionFiles) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(chatSessionsDir, file);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const sessionJson = JSON.parse(raw);

        // Filter out sessions with no sessionId
        if (!sessionJson.sessionId) continue;

        sessions.push(mapVSCode(sessionJson, workspacePath));
      } catch (err) {
        console.warn(`[copilot-lens] Skipping malformed session file: ${filePath}`, err.message);
      }
    }
  }

  return sessions;
}

module.exports = { getVSCodeSessions, getVSCodeUserDataPath };

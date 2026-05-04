# Session Drill-down & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session detail modal (timeline + cost breakdown) and client-side search/filter to the copilot-lens dashboard.

**Architecture:** One new Express endpoint (`GET /api/session/:id`) returns full session detail. Frontend adds a search input above the session list, a clickable session table, and a full-screen modal overlay showing per-model costs and event timeline.

**Tech Stack:** Express (existing), vanilla HTML/CSS/JS (existing), CSS custom properties for theming.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server.js` (modify: lines 524-525) | Add `/api/session/:id` endpoint before `app.listen()` |
| `index.html` (modify: CSS ~line 370-403) | Add modal + search CSS |
| `index.html` (modify: HTML ~line 487-501) | Add search bar + session table with clickable rows + modal container |
| `index.html` (modify: JS ~line 949-975) | Replace `renderHistory` section, add session search, modal logic, session detail renderer |

---

### Task 1: Backend — `/api/session/:id` endpoint

**Files:**
- Modify: `server.js:524-525` (insert before `app.listen()`)

- [ ] **Step 1: Add the `/api/session/:id` endpoint**

Insert this code in `server.js` between line 524 (closing `});` of `/api/tool-details`) and line 526 (`app.listen()`):

```javascript
app.get("/api/session/:id", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const sessionDir = path.join(SESSION_STATE_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: "Session not found" });
    }

    const ws = readWorkspace(sessionDir);
    if (!ws) {
      return res.status(404).json({ error: "Session workspace not found" });
    }

    const events = await parseEventsJsonl(sessionDir, [
      "user.message",
      "tool.execution_start",
      "tool.execution_complete",
      "session.shutdown",
    ]);

    // Build timeline
    const timeline = [];
    for (const event of events) {
      const entry = { type: event.type, timestamp: event.timestamp || "" };

      if (event.type === "user.message") {
        const msg = event.data?.message || event.data?.content || "";
        entry.content = msg.slice(0, 200);
      } else if (event.type === "tool.execution_start") {
        const args = event.data?.arguments || {};
        entry.tool = event.data?.toolName || event.data?.tool || "unknown";
        entry.toolCallId = event.data?.toolCallId || "";
        switch (entry.tool) {
          case "bash":
            entry.detail = args.command ? args.command.slice(0, 120) : (args.description || "");
            break;
          case "read": case "edit": case "create":
            entry.detail = args.path || args.file_path || "";
            break;
          case "grep":
            entry.detail = args.pattern || "";
            break;
          case "glob":
            entry.detail = args.pattern || "";
            break;
          case "task":
            entry.detail = args.description || args.agent_type || "";
            break;
          default:
            entry.detail = JSON.stringify(args).slice(0, 100);
        }
      } else if (event.type === "tool.execution_complete") {
        entry.tool = event.data?.toolName || event.data?.tool || "";
        entry.toolCallId = event.data?.toolCallId || "";
        entry.success = event.data?.success ?? null;
      } else if (event.type === "session.shutdown") {
        entry.premiumRequests = event.data?.totalPremiumRequests || 0;
      }

      timeline.push(entry);
    }

    // Build cost breakdown
    const shutdowns = events.filter((e) => e.type === "session.shutdown");
    const models = {};
    let totalPremium = 0;

    for (const event of shutdowns) {
      const d = event.data || {};
      totalPremium += d.totalPremiumRequests || 0;
      const metrics = d.modelMetrics || {};
      for (const [model, info] of Object.entries(metrics)) {
        if (!models[model]) {
          models[model] = { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
        }
        models[model].requests += info.requests?.count || 0;
        const usage = info.usage || {};
        models[model].inputTokens += usage.inputTokens || 0;
        models[model].outputTokens += usage.outputTokens || 0;
        models[model].cacheReadTokens += usage.cacheReadTokens || 0;
        models[model].cacheWriteTokens += usage.cacheWriteTokens || 0;
        models[model].reasoningTokens += usage.reasoningTokens || 0;
      }
    }

    // Compute per-model cost
    for (const info of Object.values(models)) {
      info.estimatedCost =
        Math.round(
          ((info.inputTokens * RATES.input) +
          (info.outputTokens * RATES.output) +
          (info.cacheReadTokens * RATES.cacheRead) +
          (info.cacheWriteTokens * RATES.cacheCreate)) * 10000
        ) / 10000;
    }

    const estimatedTotal = Object.values(models).reduce((sum, m) => sum + m.estimatedCost, 0);

    // Duration
    let duration = "";
    if (ws.created_at && ws.updated_at) {
      const ms = new Date(ws.updated_at) - new Date(ws.created_at);
      if (ms > 0) {
        const mins = Math.floor(ms / 60000);
        if (mins >= 60) {
          duration = Math.floor(mins / 60) + "h " + (mins % 60) + "m";
        } else {
          duration = mins + "m";
        }
      }
    }

    // Code changes from last shutdown
    const lastShutdown = shutdowns[shutdowns.length - 1]?.data || {};
    const codeChanges = lastShutdown.codeChanges || { linesAdded: 0, linesRemoved: 0 };

    res.json({
      id: sessionId,
      name: ws.name || ws.summary || "Untitled",
      cwd: ws.cwd || "",
      branch: ws.branch || "",
      createdAt: ws.created_at || "",
      updatedAt: ws.updated_at || "",
      duration,
      codeChanges,
      cost: {
        estimatedTotal: Math.round(estimatedTotal * 100) / 100,
        premiumRequests: Math.round(totalPremium * 100) / 100,
        models,
      },
      timeline,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify endpoint works**

Run:
```bash
cd /Users/bs01080/Desktop/aihero/copilot-lens
lsof -ti:3456 | xargs kill -9 2>/dev/null
node server.js &
sleep 2
# Get a real session ID
SESSION_ID=$(ls ~/.copilot/session-state/ | head -1)
curl -s "http://localhost:3456/api/session/$SESSION_ID" | head -c 300
kill %1
```

Expected: JSON with `id`, `name`, `cost`, `timeline` fields.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /api/session/:id endpoint for drill-down detail"
```

---

### Task 2: Frontend CSS — Modal & Search styles

**Files:**
- Modify: `index.html` (CSS section, before closing `</style>` at line 404)

- [ ] **Step 1: Add modal and search CSS**

Insert before the `</style>` tag (line 404 of index.html):

```css
    /* Session search */
    .session-search {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .session-search input {
      flex: 1;
      padding: 8px 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-family: inherit;
      font-size: 0.85rem;
    }

    .session-search input::placeholder { color: var(--text-muted); }
    .session-search input:focus { outline: none; border-color: var(--accent); }

    .session-search .result-count {
      font-size: 0.75rem;
      color: var(--text-muted);
      white-space: nowrap;
    }

    /* Clickable session rows */
    .session-row { cursor: pointer; transition: background 0.15s; }
    .session-row:hover { background: var(--bg-hover); }

    /* Modal overlay */
    .modal-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }

    .modal-backdrop.open { display: flex; }

    .modal-content {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 90vw;
      max-width: 900px;
      height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .modal-header h2 {
      font-size: 1.1rem;
      margin-bottom: 4px;
    }

    .modal-header .meta {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    .modal-close {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }

    .modal-close:hover { color: var(--text); }

    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    /* Cost breakdown in modal */
    .cost-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }

    .cost-section h3 {
      font-size: 0.85rem;
      margin-bottom: 8px;
      color: var(--accent);
    }

    .cost-section table { width: 100%; }

    .cost-total {
      font-weight: bold;
      border-top: 1px solid var(--border);
    }

    /* Timeline in modal */
    .timeline-section h3 {
      font-size: 0.85rem;
      margin-bottom: 8px;
      color: var(--accent);
    }

    .timeline-list {
      border-left: 2px solid var(--border);
      padding-left: 16px;
      margin-left: 8px;
    }

    .timeline-entry {
      padding: 6px 0;
      font-size: 0.8rem;
      border-bottom: 1px solid var(--bg-tertiary);
      display: flex;
      gap: 8px;
      align-items: baseline;
    }

    .timeline-entry:last-child { border-bottom: none; }

    .timeline-time {
      color: var(--text-muted);
      font-size: 0.72rem;
      flex-shrink: 0;
      width: 45px;
    }

    .timeline-icon { flex-shrink: 0; width: 18px; text-align: center; }

    .timeline-text {
      color: var(--text);
      word-break: break-word;
    }

    .timeline-text .detail {
      color: var(--text-muted);
      font-size: 0.75rem;
    }

    .modal-loading {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "style: add modal overlay and session search CSS"
```

---

### Task 3: Frontend HTML — Search bar, session table, and modal container

**Files:**
- Modify: `index.html` (HTML section)

- [ ] **Step 1: Replace the "Prompt History" section with "Sessions" section containing search + table**

Find (around lines 500-501):
```html
  <h2>Prompt History</h2>
  <div id="history-section" class="history-list"></div>
```

Replace with:
```html
  <h2>Sessions</h2>
  <div class="session-search">
    <input type="text" id="session-search-input" placeholder="Search sessions by name, project, or branch..." oninput="filterSessions()">
    <span class="result-count" id="session-result-count"></span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Project</th>
        <th>Branch</th>
        <th>Premium Req</th>
        <th>Created</th>
      </tr>
    </thead>
    <tbody id="sessions-body"></tbody>
  </table>

  <h2>Prompt History</h2>
  <div id="history-section" class="history-list"></div>

  <!-- Session detail modal -->
  <div class="modal-backdrop" id="session-modal" onclick="closeModalBackdrop(event)">
    <div class="modal-content">
      <div class="modal-header">
        <div>
          <h2 id="modal-title">Session Detail</h2>
          <div class="meta" id="modal-meta"></div>
        </div>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="modal-body">
        <div class="modal-loading">Loading...</div>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add sessions table with search bar and modal HTML"
```

---

### Task 4: Frontend JS — Session rendering and search filtering

**Files:**
- Modify: `index.html` (script section)

- [ ] **Step 1: Add sessionsData variable and renderSessions function**

Find (around line 881):
```javascript
    let currentToolData = null;
```

Insert BEFORE that line:
```javascript
    let sessionsData = [];

    function renderSessions(sessions) {
      sessionsData = sessions;
      filterSessions();
    }

    function filterSessions() {
      const query = (document.getElementById('session-search-input')?.value || '').toLowerCase();
      const filtered = sessionsData.filter(s => {
        if (!query) return true;
        const name = (s.name || '').toLowerCase();
        const project = (s.cwd || '').toLowerCase();
        const branch = (s.branch || '').toLowerCase();
        return name.includes(query) || project.includes(query) || branch.includes(query);
      });

      const countEl = document.getElementById('session-result-count');
      if (countEl) {
        countEl.textContent = query ? `Showing ${filtered.length} of ${sessionsData.length}` : `${sessionsData.length} sessions`;
      }

      const body = document.getElementById('sessions-body');
      if (!body) return;

      body.innerHTML = filtered.map(s => {
        const project = shortName(s.cwd);
        const created = s.createdAt ? s.createdAt.slice(0, 10) : '—';
        return `<tr class="session-row" onclick="openSession('${escapeHtml(s.id)}')">
          <td title="${escapeHtml(s.name)}">${escapeHtml((s.name || 'Untitled').slice(0, 50))}</td>
          <td title="${escapeHtml(s.cwd)}">${escapeHtml(project)}</td>
          <td>${escapeHtml(s.branch || '—')}</td>
          <td>${s.premiumRequests || 0}</td>
          <td>${created}</td>
        </tr>`;
      }).join('');
    }

    function shortName(cwdPath) {
      if (!cwdPath) return 'unknown';
      return cwdPath.split('/').pop() || cwdPath.split('\\').pop() || 'unknown';
    }

```

- [ ] **Step 2: Fetch sessions in the `load()` function**

Find in the `load()` function (around line 991):
```javascript
        const [stats, history, toolData, projects, costData] =
          await Promise.all([
            fetch("/api/stats").then((r) => r.json()),
            fetch("/api/history").then((r) => r.json()),
            fetch("/api/tool-calls").then((r) => r.json()),
            fetch("/api/projects").then((r) => r.json()),
            fetch("/api/daily-costs").then((r) => r.json()),
          ]);
```

Replace with:
```javascript
        const [stats, history, toolData, projects, costData, sessions] =
          await Promise.all([
            fetch("/api/stats").then((r) => r.json()),
            fetch("/api/history").then((r) => r.json()),
            fetch("/api/tool-calls").then((r) => r.json()),
            fetch("/api/projects").then((r) => r.json()),
            fetch("/api/daily-costs").then((r) => r.json()),
            fetch("/api/sessions").then((r) => r.json()),
          ]);
```

- [ ] **Step 3: Call renderSessions in the `load()` function**

Find (around line 1008):
```javascript
        renderHistory(history);
```

Insert AFTER that line:
```javascript
        renderSessions(sessions);
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add session list rendering with client-side search"
```

---

### Task 5: Frontend JS — Modal open/close and session detail rendering

**Files:**
- Modify: `index.html` (script section)

- [ ] **Step 1: Add modal functions**

Insert after the `shortName` function (added in Task 4):

```javascript
    async function openSession(sessionId) {
      const modal = document.getElementById('session-modal');
      const body = document.getElementById('modal-body');
      const title = document.getElementById('modal-title');
      const meta = document.getElementById('modal-meta');

      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      body.innerHTML = '<div class="modal-loading">Loading session data...</div>';
      title.textContent = 'Loading...';
      meta.textContent = '';

      try {
        const data = await fetch('/api/session/' + encodeURIComponent(sessionId)).then(r => r.json());

        if (data.error) {
          body.innerHTML = `<div class="modal-loading" style="color:var(--red)">Error: ${escapeHtml(data.error)}</div>`;
          return;
        }

        title.textContent = data.name || 'Untitled Session';
        const project = shortName(data.cwd);
        meta.innerHTML = `
          <span>${escapeHtml(project)}</span> · <span>${escapeHtml(data.branch || '—')}</span> ·
          <span>${data.duration || '—'}</span> ·
          <span>Created: ${data.createdAt ? data.createdAt.slice(0, 10) : '—'}</span>
          ${data.codeChanges ? ` · <span style="color:var(--green)">+${data.codeChanges.linesAdded}</span> <span style="color:var(--red)">-${data.codeChanges.linesRemoved}</span>` : ''}
        `;

        body.innerHTML = renderCostSection(data.cost) + renderTimeline(data.timeline);
      } catch (err) {
        body.innerHTML = `<div class="modal-loading" style="color:var(--red)">Failed to load session: ${escapeHtml(err.message)}</div>`;
      }
    }

    function renderCostSection(cost) {
      if (!cost || !cost.models || !Object.keys(cost.models).length) {
        return '<div class="cost-section"><h3>Cost Breakdown</h3><p style="color:var(--text-muted)">No cost data available</p></div>';
      }

      const models = Object.entries(cost.models).sort((a, b) => b[1].requests - a[1].requests);
      const rows = models.map(([model, info]) => `
        <tr>
          <td>${escapeHtml(model)}</td>
          <td>${info.requests}</td>
          <td>${fmt(info.inputTokens)}</td>
          <td>${fmt(info.outputTokens)}</td>
          <td>${fmt(info.cacheReadTokens)}</td>
          <td>$${info.estimatedCost.toFixed(4)}</td>
        </tr>
      `).join('');

      return `<div class="cost-section">
        <h3>💰 Cost Breakdown</h3>
        <table>
          <thead><tr><th>Model</th><th>Req</th><th>Input</th><th>Output</th><th>Cache Read</th><th>Est. Cost</th></tr></thead>
          <tbody>${rows}
            <tr class="cost-total">
              <td>TOTAL</td>
              <td>${models.reduce((s, [,m]) => s + m.requests, 0)}</td>
              <td>${fmt(models.reduce((s, [,m]) => s + m.inputTokens, 0))}</td>
              <td>${fmt(models.reduce((s, [,m]) => s + m.outputTokens, 0))}</td>
              <td>${fmt(models.reduce((s, [,m]) => s + m.cacheReadTokens, 0))}</td>
              <td>$${cost.estimatedTotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted)">Premium Requests: ${cost.premiumRequests}</div>
      </div>`;
    }

    function renderTimeline(timeline) {
      if (!timeline || !timeline.length) {
        return '<div class="timeline-section"><h3>Timeline</h3><p style="color:var(--text-muted)">No events recorded</p></div>';
      }

      const entries = timeline.map(e => {
        const time = e.timestamp ? e.timestamp.slice(11, 16) : '';
        let icon = '•';
        let text = '';

        switch (e.type) {
          case 'user.message':
            icon = '💬';
            text = `<span class="detail">${escapeHtml(e.content || '(empty)')}</span>`;
            break;
          case 'tool.execution_start':
            icon = '🔧';
            text = `<strong>${escapeHtml(e.tool || 'unknown')}</strong>${e.detail ? ` <span class="detail">→ ${escapeHtml(e.detail)}</span>` : ''}`;
            break;
          case 'tool.execution_complete':
            icon = e.success === true ? '✅' : e.success === false ? '❌' : '⬜';
            text = `<span class="detail">${escapeHtml(e.tool || '')} completed</span>`;
            break;
          case 'session.shutdown':
            icon = '🏁';
            text = `<span class="detail">Session ended (${e.premiumRequests} premium requests)</span>`;
            break;
          default:
            text = `<span class="detail">${escapeHtml(e.type)}</span>`;
        }

        return `<div class="timeline-entry">
          <span class="timeline-time">${time}</span>
          <span class="timeline-icon">${icon}</span>
          <span class="timeline-text">${text}</span>
        </div>`;
      }).join('');

      return `<div class="timeline-section"><h3>📋 Timeline (${timeline.length} events)</h3><div class="timeline-list">${entries}</div></div>`;
    }

    function closeModal() {
      document.getElementById('session-modal').classList.remove('open');
      document.body.style.overflow = '';
    }

    function closeModalBackdrop(event) {
      if (event.target === event.currentTarget) closeModal();
    }

```

- [ ] **Step 2: Add Escape key listener**

Find (around the end of script, before `initTheme();`):
```javascript
    initTheme();
```

Insert BEFORE that line:
```javascript
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add session detail modal with timeline and cost breakdown"
```

---

### Task 6: Smoke test

- [ ] **Step 1: Run the complete smoke test**

```bash
cd /Users/bs01080/Desktop/aihero/copilot-lens
lsof -ti:3456 | xargs kill -9 2>/dev/null
node server.js &
sleep 2

echo "=== Search input ==="
curl -s http://localhost:3456/ | grep -c "session-search-input"

echo "=== Modal container ==="
curl -s http://localhost:3456/ | grep -c "session-modal"

echo "=== JS functions ==="
curl -s http://localhost:3456/ | grep -c "openSession\|closeModal\|filterSessions\|renderTimeline\|renderCostSection"

echo "=== Session API ==="
SESSION_ID=$(ls ~/.copilot/session-state/ | head -1)
curl -s "http://localhost:3456/api/session/$SESSION_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'OK: {d[\"name\"][:40]} | {len(d[\"timeline\"])} events | cost=${d[\"cost\"][\"estimatedTotal\"]}')"

echo "=== Sessions list in load() ==="
curl -s http://localhost:3456/ | grep -c "renderSessions"

kill %1
```

Expected: All counts ≥ 1, API returns session with timeline and cost.

- [ ] **Step 2: Verify git log**

```bash
git --no-pager log --oneline -5
```

Expected: 4 new commits (endpoint, CSS, HTML, JS).

# copilot-lens UI & Docs Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-model breakdown table, cache hit rate progress ring, info tooltips, refresh button, and README cost/token documentation to copilot-lens.

**Architecture:** All UI changes are in `index.html` (CSS additions in `<style>`, HTML additions in `<body>`, JS additions in `<script>`). README changes are in `README.md`. No backend changes needed — all required data is already returned by `/api/stats` and `/api/daily-costs`. One small server.js change exposes per-model token counts.

**Tech Stack:** Vanilla HTML/CSS/JS, Express (minimal change), zero new dependencies.

---

## Files Modified

| File | What changes |
|------|-------------|
| `index.html` | CSS: tooltip + ring + refresh styles. HTML: refresh bar, info icons, model section. JS: `renderStatRows` (tooltip support), `renderCacheCards` (ring), `renderModelBreakdown`, `toggleSection`, `load()` (timestamp) |
| `server.js` | `/api/stats` modelBreakdown extended with per-model token counts |
| `README.md` | New sections: How Costs Are Calculated, Data Sources, example event JSON, rates note |

---

### Task 1: README — Cost Calculation & Data Sources Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the "How It Works" section with expanded version**

In `README.md`, find and replace the current "How It Works" section:

```markdown
## How It Works

copilot-lens reads data from `~/.copilot/session-state/`:

- **`workspace.yaml`** — Session metadata (project, branch, timestamps)
- **`events.jsonl`** — Event stream with token counts, tool calls, and `session.shutdown` analytics
- **`command-history-state.json`** — CLI command history

All processing happens locally. No data is sent anywhere.
```

Replace with:

```markdown
## How It Works

copilot-lens reads data directly from `~/.copilot/session-state/`:

### Data Sources

```
~/.copilot/session-state/<uuid>/
  ├── workspace.yaml              → project name, branch, cwd, timestamps
  ├── events.jsonl                → token counts, tool calls, premium requests
  │     event types used:
  │       session.shutdown        → aggregated token/cost/request totals
  │       user.message            → message count per session
  │       tool.execution_start    → tool call count + arguments
  │       tool.execution_complete → success/failure status per tool call
  └── (session.db — SQLite conversation store, not read by copilot-lens)

~/.copilot/command-history-state.json → CLI command history (string array)
```

### Example: `session.shutdown` event

This is the key analytics event — written by Copilot CLI at the end of every session:

```json
{
  "type": "session.shutdown",
  "timestamp": "2026-05-04T10:23:45.000Z",
  "data": {
    "totalPremiumRequests": 3.67,
    "totalApiDurationMs": 45230,
    "modelMetrics": {
      "claude-sonnet-4.6": {
        "requests": { "count": 12, "cost": 0.42 },
        "usage": {
          "inputTokens": 18420,
          "outputTokens": 3210,
          "cacheReadTokens": 62000,
          "cacheWriteTokens": 9800,
          "reasoningTokens": 0
        }
      }
    },
    "codeChanges": { "linesAdded": 84, "linesRemoved": 12, "filesModified": 3 }
  }
}
```

All processing happens locally. No data is sent anywhere.

## How Costs Are Calculated

### Premium Requests

Premium requests are **recorded by Copilot CLI itself** — not calculated by copilot-lens.
Each session ends with a `session.shutdown` event containing `totalPremiumRequests` (a float).
copilot-lens sums these values across all sessions.

Different models consume different premium request weights:
- `claude-opus-4.x` ≈ 3 premium requests per API call
- `claude-sonnet-4.x` ≈ 1 premium request per API call
- `gpt-4.1` ≈ 0 premium requests (included in base plan)

### Estimated USD Cost

USD cost is an **estimate** computed from raw token counts × configurable per-token rates:

```
cost = (inputTokens      × RATE_INPUT / 1,000,000)
     + (outputTokens     × RATE_OUTPUT / 1,000,000)
     + (cacheReadTokens  × RATE_CACHE_READ / 1,000,000)
     + (cacheWriteTokens × RATE_CACHE_CREATE / 1,000,000)
```

> ⚠️ This is **not** your actual GitHub Copilot subscription cost — it is an approximation for awareness based on underlying model API pricing. Override rates in `.env` to match your actual cloud provider.
```

- [ ] **Step 2: Add warning note below the Configuration rates table**

In `README.md`, find:
```
Default rates reflect **AWS Bedrock cross-region (ap-southeast-2)** pricing.
```

Replace with:
```markdown
Default rates reflect **AWS Bedrock cross-region (ap-southeast-2)** pricing.

> ⚠️ These rates are estimates. They do not reflect your actual GitHub Copilot subscription cost. Adjust to match your actual cloud provider pricing tier.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add cost calculation explainer, data sources, and event JSON example

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: CSS — Tooltip, Progress Ring, and Refresh Button Styles

**Files:**
- Modify: `index.html` (inside `<style>` tag, before `</style>`)

- [ ] **Step 1: Add CSS immediately before the closing `</style>` tag**

Find:
```css
    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: 1fr; }
      .cache-cards { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
```

Replace with:
```css
    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: 1fr; }
      .cache-cards { grid-template-columns: repeat(2, 1fr); }
    }

    /* Tooltip */
    .info-icon {
      display: inline-block;
      width: 14px;
      height: 14px;
      line-height: 14px;
      text-align: center;
      font-size: 0.65rem;
      color: #8b949e;
      border: 1px solid #30363d;
      border-radius: 50%;
      cursor: help;
      position: relative;
      margin-left: 4px;
      vertical-align: middle;
    }

    .info-icon::after {
      content: attr(data-tip);
      position: absolute;
      left: 20px;
      top: -4px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 0.72rem;
      color: #c9d1d9;
      white-space: normal;
      width: 260px;
      z-index: 100;
      display: none;
      line-height: 1.5;
    }

    .info-icon:hover::after { display: block; }

    /* Progress ring */
    .ring-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .ring {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: conic-gradient(#3fb950 calc(var(--pct, 0) * 1%), #21262d 0);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ring-inner {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #0d1117;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      color: #3fb950;
      font-weight: 700;
    }

    /* Refresh bar */
    .refresh-bar {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      font-size: 0.78rem;
      color: #8b949e;
    }

    .refresh-btn {
      background: #21262d;
      color: #c9d1d9;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 5px 12px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .refresh-btn:hover { background: #30363d; }

    /* Model breakdown section toggle */
    .section-toggle {
      cursor: pointer;
      user-select: none;
    }

    .section-toggle::before {
      content: "▾ ";
      font-size: 0.8em;
      color: #8b949e;
    }

    .section-toggle.collapsed::before { content: "▸ "; }
  </style>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "style: add tooltip, progress ring, refresh bar, and model section CSS

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: HTML — Refresh Bar and Model Breakdown Section

**Files:**
- Modify: `index.html` (inside `<body>`)

- [ ] **Step 1: Add refresh bar after `<h1>`**

Find:
```html
  <h1>🔭 Copilot Lens <span class="subtitle">— GitHub Copilot CLI Usage Dashboard</span></h1>

  <div id="summary-section">
```

Replace with:
```html
  <h1>🔭 Copilot Lens <span class="subtitle">— GitHub Copilot CLI Usage Dashboard</span></h1>

  <div class="refresh-bar">
    <span id="last-updated">Last updated: —</span>
    <button class="refresh-btn" onclick="load()">↻ Refresh</button>
  </div>

  <div id="summary-section">
```

- [ ] **Step 2: Add Model Breakdown section after `<div id="cache-cards"...>`**

Find:
```html
  <h2>Daily Breakdown</h2>
```

Replace with:
```html
  <h2 class="section-toggle" onclick="toggleSection('model-breakdown-body', this)">Model Breakdown</h2>
  <table id="model-breakdown-table">
    <thead>
      <tr>
        <th>Model</th>
        <th>Requests</th>
        <th>Input Tokens</th>
        <th>Output Tokens</th>
        <th>Cache Read</th>
        <th>Cache Write</th>
        <th>Est. Cost</th>
      </tr>
    </thead>
    <tbody id="model-breakdown-body"></tbody>
  </table>

  <h2>Daily Breakdown</h2>
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add refresh bar and model breakdown table HTML structure

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: JS — Tooltips, Progress Ring, Model Breakdown, Refresh Timestamp

**Files:**
- Modify: `index.html` (inside `<script>` tag)

- [ ] **Step 1: Update `renderStatRows` to render info tooltip icons**

Find:
```js
    function renderStatRows(container, data) {
      container.innerHTML = data
        .map(
          (r) =>
            `<div class="stat-row"><span class="label">${r.label}</span><span class="value ${r.cls || ""}">${r.value}</span></div>`
        )
        .join("");
    }
```

Replace with:
```js
    function renderStatRows(container, data) {
      container.innerHTML = data
        .map(
          (r) =>
            `<div class="stat-row">
              <span class="label">${r.label}${r.tip ? `<span class="info-icon" data-tip="${r.tip}">i</span>` : ""}</span>
              <span class="value ${r.cls || ""}">${r.value}</span>
            </div>`
        )
        .join("");
    }
```

- [ ] **Step 2: Add tooltip `tip` property to Premium Requests and Est. Cost in both `renderStatRows` calls inside `renderSummary`**

Find the first `renderStatRows` call (today panel):
```js
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
```

Replace with:
```js
      renderStatRows(document.getElementById("today-stats"), [
        { label: "Sessions", value: todayData.sessions },
        { label: "Messages", value: todayData.messages },
        { label: "Tool Calls", value: todayData.toolCalls },
        {
          label: "Premium Requests",
          value: todayData.premiumRequests,
          cls: "highlight",
          tip: "Tracked by Copilot CLI — recorded in session.shutdown events. Not calculated by copilot-lens.",
        },
        {
          label: "Est. Cost",
          value: "$" + todayData.estimatedCost.toFixed(2),
          cls: "orange",
          tip: "Estimated from token counts × configurable rates (default: AWS Bedrock ap-southeast-2). Not official Copilot billing.",
        },
        { label: "Cache Hit Rate", value: todayHitRate, cls: "green" },
      ]);
```

Find the second `renderStatRows` call (all-time panel):
```js
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
```

Replace with:
```js
      renderStatRows(document.getElementById("alltime-stats"), [
        { label: "Sessions", value: t.sessions },
        { label: "Messages", value: t.messages },
        { label: "Tool Calls", value: t.toolCalls },
        {
          label: "Premium Requests",
          value: t.premiumRequests,
          cls: "highlight",
          tip: "Tracked by Copilot CLI — recorded in session.shutdown events. Not calculated by copilot-lens.",
        },
        {
          label: "Est. Cost",
          value: "$" + t.estimatedCost.toFixed(2),
          cls: "orange",
          tip: "Estimated from token counts × configurable rates (default: AWS Bedrock ap-southeast-2). Not official Copilot billing.",
        },
        { label: "Cache Hit Rate", value: allHitRate, cls: "green" },
      ]);
```

- [ ] **Step 3: Replace `renderCacheCards` with progress ring version**

Find the entire `renderCacheCards` function:
```js
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
```

Replace with:
```js
    function renderCacheCards(costData) {
      const t = costData.totals;
      const totalInput = t.input + t.cacheRead + t.cacheWrite;
      const hitRateNum = totalInput ? (t.cacheRead / totalInput) * 100 : 0;
      const hitRate = hitRateNum.toFixed(1);
      const withCache = t.estimatedCost;
      const noCacheCost =
        (t.input + t.cacheRead + t.cacheWrite) * (costData.rates.input / 1e6) +
        t.output * (costData.rates.output / 1e6);
      const noCacheRounded = Math.round(noCacheCost * 100) / 100;
      const saved = Math.round((noCacheRounded - withCache) * 100) / 100;

      const ringCard = `<div class="cache-card ring-card">
        <div class="ring" style="--pct: ${hitRate}">
          <div class="ring-inner">${hitRate}%</div>
        </div>
        <div class="card-label" style="margin-top:8px">Cache Hit Rate</div>
      </div>`;

      const otherCards = [
        { value: "$" + withCache.toFixed(2), label: "Cost (with cache)" },
        { value: "$" + noCacheRounded.toFixed(2), label: "Cost (no cache)" },
        { value: "$" + Math.max(0, saved).toFixed(2), label: "Savings" },
      ]
        .map(
          (c) =>
            `<div class="cache-card"><div class="card-value">${c.value}</div><div class="card-label">${c.label}</div></div>`
        )
        .join("");

      document.getElementById("cache-cards").innerHTML = ringCard + otherCards;
    }
```

- [ ] **Step 4: Add `toggleSection` and `renderModelBreakdown` functions before `let currentToolData = null`**

Find:
```js
    let currentToolData = null;
```

Insert immediately before it:
```js
    function toggleSection(bodyId, header) {
      const body = document.getElementById(bodyId);
      const table = body ? body.closest("table") : null;
      if (!table) return;
      const hidden = table.style.display === "none";
      table.style.display = hidden ? "" : "none";
      header.classList.toggle("collapsed", !hidden);
    }

    function renderModelBreakdown(stats, rates) {
      const body = document.getElementById("model-breakdown-body");
      if (!body) return;
      const breakdown = stats.modelBreakdown || {};
      const entries = Object.entries(breakdown).sort(
        (a, b) => b[1].requests - a[1].requests
      );

      if (!entries.length) {
        body.innerHTML =
          '<tr><td colspan="7" style="color:#8b949e;text-align:center">No model data</td></tr>';
        return;
      }

      const r = rates || { input: 5, output: 25, cacheRead: 0.5, cacheCreate: 6.25 };
      body.innerHTML = entries
        .map(([model, info]) => {
          const cost =
            (info.inputTokens || 0) * (r.input / 1e6) +
            (info.outputTokens || 0) * (r.output / 1e6) +
            (info.cacheReadTokens || 0) * (r.cacheRead / 1e6) +
            (info.cacheWriteTokens || 0) * (r.cacheCreate / 1e6);
          return `<tr>
            <td>${escapeHtml(model)}</td>
            <td>${info.requests || 0}</td>
            <td>${fmt(info.inputTokens || 0)}</td>
            <td>${fmt(info.outputTokens || 0)}</td>
            <td>${fmt(info.cacheReadTokens || 0)}</td>
            <td>${fmt(info.cacheWriteTokens || 0)}</td>
            <td>$${cost.toFixed(4)}</td>
          </tr>`;
        })
        .join("");
    }

    let currentToolData = null;
```

- [ ] **Step 5: Update `load()` to call `renderModelBreakdown` and set timestamp**

Find the entire `load` function:
```js
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
```

Replace with:
```js
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
        renderModelBreakdown(stats, costData.rates);
        renderDailyCosts(costData);
        renderTools(toolData);
        renderProjects(projects);
        renderHistory(history);

        const el = document.getElementById("last-updated");
        if (el) el.textContent = "Last updated: " + new Date().toLocaleTimeString();
      } catch (err) {
        document.body.innerHTML +=
          '<div class="empty-state">Error loading dashboard: ' +
          escapeHtml(err.message) +
          "</div>";
      }
    }
```

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add info tooltips, progress ring, model breakdown JS, refresh timestamp

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Server — Expose Per-Model Token Counts in `/api/stats`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Extend modelBreakdown to carry per-model token sums**

Find this block inside the `/api/stats` endpoint:
```js
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
```

Replace with:
```js
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
```

- [ ] **Step 2: Verify endpoint returns token counts per model**

```bash
node server.js &
sleep 2
curl -s http://localhost:3456/api/stats | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const entries = Object.entries(d.modelBreakdown);
  if (entries.length) {
    const [model, info] = entries[0];
    console.log('Model:', model);
    console.log('inputTokens:', info.inputTokens);
    console.log('outputTokens:', info.outputTokens);
    console.log('cacheReadTokens:', info.cacheReadTokens);
  } else {
    console.log('No model data found');
  }
" && kill %1
```

Expected: Model name printed with numeric token values (non-zero if session data exists).

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: expose per-model token counts in /api/stats modelBreakdown

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

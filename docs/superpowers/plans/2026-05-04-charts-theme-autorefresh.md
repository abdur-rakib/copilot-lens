# copilot-lens: Charts, Theme Toggle & Auto-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chart.js line + donut charts, dark/light theme with system detection and manual toggle, and 30-second auto-refresh to the copilot-lens dashboard.

**Architecture:** All changes in `index.html` only — Chart.js loaded via CDN, CSS refactored to custom properties for theming, JS extended with chart renderers + theme + auto-refresh timer. No server changes.

**Tech Stack:** Chart.js 4 (CDN), CSS custom properties, vanilla JS, localStorage for theme persistence.

---

## Files Modified

| File | What changes |
|------|-------------|
| `index.html` | Add Chart.js CDN, refactor CSS to custom properties, add theme button + chart canvases to HTML, add `applyTheme`/`initTheme`/`toggleTheme`, `scheduleRefresh`/`cancelRefresh`, `modelColor`, `renderUsageChart`, `renderModelDonut`, update `load()` and refresh button |

---

### Task 1: Add Chart.js CDN and CSS Custom Properties

**Files:**
- Modify: `index.html`

This task converts all hardcoded colors to CSS custom properties and injects Chart.js. It must come first — all subsequent tasks depend on the variable names defined here.

- [ ] **Step 1: Add Chart.js CDN script tag to `<head>`**

Find:
```html
  <title>Copilot Lens — Usage Dashboard</title>
  <style>
```

Replace with:
```html
  <title>Copilot Lens — Usage Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
```

- [ ] **Step 2: Add CSS custom property theme definitions at the top of `<style>`**

Find the very start of the `<style>` block:
```css
    * { margin: 0; padding: 0; box-sizing: border-box; }
```

Insert immediately before it:
```css
    :root, :root[data-theme="dark"] {
      --bg: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --bg-hover: #1c2128;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-dark: #1f6feb;
      --green: #3fb950;
      --orange: #d29922;
      --red: #f85149;
    }

    :root[data-theme="light"] {
      --bg: #ffffff;
      --bg-secondary: #f6f8fa;
      --bg-tertiary: #eaeef2;
      --bg-hover: #f3f4f6;
      --border: #d0d7de;
      --text: #24292f;
      --text-muted: #57606a;
      --accent: #0969da;
      --accent-dark: #0550ae;
      --green: #1a7f37;
      --orange: #9a6700;
      --red: #cf222e;
    }

```

- [ ] **Step 3: Replace hardcoded colors with CSS variables throughout `<style>`**

Make these replacements in the CSS section (all within the `<style>` block). Apply each find/replace carefully:

**body:**
```css
/* FIND */
    body {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
      line-height: 1.6;
    }
/* REPLACE */
    body {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.6;
    }
```

**h1:**
```css
/* FIND */
    h1 {
      font-size: 1.5rem;
      color: #58a6ff;
      margin-bottom: 8px;
    }
/* REPLACE */
    h1 {
      font-size: 1.5rem;
      color: var(--accent);
      margin-bottom: 8px;
    }
```

**h1 .subtitle:**
```css
/* FIND */
    h1 .subtitle {
      font-size: 0.85rem;
      color: #8b949e;
      font-weight: normal;
    }
/* REPLACE */
    h1 .subtitle {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: normal;
    }
```

**h2:**
```css
/* FIND */
    h2 {
      font-size: 1.1rem;
      color: #c9d1d9;
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #21262d;
    }
/* REPLACE */
    h2 {
      font-size: 1.1rem;
      color: var(--text);
      margin: 24px 0 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--bg-tertiary);
    }
```

**summary-panel:**
```css
/* FIND */
    .summary-panel {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px;
    }
/* REPLACE */
    .summary-panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
```

**summary-panel h3:**
```css
/* FIND */
    .summary-panel h3 {
      font-size: 0.9rem;
      color: #8b949e;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
/* REPLACE */
    .summary-panel h3 {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
```

**stat-row labels/values:**
```css
/* FIND */
    .stat-row .label { color: #8b949e; }
    .stat-row .value { color: #c9d1d9; font-weight: 600; }
    .stat-row .value.highlight { color: #58a6ff; }
    .stat-row .value.green { color: #3fb950; }
    .stat-row .value.orange { color: #d29922; }
/* REPLACE */
    .stat-row .label { color: var(--text-muted); }
    .stat-row .value { color: var(--text); font-weight: 600; }
    .stat-row .value.highlight { color: var(--accent); }
    .stat-row .value.green { color: var(--green); }
    .stat-row .value.orange { color: var(--orange); }
```

**cache-card:**
```css
/* FIND */
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
/* REPLACE */
    .cache-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      text-align: center;
    }

    .cache-card .card-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--accent);
    }

    .cache-card .card-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }
```

**table/th/td:**
```css
/* FIND */
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
/* REPLACE */
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 16px;
      font-size: 0.8rem;
    }

    th {
      background: var(--bg-tertiary);
      color: var(--text-muted);
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td {
      padding: 8px 12px;
      border-top: 1px solid var(--bg-tertiary);
      color: var(--text);
    }

    tr:hover td { background: var(--bg-hover); }
```

**bar:**
```css
/* FIND */
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
/* REPLACE */
    .bar {
      height: 20px;
      background: var(--accent-dark);
      border-radius: 3px;
      min-width: 2px;
    }

    .bar-count {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 0.8rem;
      color: var(--text-muted);
    }
```

**tool-row/tool-detail:**
```css
/* FIND */
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
/* REPLACE */
    .tool-row:hover td { background: var(--bg-hover); }

    .tool-detail {
      display: none;
      background: var(--bg);
    }

    .tool-detail td {
      padding: 6px 12px 6px 32px;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
```

**success-badge:**
```css
/* FIND */
    .success-badge.pass { color: #3fb950; }
    .success-badge.fail { color: #f85149; }
/* REPLACE */
    .success-badge.pass { color: var(--green); }
    .success-badge.fail { color: var(--red); }
```

**history-list/item:**
```css
/* FIND */
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
/* REPLACE */
    .history-list {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      max-height: 400px;
      overflow-y: auto;
    }

    .history-item {
      padding: 6px 8px;
      font-size: 0.8rem;
      border-bottom: 1px solid var(--bg-tertiary);
      color: var(--text);
    }

    .history-item:last-child { border-bottom: none; }
```

**model-badge:**
```css
/* FIND */
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
/* REPLACE */
    .model-badge {
      display: inline-block;
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2px 8px;
      margin: 2px 4px 2px 0;
      font-size: 0.7rem;
      color: var(--text-muted);
    }
```

**empty-state:**
```css
/* FIND */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #8b949e;
      font-size: 0.9rem;
    }
/* REPLACE */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: var(--text-muted);
      font-size: 0.9rem;
    }
```

**export-btn:**
```css
/* FIND */
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
/* REPLACE */
    .export-btn {
      background: var(--bg-tertiary);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 14px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .export-btn:hover { background: var(--border); }
```

**info-icon tooltip:**
```css
/* FIND */
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
/* REPLACE */
    .info-icon {
      display: inline-block;
      width: 14px;
      height: 14px;
      line-height: 14px;
      text-align: center;
      font-size: 0.65rem;
      color: var(--text-muted);
      border: 1px solid var(--border);
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
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 0.72rem;
      color: var(--text);
      white-space: normal;
      width: 260px;
      z-index: 100;
      display: none;
      line-height: 1.5;
    }
```

**ring:**
```css
/* FIND */
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
/* REPLACE */
    .ring {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: conic-gradient(var(--green) calc(var(--pct, 0) * 1%), var(--bg-tertiary) 0);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ring-inner {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: var(--bg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      color: var(--green);
      font-weight: 700;
    }
```

**refresh-btn:**
```css
/* FIND */
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
/* REPLACE */
    .refresh-btn {
      background: var(--bg-tertiary);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 5px 12px;
      font-family: inherit;
      font-size: 0.75rem;
      cursor: pointer;
    }

    .refresh-btn:hover { background: var(--border); }
```

**section-toggle:**
```css
/* FIND */
    .section-toggle::before {
      content: "▾ ";
      font-size: 0.8em;
      color: #8b949e;
    }

    .section-toggle.collapsed::before { content: "▸ "; }
/* REPLACE */
    .section-toggle::before {
      content: "▾ ";
      font-size: 0.8em;
      color: var(--text-muted);
    }

    .section-toggle.collapsed::before { content: "▸ "; }
```

- [ ] **Step 4: Verify the page still loads with no visual regressions**

```bash
cd /path/to/copilot-lens
node server.js &
sleep 2
curl -s http://localhost:3456/ | grep -c "var(--"
kill %1
```
Expected: count > 30 (many CSS variable references present).

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: convert CSS to custom properties + add Chart.js CDN

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Theme Toggle — HTML, CSS, and JS

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add chart card and theme button CSS before closing `</style>`**

Find:
```css
    .section-toggle.collapsed::before { content: "▸ "; }
  </style>
```

Replace with:
```css
    .section-toggle.collapsed::before { content: "▸ "; }

    /* Chart containers */
    .chart-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    /* Model breakdown: table + donut side by side */
    .model-breakdown-layout {
      display: grid;
      grid-template-columns: 1fr 240px;
      gap: 16px;
      align-items: start;
      margin-bottom: 16px;
    }

    /* Theme toggle button */
    .theme-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }

    .theme-btn:hover { background: var(--bg-tertiary); }

    @media (max-width: 768px) {
      .model-breakdown-layout { grid-template-columns: 1fr; }
    }
  </style>
```

- [ ] **Step 2: Add theme toggle button to the refresh bar**

Find:
```html
  <div class="refresh-bar">
    <span id="last-updated">Last updated: —</span>
    <button class="refresh-btn" onclick="load()">↻ Refresh</button>
  </div>
```

Replace with:
```html
  <div class="refresh-bar">
    <button class="theme-btn" id="theme-toggle" onclick="toggleTheme()" title="Toggle theme">🌙</button>
    <span id="last-updated">Last updated: —</span>
    <button class="refresh-btn" id="refresh-btn" onclick="cancelRefresh(); load()">↻ Refresh</button>
  </div>
```

Note: The refresh button now calls `cancelRefresh(); load()` to cancel the pending auto-refresh timer before triggering an immediate reload.

- [ ] **Step 3: Add theme JS functions before `function fmt`**

Find:
```js
    function fmt(n) {
```

Insert immediately before it:
```js
    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      localStorage.setItem('copilot-lens-theme', theme);
    }

    function initTheme() {
      const saved = localStorage.getItem('copilot-lens-theme');
      if (saved) { applyTheme(saved); return; }
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
      if (usageChartInstance) { usageChartInstance.destroy(); usageChartInstance = null; }
      if (modelDonutInstance) { modelDonutInstance.destroy(); modelDonutInstance = null; }
      load();
    }

    function fmt(n) {
```

- [ ] **Step 4: Call `initTheme()` before `load()` at the bottom of the script**

Find:
```js
    load();
  </script>
```

Replace with:
```js
    initTheme();
    load();
  </script>
```

- [ ] **Step 5: Verify theme toggle works**

```bash
node server.js &
sleep 2
curl -s http://localhost:3456/ | grep -c "theme-toggle\|applyTheme\|initTheme\|toggleTheme"
kill %1
```
Expected: `4`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add dark/light theme toggle with system detection and localStorage

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Auto-Refresh (30-second rolling timer)

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Declare chart instance variables and refresh timer before `applyTheme`**

Find:
```js
    function applyTheme(theme) {
```

Insert immediately before it:
```js
    let usageChartInstance = null;
    let modelDonutInstance = null;
    let refreshTimer = null;

    function scheduleRefresh() {
      cancelRefresh();
      refreshTimer = setTimeout(() => load(), 30000);
    }

    function cancelRefresh() {
      if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
    }

    function applyTheme(theme) {
```

- [ ] **Step 2: Add `scheduleRefresh()` at the end of the `load()` try block**

Find:
```js
        const el = document.getElementById("last-updated");
        if (el) el.textContent = "Last updated: " + new Date().toLocaleTimeString();
      } catch (err) {
```

Replace with:
```js
        const el = document.getElementById("last-updated");
        if (el) el.textContent = "Last updated: " + new Date().toLocaleTimeString();
        scheduleRefresh();
      } catch (err) {
```

- [ ] **Step 3: Verify auto-refresh variables present**

```bash
node server.js &
sleep 2
curl -s http://localhost:3456/ | grep -c "scheduleRefresh\|cancelRefresh\|refreshTimer"
kill %1
```
Expected: `5` or more (declarations + calls).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add 30-second auto-refresh with rolling timer

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Daily Usage Line Chart

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Usage Trends section HTML after Daily Breakdown table**

Find:
```html
  <h2>Tool Call Analytics <button class="export-btn" onclick="exportToolCalls()">Export</button></h2>
```

Insert immediately before it:
```html
  <h2>Usage Trends</h2>
  <div class="chart-card">
    <canvas id="usage-chart" height="120"></canvas>
  </div>

```

- [ ] **Step 2: Add `renderUsageChart` function before `let currentToolData = null`**

Find:
```js
    let currentToolData = null;
```

Insert immediately before it:
```js
    function getChartTextColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#8b949e';
    }

    function getChartGridColor() {
      return getComputedStyle(document.documentElement).getPropertyValue('--bg-tertiary').trim() || '#21262d';
    }

    function renderUsageChart(costData) {
      const days = [...costData.days].reverse(); // chronological order
      const labels = days.map(d => d.date.slice(5)); // MM-DD
      const textColor = getChartTextColor();
      const gridColor = getChartGridColor();

      if (usageChartInstance) { usageChartInstance.destroy(); usageChartInstance = null; }

      const ctx = document.getElementById('usage-chart');
      if (!ctx) return;

      usageChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Sessions',
              data: days.map(d => d.sessions),
              borderColor: '#58a6ff',
              backgroundColor: 'rgba(88,166,255,0.1)',
              tension: 0.3,
              yAxisID: 'y',
              pointRadius: 3,
            },
            {
              label: 'Messages',
              data: days.map(d => d.messages),
              borderColor: '#3fb950',
              backgroundColor: 'rgba(63,185,80,0.1)',
              tension: 0.3,
              yAxisID: 'y1',
              pointRadius: 3,
            },
            {
              label: 'Tool Calls',
              data: days.map(d => d.toolCalls),
              borderColor: '#d29922',
              backgroundColor: 'rgba(210,153,34,0.1)',
              tension: 0.3,
              yAxisID: 'y1',
              pointRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, font: { size: 11 }, boxWidth: 12 },
            },
          },
          scales: {
            x: {
              ticks: { color: textColor, font: { size: 10 } },
              grid: { color: gridColor },
            },
            y: {
              position: 'left',
              title: { display: true, text: 'Sessions', color: textColor, font: { size: 10 } },
              ticks: { color: textColor, font: { size: 10 } },
              grid: { color: gridColor },
            },
            y1: {
              position: 'right',
              title: { display: true, text: 'Messages / Tool Calls', color: textColor, font: { size: 10 } },
              ticks: { color: textColor, font: { size: 10 } },
              grid: { drawOnChartArea: false },
            },
          },
        },
      });
    }

    let currentToolData = null;
```

- [ ] **Step 3: Call `renderUsageChart` inside `load()`**

Find:
```js
        renderModelBreakdown(stats, costData.rates);
        renderDailyCosts(costData);
```

Replace with:
```js
        renderModelBreakdown(stats, costData.rates);
        renderUsageChart(costData);
        renderDailyCosts(costData);
```

- [ ] **Step 4: Verify chart canvas and function present**

```bash
node server.js &
sleep 2
curl -s http://localhost:3456/ | grep -c "usage-chart\|renderUsageChart\|usageChartInstance"
kill %1
```
Expected: `4` or more.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add daily usage line chart (sessions, messages, tool calls)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Model Usage Donut Chart

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace Model Breakdown table with layout wrapper containing table + donut canvas**

Find:
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
```

Replace with:
```html
  <h2 class="section-toggle" onclick="toggleSection('model-breakdown-body', this)">Model Breakdown</h2>
  <div class="model-breakdown-layout" id="model-breakdown-layout">
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
    <div class="chart-card" style="text-align:center">
      <canvas id="model-donut" width="200" height="200"></canvas>
    </div>
  </div>
```

Note: `toggleSection` currently targets `model-breakdown-body` and hides its closest `<table>`. Update the toggle to hide the whole layout div instead.

- [ ] **Step 2: Update `toggleSection` to work with the layout wrapper**

Find:
```js
    function toggleSection(bodyId, header) {
      const body = document.getElementById(bodyId);
      const table = body ? body.closest("table") : null;
      if (!table) return;
      const hidden = table.style.display === "none";
      table.style.display = hidden ? "" : "none";
      header.classList.toggle("collapsed", !hidden);
    }
```

Replace with:
```js
    function toggleSection(bodyId, header) {
      const body = document.getElementById(bodyId);
      const container = body ? (body.closest(".model-breakdown-layout") || body.closest("table")) : null;
      if (!container) return;
      const hidden = container.style.display === "none";
      container.style.display = hidden ? "" : "none";
      header.classList.toggle("collapsed", !hidden);
    }
```

- [ ] **Step 3: Add `modelColor` and `renderModelDonut` functions before `let currentToolData = null`**

Find:
```js
    let currentToolData = null;
```

Insert immediately before it:
```js
    function modelColor(name) {
      const n = (name || '').toLowerCase();
      if (n.includes('opus'))   return '#a371f7';
      if (n.includes('sonnet')) return '#58a6ff';
      if (n.includes('haiku'))  return '#3fb950';
      if (n.includes('gpt'))    return '#f0883e';
      return '#8b949e';
    }

    function renderModelDonut(stats) {
      const breakdown = stats.modelBreakdown || {};
      const entries = Object.entries(breakdown)
        .filter(([, info]) => (info.requests || 0) > 0)
        .sort((a, b) => b[1].requests - a[1].requests);

      if (modelDonutInstance) { modelDonutInstance.destroy(); modelDonutInstance = null; }

      const ctx = document.getElementById('model-donut');
      if (!ctx || !entries.length) return;

      const textColor = getChartTextColor();

      modelDonutInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: entries.map(([m]) => m),
          datasets: [{
            data: entries.map(([, info]) => info.requests || 0),
            backgroundColor: entries.map(([m]) => modelColor(m)),
            borderWidth: 1,
            borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0d1117',
          }],
        },
        options: {
          responsive: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: textColor,
                font: { size: 10 },
                boxWidth: 10,
                padding: 8,
              },
            },
          },
        },
      });
    }

    let currentToolData = null;
```

- [ ] **Step 4: Call `renderModelDonut` inside `load()`**

Find:
```js
        renderModelBreakdown(stats, costData.rates);
        renderUsageChart(costData);
```

Replace with:
```js
        renderModelBreakdown(stats, costData.rates);
        renderModelDonut(stats);
        renderUsageChart(costData);
```

- [ ] **Step 5: Verify donut canvas and function present**

```bash
node server.js &
sleep 2
curl -s http://localhost:3456/ | grep -c "model-donut\|renderModelDonut\|modelDonutInstance\|modelColor"
kill %1
```
Expected: `5` or more.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add model usage donut chart with per-model color coding

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Final Smoke Test

**Files:** No changes — verification only.

- [ ] **Step 1: Start server and run end-to-end checks**

```bash
cd /path/to/copilot-lens
node server.js &
sleep 2

echo "=== HTML elements ==="
curl -s http://localhost:3456/ | grep -c "usage-chart\|model-donut\|theme-toggle\|last-updated\|refresh-btn"

echo "=== JS functions ==="
curl -s http://localhost:3456/ | grep -c "applyTheme\|initTheme\|toggleTheme\|scheduleRefresh\|renderUsageChart\|renderModelDonut"

echo "=== CSS variables ==="
curl -s http://localhost:3456/ | grep -c "var(--"

echo "=== Chart.js CDN ==="
curl -s http://localhost:3456/ | grep -c "chart.js"

kill %1
```

Expected outputs:
- HTML elements: `5`
- JS functions: `6`
- CSS variables: `30` or more
- Chart.js CDN: `1`

- [ ] **Step 2: Verify git log shows all commits**

```bash
git --no-pager log --oneline -6
```

Expected (most recent first):
```
<sha> feat: add model usage donut chart with per-model color coding
<sha> feat: add daily usage line chart (sessions, messages, tool calls)
<sha> feat: add 30-second auto-refresh with rolling timer
<sha> feat: add dark/light theme toggle with system detection and localStorage
<sha> refactor: convert CSS to custom properties + add Chart.js CDN
```

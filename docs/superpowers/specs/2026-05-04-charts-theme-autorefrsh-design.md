# copilot-lens: Charts, Theme Toggle & Auto-Refresh Design

**Date:** 2026-05-04
**Status:** Approved
**Sub-project:** 1 of 4 (Charts & Visualization)

---

## Goal

Add real data visualizations, system-aware dark/light theming, and auto-refresh to copilot-lens — increasing daily usefulness and shareability without breaking the zero-install npx experience.

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Daily usage line chart (Chart.js) | Session drill-down (sub-project 2) |
| Model usage donut chart | Streaks/productivity (sub-project 3) |
| Dark/light theme with system detection + manual toggle | AI insights (sub-project 4) |
| Auto-refresh every 30 seconds | New API endpoints |
| localStorage theme preference | Server changes |

---

## Architecture

All changes are in `index.html` only. Chart.js loaded from CDN — no npm dep, npx continues to work.

```
index.html
  <head>
    + <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
    CSS: replace hardcoded colors with CSS custom properties
         add .theme-toggle button styles
         add chart container styles
  <body>
    refresh bar: + theme toggle button (☀️/🌙)
    model breakdown section: + canvas for donut chart (side-by-side with table)
    + new "Usage Trends" section with line chart canvas
  <script>
    + CSS variable theme system (applyTheme, initTheme)
    + auto-refresh loop (scheduleRefresh, cancelRefresh)
    + renderUsageChart(costData)
    + renderModelDonut(stats)
    update: load() calls renderUsageChart + renderModelDonut, schedules next refresh
    update: refresh button cancels timer then calls load()
```

No changes to `server.js`.

---

## Feature 1: Daily Usage Line Chart

**Location:** New `<section>` after the Daily Breakdown table, titled "Usage Trends".

**Canvas:** `<canvas id="usage-chart" height="120"></canvas>` inside a card container.

**Data source:** `/api/daily-costs` → `days[]` array (already returned, sorted newest-first — reverse for chronological display).

**Datasets (3 lines):**
| Dataset | Color | Y-axis |
|---------|-------|--------|
| Sessions | `#58a6ff` (blue) | left (y) |
| Messages | `#3fb950` (green) | right (y1) |
| Tool Calls | `#d29922` (orange) | right (y1) |

**Chart.js config:**
```js
{
  type: 'line',
  data: { labels: [...dates], datasets: [...] },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top' } },
    scales: {
      y:  { position: 'left',  title: { display: true, text: 'Sessions' } },
      y1: { position: 'right', title: { display: true, text: 'Messages / Tool Calls' }, grid: { drawOnChartArea: false } }
    }
  }
}
```

**Chart instance management:** Store in `let usageChartInstance = null`. Before re-rendering, call `usageChartInstance.destroy()` if it exists, then create new. This prevents duplicate canvas errors on refresh.

---

## Feature 2: Model Usage Donut Chart

**Location:** Inside the Model Breakdown section, displayed side-by-side with the table on desktop (CSS grid: `1fr 220px`), stacked on mobile.

**Canvas:** `<canvas id="model-donut" width="220" height="220"></canvas>`

**Data source:** `/api/stats` → `modelBreakdown` (already has per-model `requests` count).

**Colors:** Deterministic by model family substring:
```js
function modelColor(name) {
  if (name.includes('opus'))   return '#a371f7'; // purple
  if (name.includes('sonnet')) return '#58a6ff'; // blue
  if (name.includes('haiku'))  return '#3fb950'; // green
  if (name.includes('gpt'))    return '#f0883e'; // orange
  return '#8b949e';                              // gray fallback
}
```

**Chart.js config:**
```js
{
  type: 'doughnut',
  data: {
    labels: modelNames,
    datasets: [{ data: requestCounts, backgroundColor: colors, borderWidth: 1 }]
  },
  options: {
    responsive: false,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }
    }
  }
}
```

**Instance management:** Same pattern — `let modelDonutInstance = null`, destroy before recreate.

---

## Feature 3: Theme Toggle (Dark/Light + System Detection)

**CSS custom properties:** Replace all hardcoded color values in `<style>` with variables:

| Variable | Dark value | Light value |
|----------|-----------|-------------|
| `--bg` | `#0d1117` | `#ffffff` |
| `--bg-secondary` | `#161b22` | `#f6f8fa` |
| `--bg-tertiary` | `#21262d` | `#eaeef2` |
| `--border` | `#30363d` | `#d0d7de` |
| `--text` | `#c9d1d9` | `#24292f` |
| `--text-muted` | `#8b949e` | `#57606a` |
| `--accent` | `#58a6ff` | `#0969da` |
| `--green` | `#3fb950` | `#1a7f37` |
| `--orange` | `#d29922` | `#9a6700` |
| `--red` | `#f85149` | `#cf222e` |

Themes defined as:
```css
:root[data-theme="dark"]  { --bg: #0d1117; ... }
:root[data-theme="light"] { --bg: #ffffff; ... }
```

Default applied to `<html>` element (not `<body>`) so Chart.js canvas also inherits.

**Toggle button:** In the refresh bar, left of the last-updated span:
```html
<button class="theme-btn" id="theme-toggle" onclick="toggleTheme()" title="Toggle theme">🌙</button>
```

**JS functions:**
```js
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('copilot-lens-theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('copilot-lens-theme');
  if (saved) { applyTheme(saved); return; }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Redraw charts to pick up new colors
  if (usageChartInstance) usageChartInstance.destroy(), usageChartInstance = null;
  if (modelDonutInstance) modelDonutInstance.destroy(), modelDonutInstance = null;
  load();
}
```

`initTheme()` called before `load()` on page load.

---

## Feature 4: Auto-Refresh

**Mechanism:** Rolling 30s timer, re-scheduled at end of each `load()` call.

```js
let refreshTimer = null;

function scheduleRefresh() {
  cancelRefresh();
  refreshTimer = setTimeout(() => load(), 30000);
}

function cancelRefresh() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
}
```

**Refresh button update:** `onclick="cancelRefresh(); load()"` — cancel pending timer, reload immediately.

**load() update:** Add `scheduleRefresh()` at the end of the try block (after all renders complete).

---

## CSS Additions

```css
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

@media (max-width: 768px) {
  .model-breakdown-layout { grid-template-columns: 1fr; }
}
```

---

## Files Changed

| File | Changes |
|------|---------|
| `index.html` | Add Chart.js CDN script tag, refactor CSS to custom properties, add chart canvases, add theme toggle button, add JS for charts + theme + auto-refresh |

No changes to `server.js`.

---

## Non-Goals

- No new API endpoints
- No server changes
- No npm dependencies (Chart.js via CDN only)
- No session drill-down, streaks, or AI insights (separate sub-projects)

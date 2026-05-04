# Streaks & Productivity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub-style contribution heatmap, streak counters, and productivity insights (peak hours, avg session length, busiest weekday) to the copilot-lens dashboard.

**Architecture:** One new API endpoint (`GET /api/activity`) computes per-day activity, streaks, hourly distribution, and weekday stats. Frontend renders a CSS grid heatmap with metric toggle, streak cards, and productivity stat cards. Pure CSS/HTML — no additional libraries.

**Tech Stack:** Express (existing), vanilla HTML/CSS/JS (existing), CSS custom properties for theming.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `server.js` (modify: insert before `app.listen()` at line 773) | Add `/api/activity` endpoint |
| `index.html` (modify: CSS before `</style>` at line 610) | Heatmap, streak, and productivity CSS |
| `index.html` (modify: HTML before "Tool Call Analytics" at line 686) | Activity section HTML |
| `index.html` (modify: JS in script section) | Activity rendering, heatmap toggle, load() integration |

---

### Task 1: Backend — `/api/activity` endpoint

**Files:**
- Modify: `server.js` (insert before line 773 `app.listen()`)

- [ ] **Step 1: Add the `/api/activity` endpoint**

Insert before `app.listen(PORT, () => {` in server.js:

```javascript
app.get("/api/activity", async (req, res) => {
  try {
    const sessionDirs = getSessionDirs();
    const days = {};
    const hourly = new Array(24).fill(0);
    const weekday = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let totalDuration = 0;
    let durationCount = 0;

    for (const dir of sessionDirs) {
      const ws = readWorkspace(dir);
      if (!ws || !ws.created_at) continue;

      const date = ws.created_at.slice(0, 10);
      if (!days[date]) {
        days[date] = { sessions: 0, messages: 0, toolCalls: 0, premiumRequests: 0 };
      }
      days[date].sessions++;

      // Hour and weekday
      const dt = new Date(ws.created_at);
      if (!isNaN(dt.getTime())) {
        hourly[dt.getHours()]++;
        weekday[weekdayNames[dt.getDay()]]++;
      }

      // Duration
      if (ws.updated_at) {
        const ms = new Date(ws.updated_at) - new Date(ws.created_at);
        if (ms > 0 && ms < 86400000) {
          totalDuration += ms;
          durationCount++;
        }
      }

      // Messages and tool calls
      const events = await parseEventsJsonl(dir, [
        "user.message",
        "tool.execution_start",
        "session.shutdown",
      ]);

      for (const event of events) {
        if (event.type === "user.message") {
          days[date].messages++;
        } else if (event.type === "tool.execution_start") {
          days[date].toolCalls++;
        } else if (event.type === "session.shutdown") {
          days[date].premiumRequests += event.data?.totalPremiumRequests || 0;
        }
      }
    }

    // Compute streaks
    const today = new Date().toISOString().slice(0, 10);
    const sortedDates = Object.keys(days).sort();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Walk all dates for longest streak
    if (sortedDates.length > 0) {
      tempStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diffDays = (curr - prev) / 86400000;
        if (diffDays === 1) {
          tempStreak++;
        } else {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, tempStreak);
    }

    // Current streak: walk backwards from today
    const todayDate = new Date(today);
    let checkDate = new Date(todayDate);
    while (true) {
      const key = checkDate.toISOString().slice(0, 10);
      if (days[key]) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    const avgSessionMinutes = durationCount > 0
      ? Math.round(totalDuration / durationCount / 60000)
      : 0;

    res.json({
      days,
      streaks: { current: currentStreak, longest: longestStreak },
      hourly,
      weekday,
      avgSessionMinutes,
      totalDaysActive: Object.keys(days).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Verify endpoint works**

```bash
cd /Users/bs01080/Desktop/aihero/copilot-lens
lsof -ti:3456 | xargs kill -9 2>/dev/null
node server.js &
sleep 2
curl -s http://localhost:3456/api/activity | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Days: {len(d[\"days\"])} | Streak: {d[\"streaks\"][\"current\"]} | Longest: {d[\"streaks\"][\"longest\"]} | Avg: {d[\"avgSessionMinutes\"]}m')"
kill %1
```

Expected: JSON with days, streaks, hourly, weekday data.

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add /api/activity endpoint for streaks and productivity data

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Frontend CSS — Heatmap, streak cards, and productivity styles

**Files:**
- Modify: `index.html` (insert before `</style>` at line 610)

- [ ] **Step 1: Add activity section CSS**

Insert before the `</style>` tag:

```css
    /* Activity & Streaks section */
    .streak-cards {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .streak-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 20px;
      text-align: center;
      flex: 1;
    }

    .streak-card .streak-icon { font-size: 1.5rem; }

    .streak-card .streak-value {
      font-size: 1.8rem;
      font-weight: bold;
      color: var(--accent);
    }

    .streak-card .streak-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    /* Heatmap */
    .heatmap-container {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      overflow-x: auto;
    }

    .heatmap-toggles {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }

    .heatmap-toggle {
      background: var(--bg-tertiary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 0.72rem;
      font-family: inherit;
      color: var(--text-muted);
      cursor: pointer;
    }

    .heatmap-toggle.active {
      background: var(--accent-dark);
      color: #fff;
      border-color: var(--accent);
    }

    .heatmap-grid {
      display: grid;
      grid-template-columns: 30px repeat(53, 12px);
      grid-template-rows: 20px repeat(7, 12px);
      gap: 2px;
      align-items: center;
    }

    .heatmap-month {
      font-size: 0.6rem;
      color: var(--text-muted);
      text-align: center;
      grid-row: 1;
    }

    .heatmap-day-label {
      font-size: 0.6rem;
      color: var(--text-muted);
      text-align: right;
      padding-right: 4px;
    }

    .heatmap-cell {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: var(--bg-tertiary);
      position: relative;
    }

    .heatmap-cell[data-level="1"] { background: color-mix(in srgb, var(--accent) 25%, var(--bg-tertiary)); }
    .heatmap-cell[data-level="2"] { background: color-mix(in srgb, var(--accent) 50%, var(--bg-tertiary)); }
    .heatmap-cell[data-level="3"] { background: color-mix(in srgb, var(--accent) 75%, var(--bg-tertiary)); }
    .heatmap-cell[data-level="4"] { background: var(--accent); }

    .heatmap-cell:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 0.65rem;
      white-space: nowrap;
      z-index: 10;
      color: var(--text);
    }

    /* Productivity insights */
    .productivity-cards {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .productivity-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      flex: 1;
      text-align: center;
    }

    .productivity-card .prod-value {
      font-size: 1.2rem;
      font-weight: bold;
      color: var(--text);
    }

    .productivity-card .prod-label {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .hourly-bars {
      display: flex;
      align-items: flex-end;
      gap: 1px;
      height: 24px;
      margin-top: 8px;
    }

    .hourly-bar {
      flex: 1;
      background: var(--accent);
      border-radius: 1px 1px 0 0;
      min-width: 3px;
      opacity: 0.7;
    }

    @media (max-width: 768px) {
      .streak-cards, .productivity-cards { flex-direction: column; }
    }
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "style: add heatmap, streak cards, and productivity CSS

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Frontend HTML — Activity section

**Files:**
- Modify: `index.html` (insert before "Tool Call Analytics" heading at line 686)

- [ ] **Step 1: Add Activity & Streaks section HTML**

Find this line:
```html
  <h2>Tool Call Analytics <button class="export-btn" onclick="exportToolCalls()">Export</button></h2>
```

Insert BEFORE it:
```html
  <h2>Activity & Streaks</h2>
  <div class="streak-cards" id="streak-cards"></div>
  <div class="heatmap-container">
    <div class="heatmap-toggles">
      <button class="heatmap-toggle active" onclick="setHeatmapMetric('sessions', this)">Sessions</button>
      <button class="heatmap-toggle" onclick="setHeatmapMetric('messages', this)">Messages</button>
      <button class="heatmap-toggle" onclick="setHeatmapMetric('toolCalls', this)">Tool Calls</button>
      <button class="heatmap-toggle" onclick="setHeatmapMetric('premiumRequests', this)">Premium Req</button>
    </div>
    <div class="heatmap-grid" id="heatmap-grid"></div>
  </div>
  <div class="productivity-cards" id="productivity-cards"></div>

```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add activity & streaks HTML section with heatmap container

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Frontend JS — Activity rendering and heatmap logic

**Files:**
- Modify: `index.html` (script section)

- [ ] **Step 1: Add activity variables and rendering functions**

Find this line in the script:
```javascript
    let sessionsData = [];
```

Insert BEFORE it:
```javascript
    let activityData = null;
    let heatmapMetric = 'sessions';

    function setHeatmapMetric(metric, btn) {
      heatmapMetric = metric;
      document.querySelectorAll('.heatmap-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (activityData) renderHeatmap(activityData);
    }

    function renderActivity(data) {
      activityData = data;
      renderStreakCards(data);
      renderHeatmap(data);
      renderProductivity(data);
    }

    function renderStreakCards(data) {
      const el = document.getElementById('streak-cards');
      if (!el) return;
      el.innerHTML = `
        <div class="streak-card">
          <div class="streak-icon">🔥</div>
          <div class="streak-value">${data.streaks.current}</div>
          <div class="streak-label">Current Streak (days)</div>
        </div>
        <div class="streak-card">
          <div class="streak-icon">🏆</div>
          <div class="streak-value">${data.streaks.longest}</div>
          <div class="streak-label">Longest Streak (days)</div>
        </div>
        <div class="streak-card">
          <div class="streak-icon">📅</div>
          <div class="streak-value">${data.totalDaysActive}</div>
          <div class="streak-label">Total Active Days</div>
        </div>
      `;
    }

    function renderHeatmap(data) {
      const grid = document.getElementById('heatmap-grid');
      if (!grid) return;

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 364);
      // Adjust to start on Sunday
      startDate.setDate(startDate.getDate() - startDate.getDay());

      // Compute max for color scaling
      const values = Object.values(data.days).map(d => d[heatmapMetric] || 0);
      const maxVal = Math.max(...values, 1);

      // Build cells
      let html = '';
      const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      // Month headers (row 1)
      html += '<div></div>'; // empty top-left corner
      let lastMonth = -1;
      for (let week = 0; week < 53; week++) {
        const weekDate = new Date(startDate);
        weekDate.setDate(weekDate.getDate() + week * 7);
        const month = weekDate.getMonth();
        if (month !== lastMonth) {
          html += `<div class="heatmap-month">${months[month]}</div>`;
          lastMonth = month;
        } else {
          html += '<div></div>';
        }
      }

      // Day rows
      for (let day = 0; day < 7; day++) {
        html += `<div class="heatmap-day-label">${dayLabels[day]}</div>`;
        for (let week = 0; week < 53; week++) {
          const cellDate = new Date(startDate);
          cellDate.setDate(cellDate.getDate() + week * 7 + day);

          if (cellDate > today) {
            html += '<div></div>';
            continue;
          }

          const key = cellDate.toISOString().slice(0, 10);
          const val = data.days[key] ? (data.days[key][heatmapMetric] || 0) : 0;
          const level = val === 0 ? 0 : val <= maxVal * 0.25 ? 1 : val <= maxVal * 0.5 ? 2 : val <= maxVal * 0.75 ? 3 : 4;
          const dateStr = cellDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const tooltip = `${dateStr}: ${val} ${heatmapMetric}`;

          html += `<div class="heatmap-cell" data-level="${level}" data-tooltip="${tooltip}"></div>`;
        }
      }

      grid.innerHTML = html;
    }

    function renderProductivity(data) {
      const el = document.getElementById('productivity-cards');
      if (!el) return;

      // Peak hour
      const peakHour = data.hourly.indexOf(Math.max(...data.hourly));
      const peakLabel = peakHour === 0 ? '12 AM' : peakHour < 12 ? peakHour + ' AM' : peakHour === 12 ? '12 PM' : (peakHour - 12) + ' PM';

      // Busiest day
      const busiestDay = Object.entries(data.weekday).sort((a, b) => b[1] - a[1])[0];

      // Hourly bars
      const maxH = Math.max(...data.hourly, 1);
      const bars = data.hourly.map(h => `<div class="hourly-bar" style="height:${Math.max(1, (h / maxH) * 24)}px" title="${h} sessions"></div>`).join('');

      el.innerHTML = `
        <div class="productivity-card">
          <div class="prod-value">${peakLabel}</div>
          <div class="prod-label">Peak Hour</div>
          <div class="hourly-bars">${bars}</div>
        </div>
        <div class="productivity-card">
          <div class="prod-value">${busiestDay ? busiestDay[0] : '—'}</div>
          <div class="prod-label">Busiest Day (${busiestDay ? busiestDay[1] : 0} sessions)</div>
        </div>
        <div class="productivity-card">
          <div class="prod-value">${data.avgSessionMinutes}m</div>
          <div class="prod-label">Avg Session Length</div>
        </div>
      `;
    }

```

- [ ] **Step 2: Add activity fetch to load() function**

Find in the `load()` function:
```javascript
        const [stats, history, toolData, projects, costData, sessions] =
          await Promise.all([
            fetch("/api/stats").then((r) => r.json()),
```

Replace the entire Promise.all block with:
```javascript
        const [stats, history, toolData, projects, costData, sessions, activity] =
          await Promise.all([
            fetch("/api/stats").then((r) => r.json()),
            fetch(`/api/history?page=${paginationState.history.page}&limit=${paginationState.history.limit}`).then((r) => r.json()),
            fetch(`/api/tool-calls?page=${paginationState.tools.page}&limit=${paginationState.tools.limit}`).then((r) => r.json()),
            fetch(`/api/projects?page=${paginationState.projects.page}&limit=${paginationState.projects.limit}`).then((r) => r.json()),
            fetch(`/api/daily-costs?page=${paginationState.daily.page}&limit=${paginationState.daily.limit}`).then((r) => r.json()),
            fetch("/api/sessions").then((r) => r.json()),
            fetch("/api/activity").then((r) => r.json()),
          ]);
```

- [ ] **Step 3: Call renderActivity in load()**

Find:
```javascript
        renderSessions(sessions.data || sessions);
```

Insert AFTER that line:
```javascript
        renderActivity(activity);
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add activity heatmap, streak counters, and productivity insights

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Smoke test

- [ ] **Step 1: Run the complete smoke test**

```bash
cd /Users/bs01080/Desktop/aihero/copilot-lens
lsof -ti:3456 | xargs kill -9 2>/dev/null
node server.js &
sleep 2

echo "=== Activity API ==="
curl -s http://localhost:3456/api/activity | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Days: {len(d[\"days\"])} | Streak: {d[\"streaks\"][\"current\"]}/{d[\"streaks\"][\"longest\"]} | Hourly: {sum(d[\"hourly\"])} | Avg: {d[\"avgSessionMinutes\"]}m')"

echo "=== HTML elements ==="
curl -s http://localhost:3456/ | grep -c "streak-cards\|heatmap-grid\|productivity-cards\|heatmap-toggle"

echo "=== JS functions ==="
curl -s http://localhost:3456/ | grep -c "renderActivity\|renderHeatmap\|renderStreakCards\|renderProductivity\|setHeatmapMetric"

echo "=== CSS classes ==="
curl -s http://localhost:3456/ | grep -c "heatmap-cell\|streak-card\|productivity-card\|hourly-bar"

echo "=== Git log ==="
git --no-pager log --oneline -5

kill %1
```

Expected: All counts ≥ 1, API returns valid activity data.

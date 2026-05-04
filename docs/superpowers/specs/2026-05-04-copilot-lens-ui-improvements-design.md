# copilot-lens UI & Docs Improvement Design

**Date:** 2026-05-04
**Status:** Approved
**Approach:** A — Polish + Docs (zero new dependencies)

---

## Problem

The current dashboard lacks visual clarity for token/cost data, has no explanation of how metrics are derived, and the README does not document data sources or calculation formulas. Users cannot tell whether "premium requests" and "estimated cost" are official Copilot figures or approximations.

---

## Scope

Two parallel tracks:
1. **UI polish** — visual and UX improvements to `index.html`
2. **README documentation** — cost/token calculation transparency

Out of scope: new API endpoints, new dependencies, chart libraries, backend changes.

---

## UI Improvements (`index.html`)

### 1. Per-Model Cost Breakdown Table

**Location:** New collapsible section after the Cache Analytics cards, titled "Model Breakdown".

**Data source:** `/api/stats` → `modelBreakdown` (already returned, already populated from `modelMetrics` in `session.shutdown` events).

**Columns:**
| Model | Requests | Input Tokens | Output Tokens | Cache Read | Cache Write | Est. Cost |
|-------|----------|-------------|---------------|------------|-------------|-----------|

- Cost per model = `(inputTokens × RATE_INPUT) + (outputTokens × RATE_OUTPUT) + (cacheRead × RATE_CACHE_READ) + (cacheWrite × RATE_CACHE_CREATE)`
- Token values formatted with `fmt()` helper (already exists)
- Cost formatted as `$X.XX`
- Section is expanded by default

**Implementation:** Pure HTML table rendered by a new `renderModelBreakdown(stats)` JS function called from `load()`.

---

### 2. Cache Hit Rate Progress Ring

**Location:** Replaces the plain percentage text in the first Cache Analytics card ("Cache Hit Rate").

**Implementation:** CSS `conic-gradient` ring — no JS library, no SVG.

```css
.ring {
  width: 80px; height: 80px;
  border-radius: 50%;
  background: conic-gradient(#58a6ff calc(var(--pct) * 1%), #21262d 0);
  display: flex; align-items: center; justify-content: center;
}
.ring::after { /* white inner circle for donut effect */
  content: attr(data-label);
  width: 58px; height: 58px;
  border-radius: 50%;
  background: #0d1117;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #c9d1d9;
}
```

The `--pct` CSS variable is set via JS: `ring.style.setProperty('--pct', hitRate)`.

---

### 3. Info Tooltips on Key Metrics

**Location:** Next to "Premium Requests" and "Est. Cost" labels in both the Today and All-Time stat panels.

**Implementation:** Pure CSS tooltip — `<span class="info-icon" data-tip="...">ⓘ</span>` with `:hover::after` showing the tooltip bubble.

**Tooltip content:**
- Premium Requests: *"Tracked by Copilot CLI — recorded in session.shutdown events. Not calculated by copilot-lens."*
- Est. Cost: *"Estimated from token counts × configurable rates (default: AWS Bedrock ap-southeast-2). Not official Copilot billing."*

**CSS:** Tooltip positioned absolute, z-index above table, max-width 260px, dark background with border.

---

### 4. Refresh Button + Last-Updated Timestamp

**Location:** Sticky header bar (already exists), right side.

**Implementation:**
- `<span id="last-updated">Last updated: --:--:--</span>` + `<button onclick="load()">↻ Refresh</button>`
- After `load()` completes: `document.getElementById('last-updated').textContent = 'Last updated: ' + new Date().toLocaleTimeString()`
- Button styled to match existing dark theme (border `#30363d`, hover `#21262d`)

---

## README Improvements

### 1. "How Costs Are Calculated" Section

New section after "How It Works":

```markdown
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
USD cost is an **estimate** computed from raw token counts using configurable per-token rates:

```
cost = (inputTokens × RATE_INPUT/1M)
     + (outputTokens × RATE_OUTPUT/1M)
     + (cacheReadTokens × RATE_CACHE_READ/1M)
     + (cacheWriteTokens × RATE_CACHE_CREATE/1M)
```

Default rates reflect **AWS Bedrock cross-region (ap-southeast-2)** pricing.
This is **not** your actual Copilot bill — it's an approximation for awareness.
Override rates in `.env` to match your actual pricing tier.
```

---

### 2. Example `session.shutdown` Event Snippet

New subsection under "How It Works" showing the raw event structure:

```markdown
### Example event: `session.shutdown`

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
```

---

### 3. "Data Sources" Section

New section under "How It Works":

```markdown
### Data Sources

```
~/.copilot/session-state/<uuid>/
  ├── workspace.yaml              → project name, branch, cwd, timestamps
  ├── events.jsonl                → token counts, tool calls, premium requests
  │     event types used:
  │       session.shutdown        → aggregated token/cost/request totals
  │       user.message            → message count
  │       tool.execution_start    → tool call count + arguments
  │       tool.execution_complete → success/failure status
  └── (session.db — SQLite, not read by copilot-lens)

~/.copilot/command-history-state.json → CLI command history (string array)
```
```

---

### 4. Rates Clarification Note

In the Configuration table, add a footnote:

> ⚠️ These rates are estimates. They do not reflect your actual GitHub Copilot subscription cost. Adjust to match your actual cloud provider pricing.

---

## Files Changed

| File | Changes |
|------|---------|
| `index.html` | Model breakdown table, progress ring, info tooltips, refresh button |
| `README.md` | Cost calculation section, event JSON example, data sources diagram, rates note |

No changes to `server.js` — all data needed is already returned by existing endpoints.

---

## Non-Goals

- No new npm dependencies
- No changes to API endpoints or server logic
- No authentication, no remote data, no telemetry

# Session Drill-down & Search — Design Spec

## Goal

Allow users to click into any session to see a full conversation timeline and per-model cost breakdown, plus filter the session list by name/project/branch.

## Architecture

Single-page modal overlay pattern. No routing library needed. One new API endpoint (`/api/session/:id`) provides detailed per-session data. Search is client-side filtering of the existing `/api/sessions` response.

## Backend

### New endpoint: `GET /api/session/:id`

**Parameters:** `:id` — session directory name (UUID)

**Response shape:**

```json
{
  "id": "abc-123",
  "name": "Session Name",
  "cwd": "/path/to/project",
  "branch": "main",
  "createdAt": "2026-05-04T10:00:00Z",
  "updatedAt": "2026-05-04T11:30:00Z",
  "duration": "1h 30m",
  "codeChanges": { "linesAdded": 42, "linesRemoved": 10 },
  "cost": {
    "estimatedTotal": 1.23,
    "premiumRequests": 5.5,
    "models": {
      "claude-sonnet-4-20250514": {
        "requests": 3,
        "inputTokens": 50000,
        "outputTokens": 8000,
        "cacheReadTokens": 40000,
        "cacheWriteTokens": 5000,
        "reasoningTokens": 0,
        "estimatedCost": 0.85
      }
    }
  },
  "timeline": [
    { "type": "user.message", "timestamp": "...", "content": "(message text or summary)" },
    { "type": "tool.execution_start", "timestamp": "...", "tool": "edit", "args": { "path": "src/main.ts" } },
    { "type": "tool.execution_complete", "timestamp": "...", "tool": "edit", "success": true },
    { "type": "session.shutdown", "timestamp": "...", "premiumRequests": 5.5 }
  ]
}
```

**Implementation notes:**
- Read `workspace.yaml` for metadata
- Stream `events.jsonl` and collect all event types
- For `user.message`: include first 200 chars of message content (privacy-conscious truncation)
- For `tool.execution_start`: extract tool name + key argument (path for file ops, command for bash, pattern for grep)
- For `tool.execution_complete`: extract success status
- For `session.shutdown`: extract premium requests and model metrics
- Compute duration from createdAt/updatedAt difference
- Compute per-model estimated cost using existing RATES config

## Frontend

### Search bar

- Positioned above the session table
- Simple `<input type="text">` with search icon
- Filters existing session data client-side (no API call)
- Matches against: session name, cwd (project path), branch
- Case-insensitive substring match
- Debounced at 200ms to avoid excessive re-renders
- Shows result count: "Showing X of Y sessions"

### Modal overlay

**Trigger:** Click any session row in the table

**Structure:**
```
┌─────────────────────────────────────────────────────┐
│  [X]  Session: "Feature implementation"             │
│       Project: copilot-lens  Branch: master         │
│       Duration: 1h 30m  |  Created: May 4, 2026    │
├─────────────────────────────────────────────────────┤
│  ┌─── Cost Breakdown ───────────────────────────┐   │
│  │ Model          │ Req │ In    │ Out  │ Cost   │   │
│  │ claude-sonnet  │  3  │ 50K   │ 8K   │ $0.85  │   │
│  │ claude-haiku   │  2  │ 20K   │ 3K   │ $0.15  │   │
│  │ TOTAL          │  5  │ 70K   │ 11K  │ $1.00  │   │
│  └──────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────┤
│  Timeline                                           │
│  ─────────                                          │
│  10:00  💬 User: "Add authentication to the..."     │
│  10:01  🔧 edit → src/auth.ts                       │
│  10:01  ✅ edit completed                           │
│  10:02  🔧 bash → npm test                          │
│  10:02  ✅ bash completed                           │
│  10:05  💬 User: "Now add the middleware..."        │
│  ...                                                │
│  11:30  🏁 Session ended (5.5 premium requests)     │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Modal fills 90% viewport width, 85% height, centered
- Background dimmed with semi-transparent overlay
- Close via: X button, Escape key, clicking backdrop
- Body scroll locked when modal is open
- Timeline scrolls independently within modal
- Loading spinner while fetching `/api/session/:id`

**Styling:**
- Uses existing CSS custom properties (theme-aware)
- Timeline uses left-border vertical line connecting events
- Event icons: 💬 for messages, 🔧 for tool starts, ✅/❌ for completions, 🏁 for shutdown
- Alternating subtle background for timeline entries

## Non-goals

- No full-text search into message content (kept lightweight per user preference)
- No session comparison view
- No export/download of session data
- No pagination of timeline (sessions are typically <500 events)

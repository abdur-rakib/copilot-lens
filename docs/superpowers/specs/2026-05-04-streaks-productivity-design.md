# Streaks & Productivity — Design Spec

## Goal

Add a GitHub-style contribution heatmap, streak counters, and productivity insights (peak hours, avg session length, busiest weekday) to the copilot-lens dashboard.

## Architecture

One new API endpoint (`GET /api/activity`) computes per-day activity for the last 365 days plus hourly/weekday distributions. Frontend renders a CSS grid heatmap with metric toggle, streak counter cards, and productivity stat cards. No external libraries needed.

## Backend

### New endpoint: `GET /api/activity`

**Response shape:**

```json
{
  "days": {
    "2026-05-04": { "sessions": 3, "messages": 45, "toolCalls": 120, "premiumRequests": 8.5 },
    "2026-05-03": { "sessions": 2, "messages": 20, "toolCalls": 55, "premiumRequests": 4.2 }
  },
  "streaks": {
    "current": 5,
    "longest": 12
  },
  "hourly": [0, 0, 0, 0, 0, 1, 3, 5, 12, 15, 18, 14, 10, 8, 7, 9, 11, 6, 3, 2, 1, 0, 0, 0],
  "weekday": {
    "Mon": 25, "Tue": 30, "Wed": 28, "Thu": 22, "Fri": 18, "Sat": 5, "Sun": 3
  },
  "avgSessionMinutes": 42,
  "totalDaysActive": 45
}
```

**Implementation:**
- Iterate all session dirs, read `workspace.yaml` for `created_at`/`updated_at`
- Parse `events.jsonl` for `user.message` and `tool.execution_start` counts
- Group by date (last 365 days)
- Compute streaks: walk sorted days backwards from today, count consecutive days with ≥1 session for current streak; scan all for longest
- Hourly distribution: extract hour from `created_at` of each session
- Weekday distribution: extract day-of-week from session dates
- Avg session length: mean of (updatedAt - createdAt) across all sessions

## Frontend

### Section placement

Insert between "Usage Trends" chart and "Tool Call Analytics" section. Section title: "Activity & Streaks".

### Streak counters

Two prominent cards side by side:
- 🔥 Current Streak: `N days`
- 🏆 Longest Streak: `N days`

### Contribution heatmap

- 52 columns × 7 rows CSS grid (last 364 days + today)
- Each cell: 12×12px square with border-radius
- Color scale: 5 levels from `var(--bg-tertiary)` (0 activity) through progressively more opaque `var(--accent)` shades
- Toggle buttons above heatmap: Sessions | Messages | Tool Calls | Premium Req
  - Active toggle gets accent background
  - Default: Sessions
- Hover tooltip: "May 4, 2026: 3 sessions"
- Month labels along the top (Jan, Feb, ... derived from column positions)
- Day labels on left: Mon, Wed, Fri

### Productivity insights

Three stat cards below the heatmap:
- **Peak Hour**: most active hour (e.g., "2:00 PM") with a tiny sparkline-style bar showing the hourly distribution
- **Busiest Day**: weekday name with session count
- **Avg Session**: duration in minutes

The hourly distribution is rendered as a simple inline bar chart (24 narrow bars, tallest = 20px, colored with accent).

## Styling

- All uses CSS custom properties for theme compatibility
- Heatmap cells use opacity levels: 0 → bg-tertiary, level 1–4 → accent with opacity 0.25/0.5/0.75/1.0
- Responsive: heatmap scrolls horizontally on small screens

## Non-goals

- No gamification badges/milestones
- No weekly/monthly streak variants
- No configurable "what counts as active" threshold (always ≥1 session)
- No animation/transitions on heatmap

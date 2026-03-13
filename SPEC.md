# Claw Monitor — Agent Progress Dashboard

## Overview
A real-time web dashboard for remotely monitoring AI coding agent progress. Built as a Node.js app with Express backend and a polished single-page frontend.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Single-page app (vanilla HTML/CSS/JS, no framework)
- **Real-time:** Server-Sent Events (SSE) for live updates
- **Data:** JSON files on disk (read by the API)

## Design Direction
- **Dark theme** — deep charcoal/black background (#0a0a0f or similar)
- **Accent:** Electric cyan/teal (#00ffd5 or similar) — feels like a mission control terminal
- **Typography:** Monospace for logs/status (JetBrains Mono from Google Fonts), clean sans-serif for headings (Space Grotesk or similar)
- **Vibe:** Mission control / ops dashboard. Clean, information-dense, no fluff.
- **Layout:** CSS Grid, responsive but optimized for desktop/tablet landscape viewing
- **Animations:** Subtle pulse on active agents, smooth transitions on status changes, typing effect on live logs

## Data Directory
The dashboard reads from `./data/` which contains:

### `agents.json` — Active agent sessions
```json
[
  {
    "id": "agent-001",
    "name": "Claude Code",
    "task": "Build authentication module",
    "status": "running",       // running | completed | failed | idle
    "startedAt": "2026-03-12T23:00:00Z",
    "progress": 65,            // 0-100
    "lastActivity": "Writing tests for JWT validation",
    "errors": []
  }
]
```

### `tasks.json` — Task board
```json
[
  {
    "id": "task-001",
    "title": "Set up Express server",
    "status": "done",          // todo | in-progress | done | blocked
    "assignedTo": "agent-001",
    "priority": "high",        // low | medium | high | critical
    "createdAt": "2026-03-12T22:00:00Z",
    "completedAt": "2026-03-12T22:30:00Z"
  }
]
```

### `logs.json` — Activity feed
```json
[
  {
    "timestamp": "2026-03-12T23:15:00Z",
    "agent": "agent-001",
    "type": "info",            // info | warning | error | success
    "message": "Installed express and cors dependencies"
  }
]
```

### `project.json` — Project metadata
```json
{
  "name": "My Project",
  "description": "Building something cool",
  "startedAt": "2026-03-12T22:00:00Z",
  "repository": "https://github.com/user/repo",
  "totalTasks": 12,
  "completedTasks": 5,
  "activeAgents": 2
}
```

## Dashboard Sections

### 1. Header Bar
- Project name + description
- Overall progress bar (tasks completed / total)
- Uptime timer (since project started)
- Connection status indicator (SSE connected/disconnected)

### 2. Agent Cards (top section)
- One card per active agent
- Shows: name, current task, progress bar, status badge, last activity text
- Pulsing border glow when actively running
- Red glow on error state

### 3. Task Board (middle section)
- Kanban-style columns: To Do | In Progress | Done | Blocked
- Each task card shows title, priority badge, assigned agent
- Count badges on column headers

### 4. Live Activity Feed (bottom section)
- Scrolling log of recent events
- Color-coded by type (info=cyan, warning=yellow, error=red, success=green)
- Timestamp + agent name + message
- Auto-scrolls to latest, pause on hover
- Max 100 entries visible

### 5. Stats Bar (sidebar or footer)
- Total tasks / completed / remaining
- Active agents count
- Errors count (with alert if > 0)
- Estimated time remaining (if calculable)

## API Endpoints

```
GET /api/status        → project.json + computed stats
GET /api/agents        → agents.json
GET /api/tasks         → tasks.json
GET /api/logs          → logs.json (last 100)
GET /api/logs/stream   → SSE stream of new log entries
POST /api/logs         → Add a log entry (for agents to report)
POST /api/agents       → Update agent status
POST /api/tasks        → Update task status
```

## Server
- Default port: 3777
- Serves static frontend from `./public/`
- Watches `./data/` files for changes and pushes via SSE
- CORS enabled for local dev
- Graceful error handling (missing files = empty state, not crash)

## Seed Data
Create sample seed data in `./data/` so the dashboard looks alive on first run. Use a realistic scenario: "ClawOS Dashboard v2" project with 3 agents working on different tasks.

## Run
```bash
npm start  # starts server on port 3777
```

## File Structure
```
claw-monitor/
├── package.json
├── server.js           # Express server + SSE + API
├── public/
│   ├── index.html      # Dashboard SPA
│   ├── style.css       # All styles
│   └── app.js          # Frontend logic + SSE client
├── data/
│   ├── project.json
│   ├── agents.json
│   ├── tasks.json
│   └── logs.json
└── SPEC.md
```

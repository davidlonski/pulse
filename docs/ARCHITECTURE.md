# Pulse — System Architecture

High-level design of how Pulse is built, how data flows through it, and why the key decisions were made the way they were.

---

## Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          External Sources                           │
│                                                                     │
│   ┌──────────────────┐          ┌──────────────────────────────┐   │
│   │  Google Calendar │          │           Gmail              │   │
│   │  (OAuth, r/o)    │          │         (OAuth, r/o)         │   │
│   └────────┬─────────┘          └──────────────┬───────────────┘   │
└────────────┼──────────────────────────────────-┼───────────────────┘
             │                                   │
             ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Pulse Backend (Node.js + Express)            │
│                                                                     │
│  ┌────────────────────┐     ┌────────────────────────────────────┐  │
│  │  Calendar Connector │     │         Gmail Connector           │  │
│  │  (googleapis npm)   │     │         (googleapis npm)          │  │
│  │  Sync every 15 min  │     │  Sync every 15 min + flag emails  │  │
│  └─────────┬──────────┘     └──────────────┬─────────────────── ┘  │
│            │                               │                        │
│            └───────────────┬───────────────┘                        │
│                            ▼                                        │
│                  ┌──────────────────┐                               │
│                  │  SQLite Database  │                               │
│                  │  (better-sqlite3) │                               │
│                  │                  │                               │
│                  │  events          │                               │
│                  │  emails          │                               │
│                  │  briefings       │                               │
│                  │  nudges          │                               │
│                  │  settings        │                               │
│                  └──────┬───────────┘                               │
│                         │                                           │
│           ┌─────────────┼─────────────────┐                        │
│           ▼             ▼                 ▼                        │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐            │
│  │   Briefing   │ │    Nudge     │ │   REST API      │            │
│  │   Engine     │ │   Engine     │ │   (Express)     │            │
│  │              │ │              │ │                 │            │
│  │ 7am cron     │ │ 5min cron    │ │ /api/events     │            │
│  │ Claude Haiku │ │ 2hr + 30min  │ │ /api/emails     │            │
│  │ → briefings  │ │ reminders    │ │ /api/briefings  │            │
│  │   table      │ │ → nudges tbl │ │ /health         │            │
│  └──────┬───────┘ └──────┬───────┘ └────────┬────────┘            │
│         │                │                  │                      │
└─────────┼────────────────┼──────────────────┼──────────────────────┘
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Delivery Layer                                │
│                                                                     │
│   ┌────────────────────────┐     ┌────────────────────────────┐    │
│   │  Web Push Notification  │     │   Dashboard (Browser)      │    │
│   │  (VAPID + Service Worker│     │   Pure HTML/CSS/JS         │    │
│   │   works when tab closed)│     │   Polls /api every 5 min   │    │
│   └────────────────────────┘     └────────────────────────────┘    │
│                                                                     │
│   ┌────────────────────────┐                                        │
│   │   Twilio SMS (optional) │                                        │
│   │   Morning briefing only │                                        │
│   └────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Calendar Data
```
Google Calendar API
  → Calendar Connector (every 15 min via node-cron)
  → Upsert into events table (SQLite)
  → Read by Briefing Engine + Nudge Engine + REST API
  → Displayed in Dashboard / sent as nudge
```

### 2. Email Data
```
Gmail API
  → Gmail Connector (every 15 min via node-cron)
  → Filter: keywords + sender history → initial flag pass
  → Claude Haiku: score remaining emails for importance
  → Upsert into emails table (is_flagged = true/false)
  → Read by Briefing Engine + REST API
  → Displayed in Dashboard
```

### 3. Morning Briefing
```
node-cron (7:00am daily)
  → Pull events (today + tomorrow) from SQLite
  → Pull flagged emails (last 24h) from SQLite
  → Build structured prompt → Claude Haiku API call
  → Parse response → store in briefings table
  → Trigger Web Push notification to browser
  → Optionally send SMS via Twilio
```

### 4. Proactive Nudge
```
node-cron (every 5 min)
  → Query events starting in 115–125 min (2hr check)
  → Query events starting in 25–35 min (30min check)
  → For each candidate:
      - Was it already nudged? (check nudges table) → skip
      - Has user opened dashboard in last 30 min? (check settings) → skip
      - Daily nudge limit reached? (check nudges_sent_today) → skip
  → Send Web Push notification
  → Record in nudges table
```

---

## Key Design Decisions

### Local-First (No Cloud by Default)
**Decision:** Everything runs on the user's machine. SQLite over Postgres. Local Express server over a hosted API.

**Why:** Privacy is a core product principle. The user's calendar and email data never leaves their machine unless they explicitly enable cloud sync. Local also means zero hosting costs, zero cold starts, and sub-100ms API responses. For a personal productivity tool used by one person on one network, this is the right tradeoff. Cloud sync can be added later as opt-in.

**Tradeoff:** Can't easily share the dashboard from another device. Acceptable for MVP — mobile-responsive web on localhost works fine from any device on the same LAN.

---

### SQLite Over Postgres
**Decision:** Use SQLite via `better-sqlite3` for all persistent storage.

**Why:** Zero setup. No background database process. Survives machine restarts cleanly. More than fast enough for a single-user app with a few thousand rows. The data model is simple and unlikely to need complex joins or high concurrency. Switching to Postgres later (for the business version) is straightforward — the schema is clean and the queries are simple.

**Tradeoff:** No multi-user support without significant rework. Acceptable — the personal version is single-user by design.

---

### Read-Only from All Sources
**Decision:** Pulse never writes to Google Calendar or Gmail. Ever.

**Why:** This is a trust principle, not a technical constraint. Users need to trust that Pulse cannot make mistakes on their behalf — send an email they didn't write, delete an event, or modify their calendar. Read-only access cannot cause harm. Write access, however small, can. The product earns trust by never having write access in the first place.

**Tradeoff:** Can't auto-reply, create reminders in Google Calendar, or archive emails. Acceptable — those features would cross the line into Pulse acting as the user's agent, which is explicitly out of scope.

---

### Pure HTML/CSS/JS Frontend
**Decision:** No React, no Vue, no build step. Raw HTML + CSS + vanilla JS.

**Why:** Simplicity and speed. The dashboard is a read-mostly display with minimal interactivity. It doesn't need a component framework. A build step would add complexity with no benefit. Vanilla JS is sufficient and loads instantly. This also makes it trivial to embed in a local server — just `res.sendFile()`.

**Tradeoff:** More manual DOM manipulation code for complex interactions. Acceptable for MVP. If the UI grows significantly, a lightweight framework like Alpine.js can be added without a build step.

---

### Claude Haiku for Briefings
**Decision:** Use Claude Haiku (not GPT-4 or Claude Sonnet) for the briefing engine.

**Why:** Haiku is fast (< 1 second for a briefing), cheap (fractions of a cent per call), and more than capable of summarizing a list of events and emails in plain language. The briefing task does not require deep reasoning — it requires concise, clear summarization. Haiku excels at that. Using a more expensive model would add cost with no quality benefit for this use case.

**Tradeoff:** Less capable for nuanced tasks. If the briefing engine evolves to do more complex reasoning (e.g., "this email looks like a deadline is being missed"), a more powerful model can be dropped in — the prompt/response contract is the same.

---

### node-cron for Scheduling
**Decision:** Use `node-cron` for all scheduled jobs (sync, briefing, nudges) rather than OS-level cron or a separate scheduler.

**Why:** Keeps everything in-process. No additional services to manage. Jobs can access the SQLite connection and shared state directly. Easy to unit-test. `node-cron` supports cron syntax including timezone-aware scheduling.

**Tradeoff:** Jobs die if the Node.js process dies. Mitigated by running under `pm2` with auto-restart.

---

## Future Scaling Path

### When to Add Cloud Sync
When Pulse needs to work across multiple devices (desktop + phone native app), or when the business version requires a shared team brain that multiple users read from. At that point: move from SQLite to Postgres, add a sync API, and keep the local-first mode as an option.

### When to Add Team Features (Business Version)
After personal v1.0 is stable and used by real people for at least a month. The business version requires multi-user auth, data isolation, role-based briefings, and likely a hosted deployment. None of that is appropriate to build until the core personal experience is proven.

### When to Build a Native App
When the web-responsive experience on mobile is clearly insufficient and users are asking for a home screen icon and native push notifications. The first step is a PWA (Progressive Web App) wrapper — no App Store, just an installable web app. Full native (Swift/Kotlin) only if PWA is insufficient.

### When to Add More Data Sources
After Calendar and Gmail are proven reliable and the briefing quality is high. Next candidates: iMessage/SMS (requires Mac-specific tooling), Slack (OAuth + webhook), GitHub (for developer-focused users). Each new source requires an explicit user opt-in and a new connector module. The architecture supports this — each connector is isolated, reads from its source, and writes to a shared SQLite schema.

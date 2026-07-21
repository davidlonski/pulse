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
│  │ Ollama HTTP  │ │ 2hr + 30min  │ │ /api/emails     │            │
│  │ (port 11434) │ │ reminders    │ │ /api/briefings  │            │
│  │ → briefings  │ │ → nudges tbl │ │ /health         │            │
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
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Local LLM (Ollama)                               │
│                                                                     │
│   Runs on the same machine as Pulse. Pulse calls it over HTTP.      │
│   No data leaves the machine. No API key required.                  │
│                                                                     │
│   Endpoint: http://localhost:11434/v1/chat/completions              │
│   Model (briefing + email scoring): gemma4:e4b                      │
│                                                                     │
│   Used by:                                                          │
│   - Briefing Engine  (morning briefing generation)                  │
│   - Gmail Connector  (email importance scoring)                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Project File Structure

This is the exact structure Pulse is built against. Every issue in BACKLOG.md references files from this tree.

```
pulse/
├── package.json
├── .env.example              ← All required keys, no values, committed to git
├── .gitignore
├── server.js                 ← Express app entry point, loads all routes + crons
├── db/
│   ├── init.sql              ← Full schema DDL, run on startup
│   └── database.js           ← better-sqlite3 singleton, exported as db
├── src/
│   ├── connectors/
│   │   ├── calendar.js       ← Google Calendar fetch + upsert into events table
│   │   └── gmail.js          ← Gmail fetch + flag pass + Ollama scoring
│   ├── engines/
│   │   ├── briefing.js       ← Pull from SQLite, call Ollama, store in briefings
│   │   └── nudge.js          ← Detect upcoming events, send push, record in nudges
│   ├── cron/
│   │   └── index.js          ← Register all node-cron jobs (sync, briefing, nudge)
│   ├── routes/
│   │   ├── api.js            ← GET /api/events, /api/emails/flagged, /api/briefings
│   │   └── auth.js           ← GET/POST /login, /logout, /oauth/callback
│   ├── push/
│   │   └── webpush.js        ← VAPID key load, push subscription store, sendPush()
│   └── ollama/
│       └── client.js         ← chatCompletion(prompt, systemPrompt) → string
├── public/
│   ├── index.html            ← Dashboard (three-panel layout)
│   ├── login.html            ← Password gate
│   ├── settings.html         ← Google OAuth connect/disconnect
│   ├── style.css
│   ├── dashboard.js          ← Polls /api every 5 min, updates DOM
│   └── sw.js                 ← Service worker — handles push notification display
├── scripts/
│   ├── start.sh              ← npm install + db init + pm2 start
│   ├── stop.sh               ← pm2 stop pulse
│   └── logs.sh               ← pm2 logs pulse
└── docs/
    ├── ARCHITECTURE.md       ← This file
    ├── SCHEMA.md             ← Table definitions with column types (created by CORE-002)
    └── BIZ_ARCHITECTURE.md   ← Future business version design (created by BIZ-001)
```

---

## Data Flow

### 1. Calendar Data
```
Google Calendar API
  → src/connectors/calendar.js (every 15 min via node-cron)
  → Upsert into events table (SQLite)
  → Read by Briefing Engine + Nudge Engine + GET /api/events
  → Displayed in Dashboard
```

### 2. Email Data
```
Gmail API
  → src/connectors/gmail.js (every 15 min via node-cron)
  → Filter pass 1: keyword match + known sender → auto-flag
  → Filter pass 2: remaining emails → Ollama (gemma4:e4b) scores importance
      POST http://localhost:11434/v1/chat/completions
      Prompt: "Is this email important or routine? Respond with one word: important or routine."
      Input: subject + sender + snippet (first 200 chars)
  → Upsert into emails table (is_flagged = true/false)
  → Read by Briefing Engine + GET /api/emails/flagged
  → Displayed in Dashboard
```

### 3. Morning Briefing
```
node-cron (fires at BRIEFING_TIME, default 07:00 local)
  → src/engines/briefing.js
  → Pull all events WHERE start_time BETWEEN now AND now+48h FROM events
  → Pull all emails WHERE is_flagged=1 AND received_at > now-24h FROM emails
  → Build prompt (see BRIEF-001 for prompt contract)
  → POST http://localhost:11434/v1/chat/completions
      model: OLLAMA_MODEL (default: gemma4:e4b)
      messages: [system, user]
  → Parse response text
  → INSERT into briefings (generated_at, content_raw, content_html)
  → Send Web Push via src/push/webpush.js
  → If TWILIO_ENABLED=true: send SMS (truncated to 320 chars)
  → If Ollama call fails: generate structured fallback (event titles + email subjects), store it
```

### 4. Proactive Nudge
```
node-cron (every 5 min)
  → src/engines/nudge.js
  → Query: SELECT * FROM events WHERE start_time BETWEEN now+115min AND now+125min (2hr check)
  → Query: SELECT * FROM events WHERE start_time BETWEEN now+25min AND now+35min (30min check)
  → For each candidate event:
      1. SELECT COUNT(*) FROM nudges WHERE event_id=? AND nudge_type=? → skip if already sent
      2. SELECT value FROM settings WHERE key='last_dashboard_open' → skip if < 30 min ago
      3. SELECT value FROM settings WHERE key='nudges_sent_today' → skip if >= nudges_per_day
  → Send Web Push: "You have [title] in 2 hours." / "Starting in 30 minutes: [title]"
  → INSERT into nudges (event_id, nudge_type, sent_at)
  → UPDATE settings SET value=value+1 WHERE key='nudges_sent_today'
```

---

## Key Design Decisions

### Local-First (No Cloud by Default)
**Decision:** Everything runs on the user's machine. SQLite over Postgres. Local Express server over a hosted API.

**Why:** Privacy is a core product principle. The user's calendar and email data never leaves their machine. Local also means zero hosting costs, zero cold starts, and sub-100ms API responses.

**Tradeoff:** Can't easily share the dashboard from another device. Acceptable for MVP — mobile-responsive web on localhost works fine from any device on the same LAN.

---

### SQLite Over Postgres
**Decision:** Use SQLite via `better-sqlite3` for all persistent storage.

**Why:** Zero setup. No background database process. Survives machine restarts cleanly. More than fast enough for a single-user app with a few thousand rows. Switching to Postgres later (for the business version) is straightforward.

**Tradeoff:** No multi-user support without significant rework. Acceptable — the personal version is single-user by design.

---

### Read-Only from All Sources
**Decision:** Pulse never writes to Google Calendar or Gmail. Ever.

**Why:** Trust principle. Read-only access cannot cause harm. Write access, however small, can. The product earns trust by never having write access in the first place.

**Tradeoff:** Can't auto-reply, create reminders in Google Calendar, or archive emails. Permanent product constraint — not an MVP limitation.

---

### Ollama (Local LLM) for Briefings and Email Scoring
**Decision:** Use Ollama running locally (port 11434) as the LLM for both morning briefing generation and email importance scoring. Default model: `gemma4:e4b`.

**Why:** Three reasons.

1. **Privacy**: Email content and calendar data never leave the machine. Sending this data to an external API (Anthropic, OpenAI) would violate the local-first privacy principle. Ollama runs on the same hardware as Pulse, so the data flow is entirely local.

2. **Cost**: No per-token API fees. Ollama runs open-source models for free after the initial model pull. At briefing frequency (once daily) plus email scoring (15-minute sync intervals), this is a meaningful cost difference at scale.

3. **Consistency**: Pulse is already local-first for storage and hosting. Using a local LLM makes the entire stack consistent — no external dependencies after initial setup.

**Model choice — `gemma4:e4b`**: Fast inference on Apple Silicon (~30 tok/s on M4), good summarization quality, 4-bit quantized so it fits comfortably alongside other processes (approx 8GB VRAM).

**Ollama API contract**: Pulse calls the OpenAI-compatible endpoint at `http://localhost:11434/v1/chat/completions`. This means swapping models requires only changing `OLLAMA_MODEL` in `.env` — no code changes.

**Tradeoff**: Ollama must be installed and the model must be pulled before Pulse starts. The deploy script (`scripts/start.sh`) checks for this and fails fast with a clear message if Ollama isn't running. If the Ollama call fails at runtime (process down, timeout), Pulse falls back to a structured plain-text summary — it never shows a blank briefing card.

**If you want a more capable model**: Change `OLLAMA_MODEL` to `qwen2.5:14b`. Requires ~16GB VRAM. Better at nuanced reasoning (e.g., detecting implied deadlines in emails). Not required for MVP.

---

### Pure HTML/CSS/JS Frontend
**Decision:** No React, no Vue, no build step. Raw HTML + CSS + vanilla JS.

**Why:** The dashboard is a read-mostly display with minimal interactivity. No component framework is needed. A build step would add complexity with no benefit. `res.sendFile()` from Express is the entire "deploy."

**Tradeoff:** More manual DOM code for complex interactions. Acceptable for MVP.

---

### node-cron for Scheduling
**Decision:** Use `node-cron` for all scheduled jobs rather than OS-level cron or a separate scheduler.

**Why:** Keeps everything in-process. Jobs share the SQLite connection and state directly. Timezone-aware cron syntax supported.

**Tradeoff:** Jobs die if the Node process dies. Mitigated by `pm2` with auto-restart.

---

## Required Environment Variables

| Key | Required | Default | Description |
|---|---|---|---|
| `PULSE_PASSWORD` | Yes | — | Dashboard login password |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | `http://localhost:3000/oauth/callback` | OAuth redirect |
| `SESSION_SECRET` | Yes | — | Express session signing key (random string) |
| `OLLAMA_BASE_URL` | No | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | No | `gemma4:e4b` | Model to use for briefings + email scoring |
| `BRIEFING_TIME` | No | `07:00` | Daily briefing time in local 24h format |
| `TWILIO_ENABLED` | No | `false` | Enable SMS delivery |
| `TWILIO_ACCOUNT_SID` | If Twilio | — | Twilio credentials |
| `TWILIO_AUTH_TOKEN` | If Twilio | — | Twilio credentials |
| `TWILIO_FROM_NUMBER` | If Twilio | — | Twilio sending number |
| `TWILIO_TO_NUMBER` | If Twilio | — | User's phone number |
| `VAPID_PUBLIC_KEY` | Generated | — | Web Push VAPID key (generate with `web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Generated | — | Web Push VAPID key |
| `VAPID_EMAIL` | Yes (if push) | — | Contact email for VAPID |
| `PORT` | No | `3000` | Express server port |

---

## Future Scaling Path

### When to Add Cloud Sync
When Pulse needs to work across multiple devices, or the business version requires shared team context. At that point: move from SQLite to Postgres, add a sync API, keep local-first as opt-in.

### When to Add Team Features (Business Version)
After personal v1.0 is stable and used by at least one real person for two weeks. Business version requires multi-user auth, data isolation, and role-based briefings. See `docs/BIZ_ARCHITECTURE.md` (created by BIZ-001).

### When to Build a Native App
When the web-responsive experience on mobile is clearly insufficient. First step: PWA wrapper. Full native only if PWA is insufficient.

### When to Add More Data Sources
After Calendar and Gmail are proven reliable. Next candidates: Slack (OAuth + Events API), GitHub (webhooks or polling). Each connector is isolated — adding one does not touch existing connectors.

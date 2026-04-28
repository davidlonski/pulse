# Pulse — Product Backlog

All work tracked here. Issues are grouped by epic. Status moves from Open → In Progress → Completed.

---

## Epics

| ID | Name | Description |
|---|---|---|
| CORE | Core Infrastructure | Server, auth, storage, config |
| CONNECT | Data Source Connectors | Google Calendar and Gmail integration |
| BRIEF | Morning Briefing Engine | AI-powered daily briefing generation and delivery |
| NUDGE | Proactive Nudge System | Event reminders and scheduled push alerts |
| UI | Dashboard UI | Web interface — feed, panels, status bar |
| BIZ | Business Version | Team brain, per-employee sub-brains (future) |
| INFRA | DevOps & Packaging | Deploy, scripts, health checks, docs |

---

## Issues

---

### [CORE-001] Initialize Express server with base routing
**Epic:** CORE  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Set up the Node.js + Express server as the backbone of Pulse. This is the foundation everything else runs on.

Acceptance criteria:
- [ ] `npm start` starts the server on port 3000
- [ ] GET `/` returns the dashboard HTML
- [ ] GET `/health` returns `{ status: "ok", timestamp: ... }`
- [ ] Server restarts automatically on crash (use `nodemon` for dev, `pm2` for prod)
- [ ] `.env` file loaded via `dotenv` for all secrets and config

---

### [CORE-002] SQLite schema — events, emails, briefings, nudges, settings
**Epic:** CORE  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Design and initialize the full SQLite database schema. All Pulse data lives here.

Tables needed:
- `events` — id, title, start_time, end_time, location, source, synced_at
- `emails` — id, subject, sender, received_at, snippet, is_flagged, synced_at
- `briefings` — id, generated_at, content_raw, content_html
- `nudges` — id, event_id, nudge_type (2hr/30min), sent_at, skipped (bool)
- `settings` — key, value (simple key-value store)

Acceptance criteria:
- [ ] Schema initialized via a `db/init.sql` file on server startup
- [ ] `better-sqlite3` used as the SQLite driver
- [ ] All tables created idempotently (no crash if already exists)
- [ ] `settings` table seeded with defaults: `nudges_per_day=3`, `briefing_time=07:00`
- [ ] Schema is documented with column types and descriptions in `docs/SCHEMA.md`

---

### [CORE-003] Single-user password protection
**Epic:** CORE  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Protect the dashboard with a simple password. Not multi-user auth — just a gate to keep the dashboard private on a shared network.

Acceptance criteria:
- [ ] Password set in `.env` as `PULSE_PASSWORD`
- [ ] Unauthenticated requests to any route redirect to `/login`
- [ ] Session cookie issued on successful login (expires after 7 days)
- [ ] Logout endpoint at GET `/logout`
- [ ] Login page is minimal — just a password field and submit button

---

### [CORE-004] Config and secrets management
**Epic:** CORE  
**Priority:** Critical  
**Effort:** XS  
**Status:** Open  

Establish the pattern for managing all secrets and config so nothing is ever committed to git.

Acceptance criteria:
- [ ] `.env.example` checked into git with all required keys (no values)
- [ ] `.env` added to `.gitignore`
- [ ] Server fails fast with a clear error message if any required env var is missing
- [ ] README includes setup instructions referencing `.env.example`

---

### [CONNECT-001] Google OAuth 2.0 login flow
**Epic:** CONNECT  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Implement Google OAuth so Pulse can read Calendar and Gmail on behalf of the user. Read-only scopes only.

Acceptance criteria:
- [ ] OAuth flow triggered from dashboard settings page
- [ ] Scopes requested: `https://www.googleapis.com/auth/calendar.readonly` and `https://www.googleapis.com/auth/gmail.readonly`
- [ ] Access token and refresh token stored in `settings` table (not in `.env`)
- [ ] Token refresh handled automatically — never expires mid-session
- [ ] Disconnect button revokes token and clears stored credentials
- [ ] OAuth redirect URI works on localhost

---

### [CONNECT-002] Google Calendar connector — fetch next 48h events
**Epic:** CONNECT  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Pull upcoming calendar events and store them in SQLite for use by the briefing engine and dashboard.

Acceptance criteria:
- [ ] Fetches all events from now → +48 hours using `googleapis` npm package
- [ ] Events stored/upserted into `events` table (no duplicates on re-sync)
- [ ] Sync runs every 15 minutes via `node-cron`
- [ ] If Google API returns an error, log it and use cached data — no crash
- [ ] Multi-calendar support: fetches from all calendars in the user's account
- [ ] Recurring events resolved to individual instances (not just the parent)

---

### [CONNECT-003] Gmail connector — fetch and flag important unread emails
**Epic:** CONNECT  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Pull recent unread emails and use Claude Haiku to flag the ones that look important.

Acceptance criteria:
- [ ] Fetches up to 50 unread emails from last 24 hours using Gmail API
- [ ] Emails stored/upserted into `emails` table
- [ ] Flagging logic: emails from known senders (past 30 days), emails with keywords ("urgent", "action", "deadline", "invoice", "meeting") are auto-flagged
- [ ] Claude Haiku used to score remaining emails — "important" vs "routine"
- [ ] Only flagged emails shown in the dashboard feed by default
- [ ] Sync runs every 15 minutes via `node-cron`

---

### [CONNECT-004] Source connection status tracking
**Epic:** CONNECT  
**Priority:** High  
**Effort:** XS  
**Status:** Open  

Track the health of each data source connection so the status bar can display accurate sync state.

Acceptance criteria:
- [ ] `settings` table stores `last_calendar_sync`, `last_gmail_sync` timestamps
- [ ] `last_sync_status` per source: `ok`, `error`, `never`
- [ ] Status bar on dashboard reads from these values
- [ ] If last sync > 30 minutes ago, status bar shows a warning (not an error screen)

---

### [BRIEF-001] Claude Haiku briefing prompt + response parser
**Epic:** BRIEF  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Build the core briefing generation logic using Claude Haiku. Given a structured input of events and flagged emails, produce a concise, plain-language briefing.

Acceptance criteria:
- [ ] Prompt is stored in `lib/briefing/prompt.js` and can be updated without code changes
- [ ] Input: array of events (today + tomorrow) + array of flagged emails
- [ ] Output: plain text paragraph(s), max ~200 words, conversational tone
- [ ] Response parser extracts the briefing text and stores it in the `briefings` table
- [ ] If Claude API call fails, fallback is a structured plain-text summary (event titles + email subjects)
- [ ] API key stored in `.env` as `ANTHROPIC_API_KEY`

---

### [BRIEF-002] Morning briefing cron job (7:00am daily)
**Epic:** BRIEF  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Schedule the morning briefing to generate and deliver every day at 7:00am.

Acceptance criteria:
- [ ] `node-cron` job fires at 7:00am local time (configured via `BRIEFING_TIME` env var)
- [ ] Job pulls latest events + flagged emails from SQLite
- [ ] Calls briefing generator, stores result in `briefings` table
- [ ] Triggers a browser push notification via Web Push API: "Your morning briefing is ready"
- [ ] Optionally sends SMS via Twilio if `TWILIO_ENABLED=true` in `.env`
- [ ] If briefing generation fails, fallback briefing is generated and stored — job never silently dies

---

### [BRIEF-003] Twilio SMS delivery (optional)
**Epic:** BRIEF  
**Priority:** Medium  
**Effort:** S  
**Status:** Open  

Add optional SMS delivery of the morning briefing via Twilio.

Acceptance criteria:
- [ ] Controlled by `TWILIO_ENABLED=true` in `.env`
- [ ] Required env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_TO_NUMBER`
- [ ] SMS text is a truncated version of the briefing (≤320 chars)
- [ ] If Twilio fails, log error — do not crash the briefing job
- [ ] Setup instructions in README under "Optional: SMS Briefing"

---

### [BRIEF-004] Briefing history — store and retrieve past briefings
**Epic:** BRIEF  
**Priority:** High  
**Effort:** S  
**Status:** Open  

Store all generated briefings so users can look back at past mornings.

Acceptance criteria:
- [ ] `briefings` table stores: id, generated_at, content_raw, content_html
- [ ] GET `/api/briefings` returns last 14 briefings (paginated)
- [ ] Dashboard displays the most recent briefing prominently, with a "History" toggle to see past ones
- [ ] Each briefing card shows date/time generated and content

---

### [NUDGE-001] Nudge engine — 2-hour event reminder
**Epic:** NUDGE  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Detect upcoming events and send a calm browser notification 2 hours before they start.

Acceptance criteria:
- [ ] Cron job runs every 5 minutes, checks for events starting in 115–125 minutes
- [ ] If user opened dashboard in last 30 minutes, skip nudge (they already know)
- [ ] If daily nudge limit (3) is reached, skip and log
- [ ] Browser push notification text: "You have [event title] in 2 hours."
- [ ] Nudge recorded in `nudges` table: event_id, nudge_type=`2hr`, sent_at
- [ ] Same event never nudged twice for the same nudge_type

---

### [NUDGE-002] Nudge engine — 30-minute event reminder
**Epic:** NUDGE  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Send a nudge 30 minutes before an event starts.

Acceptance criteria:
- [ ] Cron job checks for events starting in 25–35 minutes
- [ ] Same skip logic as NUDGE-001 (last-opened check, daily limit)
- [ ] Notification text: "Starting in 30 minutes: [event title]"
- [ ] Nudge recorded in `nudges` table with nudge_type=`30min`
- [ ] If both 2hr and 30min nudges would fire for the same event on a limit-reached day, prefer the 30-minute one

---

### [NUDGE-003] Web Push notification setup (VAPID)
**Epic:** NUDGE  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Set up Web Push (VAPID) so the browser can receive push notifications from the local server, even when the tab isn't focused.

Acceptance criteria:
- [ ] VAPID keys generated and stored in `.env`
- [ ] Service worker registered in the browser on first dashboard load
- [ ] User prompted once to allow notifications
- [ ] `web-push` npm package used on the server side
- [ ] Push subscription stored in `settings` table
- [ ] Test push notification available via GET `/api/nudge/test`

---

### [NUDGE-004] Daily nudge quota tracking
**Epic:** NUDGE  
**Priority:** High  
**Effort:** XS  
**Status:** Open  

Track how many nudges have been sent today and enforce the daily maximum (default: 3).

Acceptance criteria:
- [ ] Nudge count resets at midnight via cron job
- [ ] Count stored in `settings` table: `nudges_sent_today`
- [ ] All nudge jobs check this count before sending
- [ ] Status bar shows "Nudges today: 2/3" so user has visibility
- [ ] Max configurable via `settings` table key `nudges_per_day`

---

### [UI-001] Dashboard layout — three-panel feed
**Epic:** UI  
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Build the main dashboard layout with the three panels: today's feed, morning briefing card, and status bar.

Acceptance criteria:
- [ ] Pure HTML/CSS/JS — no build step, no frameworks, no bundler
- [ ] Responsive layout: single column on mobile, two columns on desktop
- [ ] Panel 1: Today's Feed — chronological list of upcoming events + flagged emails for next 48h
- [ ] Panel 2: Morning Briefing card — latest briefing content, "History" link
- [ ] Panel 3: Status bar — last sync time per source, nudges today count, connection indicators
- [ ] Auto-refreshes every 5 minutes without full page reload (fetch + DOM update)
- [ ] Loads in under 2 seconds on localhost

---

### [UI-002] Upcoming events panel
**Epic:** UI  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Display upcoming calendar events for the next 48 hours in the feed.

Acceptance criteria:
- [ ] Events displayed in chronological order
- [ ] Each event shows: title, start time, duration, location (if present)
- [ ] "Today" vs "Tomorrow" section dividers
- [ ] Events starting within 2 hours highlighted visually (e.g., accent color)
- [ ] If no events in next 48h, show "Nothing on the calendar — you're clear."
- [ ] Data pulled from GET `/api/events` endpoint

---

### [UI-003] Flagged emails panel
**Epic:** UI  
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Display flagged emails in the feed with enough context to act on them without opening Gmail.

Acceptance criteria:
- [ ] Shows sender name/address, subject, time received, and snippet (first 100 chars)
- [ ] Sorted by received time (newest first)
- [ ] Clicking an email opens it in Gmail (new tab) via direct link
- [ ] "Mark as reviewed" button removes it from the feed (sets `is_flagged=false` locally)
- [ ] If no flagged emails, show "Inbox looks quiet."
- [ ] Data pulled from GET `/api/emails/flagged`

---

### [UI-004] Login page
**Epic:** UI  
**Priority:** Critical  
**Effort:** XS  
**Status:** Open  

Simple password-gated login page. Minimal design.

Acceptance criteria:
- [ ] Single password field, submit button
- [ ] On success: session cookie set, redirect to dashboard
- [ ] On failure: inline error "Wrong password. Try again." — no redirect
- [ ] No username field — single user only
- [ ] Works on mobile

---

### [UI-005] Source connection settings page
**Epic:** UI  
**Priority:** High  
**Effort:** S  
**Status:** Open  

A simple settings page where the user can connect or disconnect Google Calendar and Gmail.

Acceptance criteria:
- [ ] Accessible at `/settings`
- [ ] Shows connection status for each source (connected / not connected)
- [ ] "Connect Google" button triggers OAuth flow
- [ ] "Disconnect" button revokes token and clears stored credentials
- [ ] After connecting, redirects back to dashboard with a success message
- [ ] No other settings on this page in MVP (nudge limits, themes etc. are future)

---

### [INFRA-001] Health check endpoint
**Epic:** INFRA  
**Priority:** High  
**Effort:** XS  
**Status:** Open  

A simple health check endpoint for monitoring and process management.

Acceptance criteria:
- [ ] GET `/health` returns JSON: `{ status: "ok", uptime: <seconds>, db: "ok"|"error", lastSync: { calendar: ..., gmail: ... } }`
- [ ] Returns HTTP 200 if healthy, HTTP 503 if database is unreachable
- [ ] Used by `pm2` for auto-restart decisions

---

### [INFRA-002] Deploy script for Mac Studio
**Epic:** INFRA  
**Priority:** High  
**Effort:** S  
**Status:** Open  

A simple deploy/start script so Pulse runs persistently on the Mac Studio as a background service.

Acceptance criteria:
- [ ] `scripts/start.sh` installs dependencies, initializes DB, and starts the server via `pm2`
- [ ] Pulse auto-starts on system boot (pm2 startup hook)
- [ ] `scripts/stop.sh` stops the pm2 process cleanly
- [ ] `scripts/logs.sh` tails the pm2 log file
- [ ] README includes "Running Pulse on Mac Studio" section with step-by-step instructions

---

### [INFRA-003] README setup guide
**Epic:** INFRA  
**Priority:** High  
**Effort:** S  
**Status:** Open  

A complete, accurate README that lets someone set up Pulse from scratch in under 15 minutes.

Acceptance criteria:
- [ ] Prerequisites listed: Node.js version, Google Cloud project, Anthropic API key
- [ ] Step-by-step: clone → `.env` setup → `npm install` → `npm start`
- [ ] Google OAuth setup instructions (how to create the Cloud project, enable APIs, set redirect URI)
- [ ] Optional Twilio setup section
- [ ] Troubleshooting section: common errors and fixes
- [ ] Screenshots of the dashboard (added after UI is built)

---

### [BIZ-001] Business version — team brain architecture design
**Epic:** BIZ  
**Priority:** Low  
**Effort:** XL  
**Status:** Open  

Design the architecture for the business version of Pulse — a company-wide brain plus per-employee sub-brains.

This is a research and design spike, not implementation. Output is a design doc.

Acceptance criteria:
- [ ] `docs/BIZ_ARCHITECTURE.md` created with proposed architecture
- [ ] Covers: multi-user auth, shared company context (shared calendar, announcements), per-employee private context
- [ ] Addresses: data isolation between employees, admin vs member roles, how briefings differ for managers vs ICs
- [ ] Identifies the biggest technical risks and open questions
- [ ] Does NOT block or depend on any MVP work

---

### [BIZ-002] Business version — per-employee sub-brain concept
**Epic:** BIZ  
**Priority:** Low  
**Effort:** L  
**Status:** Open  

Define what a "per-employee sub-brain" looks like — its data sources, its briefing style, its relationship to the company brain.

Acceptance criteria:
- [ ] Design doc added to `docs/BIZ_EMPLOYEE_BRAIN.md`
- [ ] Covers: what data sources are private vs shared, how the briefing blends personal + company context
- [ ] Proposes UI: does each employee have their own dashboard? Or one shared dashboard with roles?
- [ ] Lists the minimum viable set of features for a 5-person team pilot

---

### [BIZ-003] Native mobile / watch app research spike
**Epic:** BIZ  
**Priority:** Low  
**Effort:** M  
**Status:** Open  

Research the feasibility and approach for a native mobile or Apple Watch app as a delivery surface for Pulse nudges.

Acceptance criteria:
- [ ] `docs/NATIVE_APP_SPIKE.md` created
- [ ] Covers React Native vs Swift/Kotlin native vs PWA tradeoffs
- [ ] Covers Watch OS notification delivery constraints
- [ ] Estimates effort for a basic nudge-delivery-only native app
- [ ] Identifies blockers (e.g., App Store distribution, push notification infra changes)

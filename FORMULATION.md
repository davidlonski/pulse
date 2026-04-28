# Pulse — Product Formulation Standard

This document defines the standards, principles, and constraints that govern all product decisions for Pulse. Every feature, design choice, and architecture decision must be evaluated against this standard before it ships. If a proposed change conflicts with what's written here, this document wins — or you amend this document first, deliberately and explicitly, not by accident.

---

## Core Principles

### 1. Proactive Over Reactive
Pulse speaks first. The user never has to ask. If Pulse requires the user to open an app, type a query, or configure a rule to get value — it has failed. Value is delivered unprompted, at the right time, in the right format. The moment Pulse starts feeling like a tool you have to use instead of a system that serves you, something has gone wrong.

### 2. Zero Cognitive Load
Opening Pulse should never feel like work. The dashboard is not a task manager, not an inbox, not a command center. It is a calm feed of things that already matter. No red badges demanding action. No list of 47 items to triage. No settings that require tuning. A person who is exhausted, distracted, or overwhelmed should be able to glance at Pulse and come away with exactly the context they need — nothing more.

### 3. Privacy by Default
Data stays on the user's machine. No analytics, no telemetry, no third-party data pipelines. Cloud sync is opt-in, never opt-out, never assumed. When Pulse connects to a Google account, it reads only what it needs, stores locally, and never transmits that data elsewhere. The user owns everything. If they delete their local database, it's gone — not backed up somewhere we control.

### 4. Works Quietly
Background tasks never interrupt. Scheduled jobs run silently. If a sync fails, it retries — it does not alert the user or log an error to the screen. Nudges are calm: short, clear, not alarming. Push notifications say "Your 2pm call is in 2 hours" — not "⚠️ UPCOMING EVENT — ACTION REQUIRED." The tone of the entire product is a trusted colleague who taps you on the shoulder, not a pager going off.

### 5. Earns Trust Before Expanding
Pulse never reads a new data source without explicit user consent — every time, not just the first time. If we want to add SMS reading or Slack monitoring, the user must actively turn it on and understand what Pulse will access. Consent is not buried in a settings page. It is a deliberate, visible action. Trust is earned incrementally. Pulse proves itself with calendar and email before it earns the right to read anything else.

---

## Product Standards

### Delivery Surface
- Web-first, mobile-responsive
- Must work in Chrome, Safari, and Firefox with no degradation
- Native mobile app is a future milestone, not a current priority
- No Electron app — running as a local web server is sufficient for MVP

### AI Usage
- AI summarizes and prioritizes only — it never takes autonomous actions
- Claude (or equivalent) is used to generate briefings and flag important emails
- AI output is always reviewed by the display layer — never piped raw to the user
- If the AI call fails, Pulse falls back to a structured non-AI summary (raw event list + email subjects)
- AI never sends messages, creates events, or modifies any connected data source

### Data Policy
- Read-only from all sources. Pulse cannot send emails, move events, create calendar items, or modify anything in any connected account. Ever. This is not a limitation of MVP — it is a permanent product principle.
- Stored locally in SQLite. No remote database unless cloud sync is explicitly enabled by the user.
- OAuth tokens are stored in local `.env` or encrypted local config — never committed to git, never logged.

### Reminder Frequency
- Maximum 3 proactive nudges per day. Never more, regardless of how many triggers fire.
- If the user has already opened the dashboard within the last 30 minutes, skip the nudge — they already know.
- Nudges are queued and deduped. The same event does not trigger the same nudge twice.
- Users control nudge limits (future: settings page). Default is 3/day.

### Failure Mode
- If a data source goes down or returns an error, Pulse shows what it has from its last successful sync. It does not show an error screen to the user.
- Status bar (visible, not intrusive) shows "Last synced: 2h ago" so the user knows the data age.
- Errors are logged to a local log file. Never displayed raw to the user.
- If the AI briefing call fails, show the raw structured summary instead. Never a blank card.

---

## Feature Evaluation Checklist

Before any feature is added to the backlog or approved for development, answer every question:

- [ ] **Does it reduce cognitive load, or increase it?** If it adds a setting to configure, a step to complete, or information to process — justify clearly why the tradeoff is worth it.
- [ ] **Does it require user action to get value?** If yes, reconsider. Pulse's value is in being proactive. Features that require interaction should be rare exceptions, not the norm.
- [ ] **Does it touch data the user hasn't explicitly connected?** If yes, stop. Do not implement until explicit consent is designed into the feature flow.
- [ ] **Does it work without an internet connection (except AI calls)?** Calendar and email data is cached locally. The dashboard should load and show cached data with no network. AI calls can fail gracefully.
- [ ] **Could it overwhelm the user if overused?** Nudges, badges, cards, counts — all of these can tip from useful to noise. Define the max exposure rate before building.

---

## Definition of Done

A feature is not done until all of the following are true:

- [ ] Works correctly on Chrome, Safari, and Firefox (latest versions)
- [ ] Layout is correct and usable on mobile viewport (375px wide minimum)
- [ ] No uncaught JavaScript errors in the browser console
- [ ] No unhandled promise rejections in the Node.js server logs
- [ ] Tested with at least one real data source (not just mock data)
- [ ] Failure case is handled — what happens if the data source is unavailable?
- [ ] The feature is documented in BACKLOG.md as **Completed** with the ship date
- [ ] If the feature touches auth, tokens, or user data — reviewed against the Data Policy above
- [ ] If the feature sends a notification or nudge — reviewed against Reminder Frequency limits

---

## Versioning Philosophy

- MVP = Personal, local, Google Calendar + Gmail, morning briefing, nudges, dashboard
- v1.0 = MVP + stable, tested, documented, used by at least one real person for 2 weeks
- v1.x = Additional personal sources (SMS, Slack), improved AI quality, mobile-responsive polish
- v2.0 = Business version — team brain, per-employee sub-brains, admin dashboard
- vNext = Native mobile app, watch integration, offline-first sync engine

No version skips. Business features do not get built until personal v1.0 is solid. Native app does not get built until web is proven.

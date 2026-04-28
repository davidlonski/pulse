# Pulse MVP — Minimum Viable Product

The smallest version of Pulse that proves the concept and is usable by a real person for at least two weeks straight. No fluff, no scope creep — just the core loop working end to end.

---

## Scope: Personal Only

The MVP is personal-only. No team features, no multi-user support, no business tier. One person, their Google Calendar, their Gmail, one machine.

---

## Sources

| Source | Access | Scope |
|---|---|---|
| Google Calendar | OAuth read-only | Events for today and tomorrow |
| Gmail | OAuth read-only | Unread emails, last 24 hours |

No other sources in MVP. No texts, no Slack, no Notion.

---

## Delivery

- **Web dashboard** — runs locally (http://localhost:3000), responsive enough to use on phone browser
- **Morning briefing** — daily at 7:00am, delivered as a push notification (browser notification) + optional SMS via Twilio

No mobile app. No native notifications outside browser. No email delivery of the briefing (we're not adding to the noise).

---

## Core Feature: Morning Briefing

Every morning at 7:00am, Pulse generates and delivers a briefing:

> "Here's what needs your attention today."

The briefing pulls from:
- Calendar events happening today and tomorrow
- Unread emails from the last 24 hours that look important (filtered by Claude Haiku)

Claude Haiku formats the briefing in plain language — not a wall of raw data. Something like:

> "You have a 10am call with Marcus and a dentist appointment at 3pm. Two emails flagged: one from your landlord (unread, 18 hours), one from your boss (unread, 6 hours). No action items from calendar tonight."

The briefing is stored in SQLite so you can review past mornings.

---

## Proactive Nudges

Outside the morning briefing, Pulse sends nudges when:

1. **Event in 2 hours** — if you haven't opened the dashboard in the last 30 minutes, send a browser notification: "You have [event name] in 2 hours."
2. **Event in 30 minutes** — same logic, more urgent: "Starting in 30 minutes: [event name]."

Max 3 nudges per day total. If more than 3 triggers fire, queue them and deliver only the 3 most urgent.

---

## Web UI

A live feed, not a chat interface. Three panels:

1. **Today's Feed** — chronological list of upcoming events (next 48 hours) and flagged emails. Updates every 5 minutes.
2. **Morning Briefing** — the latest generated briefing in a readable card. Click to see history.
3. **Status Bar** — shows last sync time, connected sources (green/red), and nudge count for today.

No settings page in MVP beyond connecting/disconnecting Google. No custom rules. No themes.

---

## Out of Scope for MVP

These are explicitly deferred. Do not build them now.

- Business / team version
- Watch or native mobile app
- Reading SMS / iMessage / WhatsApp sources
- AI-generated summaries beyond the morning briefing
- Custom reminder rule builder (UI)
- Email or calendar write actions of any kind
- Multi-user or family plans
- Cloud sync or remote hosting
- Notification history / replay
- Dark mode (do it later)

---

## Success Criteria

The MVP is proven when:

1. A real person (David or someone they hand it to) uses Pulse for **2 weeks straight without being prompted** to do so
2. It surfaces **at least 3 things** that person would have otherwise forgotten or missed
3. The dashboard **loads in under 2 seconds** on localhost
4. Zero crashes or blank screens during those 2 weeks (errors are logged, never shown raw to the user)

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | Node.js + Express | Fast to build, same ecosystem as googleapis |
| Frontend | Pure HTML/CSS/JS | No build step, loads instantly, zero dependencies |
| AI | Claude Haiku (Anthropic API) | Fast, cheap, smart enough for briefing generation |
| Calendar + Gmail | googleapis npm package + Google OAuth 2.0 | Official, well-documented, handles token refresh |
| Scheduled jobs | node-cron | Lightweight, no external dependencies |
| Storage | SQLite (via better-sqlite3) | Zero setup, survives restarts, plenty fast for one user |
| SMS (optional) | Twilio Node SDK | Cheapest way to send a text, pay-per-message |
| Hosting | Local Mac Studio | No cloud costs, no latency, runs 24/7 |

---

## Rough Timeline (30 days)

| Week | Focus |
|---|---|
| Week 1 | Server setup, OAuth flow, Google Calendar + Gmail connectors, SQLite schema |
| Week 2 | Briefing engine (Claude Haiku prompt + parser), morning cron job, basic dashboard UI |
| Week 3 | Nudge engine (2hr + 30min reminders), browser notifications, polish UI |
| Week 4 | Real-world testing (David uses it daily), bug fixes, success criteria validation |

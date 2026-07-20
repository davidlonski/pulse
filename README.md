# Pulse — Proactive Second Brain

*You don't ask it. It tells you.*

---

## What It Is

Most people don't forget things because they're careless — they forget because the signal is buried in noise. Your inbox has 200 unread messages. Your calendar has 12 events this week. Your texts have threads you haven't touched in days. The information exists. The problem is nobody is watching it *for you* and tapping you on the shoulder at the right moment. Pulse is that tap on the shoulder.

Pulse is a proactive ambient second brain that connects to your emails, calendar, and messages, then surfaces what matters — before you think to ask. It's not a chat interface. You don't query it. It watches quietly in the background and when something needs your attention — an event in two hours, an email that's been sitting too long, a deadline coming up fast — it tells you. Think of it as a screen on your wall or phone that always shows exactly what you need to know right now, without you lifting a finger.

---

## Two Versions

### 🧑 Personal
Built for individuals. Connects to your Google Calendar and Gmail, generates a morning briefing every day at 7am, and sends proactive nudges throughout the day. Runs locally on your machine — your data never leaves your device unless you explicitly enable cloud sync. Designed to feel like a calm, trusted assistant that earns its place on your screen.

### 🏢 Business
Everything in Personal, plus a **company-wide brain** (shared context across the org — deadlines, priorities, company calendar) and **per-employee sub-brains** (each person's private stream, personalized to their role and workload). Team leads see what their team needs. Employees see what they need. Managers see what's slipping. The business version is the future; the personal version is the foundation.

---

## How It Works

1. **Connect your sources** — Link your Google Calendar and Gmail with one OAuth login. Read-only. Pulse never sends, modifies, or deletes anything.
2. **It monitors** — Pulse runs quietly in the background, checking your calendar and inbox on a schedule. It learns what looks urgent, what looks routine, and what's coming up soon.
3. **It surfaces what matters** — Every morning you get a briefing. Throughout the day, calm nudges appear when something needs attention. No noise, no interruptions — just the right thing at the right time.

---

## Repo Structure

```
pulse/
├── README.md              ← This file
├── MVP.md                 ← What we're building first and why
├── FORMULATION.md         ← Product standards and principles
├── BACKLOG.md             ← Epics and issues
└── docs/
    └── ARCHITECTURE.md    ← System design and data flow
```

---

## Quick Links

- [MVP.md](./MVP.md) — The smallest thing that proves the concept, usable in 30 days
- [FORMULATION.md](./FORMULATION.md) — The standards every feature must pass
- [BACKLOG.md](./BACKLOG.md) — Full backlog with epics, priorities, and acceptance criteria
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — How the system is built and why

---

## Quickstart

```bash
cp .env.example .env      # fill in PULSE_PASSWORD + Google OAuth + SESSION_SECRET
npm install
npm start                 # → http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health   # {"status":"ok","ts":"..."}
```

Tests:

```bash
npm test                 # Node built-in test runner
```

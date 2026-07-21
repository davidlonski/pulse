import { openDb } from "../src/db/index.js";

// Seeds a small set of demo rows so the dashboard renders something
// before Google OAuth is configured. Safe to re-run (idempotent-ish:
// uses unique google_id/gmail_id per run via a fixed demo prefix).
const DEMO_PREFIX = "demo-";

function iso(offsetHours) {
  return new Date(Date.now() + offsetHours * 3600_000)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "");
}

const db = openDb();

const events = [
  { gid: DEMO_PREFIX + "ev1", title: "Standup with MJL team", start: 1, end: 1.5, loc: "Zoom" },
  { gid: DEMO_PREFIX + "ev2", title: "Onsite walk-through — 12 Oak", start: 4, end: 5.5, loc: "12 Oak St" },
  { gid: DEMO_PREFIX + "ev3", title: "Concepts Loop review", start: 28, end: 29, loc: null },
];
const insEvent = db.prepare(
  `INSERT OR IGNORE INTO events (google_id, title, start_time, end_time, location) VALUES (?, ?, ?, ?, ?)`
);
for (const e of events) {
  insEvent.run(e.gid, e.title, iso(e.start), iso(e.end), e.loc);
}

const emails = [
  { gid: DEMO_PREFIX + "em1", sender: "accounts@mjl.com", subject: "Invoice #4421 ready", snippet: "Your invoice for July flooring work is attached…", recv: -2, flagged: 1 },
  { gid: DEMO_PREFIX + "em2", sender: "ops@openclaw.dev", subject: "Concepts Loop: 3 new concepts", snippet: "Three concepts queued for your review…", recv: -6, flagged: 1 },
  { gid: DEMO_PREFIX + "em3", sender: "newsletter@x.com", subject: "Weekly digest", snippet: "Top stories this week…", recv: -10, flagged: 0 },
];
const insEmail = db.prepare(
  `INSERT OR IGNORE INTO emails (gmail_id, sender, subject, snippet, received_at, is_flagged, scored_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
);
for (const m of emails) {
  insEmail.run(m.gid, m.sender, m.subject, m.snippet, iso(m.recv), m.flagged);
}

const briefing = `PULSE BRIEFING — ${new Date().toLocaleDateString()}

• 3 events today; first up: Standup with MJL team (Zoom, +1h).
• 2 flagged emails need a look — invoice #4421 and Concepts Loop queue.
• Onsite walk-through at 12 Oak in the afternoon; leave buffer for travel.

No nudges fired yet. Sources: demo data (Google not connected).`;
db.prepare(
  `INSERT INTO briefings (generated_at, content_raw) VALUES (datetime('now'), ?)`
).run(briefing);

db.prepare(
  `INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', datetime('now'))`
).run();

console.log("Demo data seeded.");

import { openDb } from "../db/index.js";
import { chatCompletion } from "../ollama/client.js";

const SYSTEM =
  "You are Pulse, a proactive second brain. Write a concise, calm morning briefing in plain language summarizing what needs the user's attention today. No raw data dumps, no headers, no bullet lists — just 3–6 sentences the way a trusted assistant would tell you.";

function buildUserPrompt(events, emails) {
  const parts = [];
  parts.push("Calendar (next 48h):");
  parts.push(
    events.length
      ? events
          .map((e) => `- ${e.title} at ${e.start_time}${e.location ? ` (${e.location})` : ""}`)
          .join("\n")
      : "(none)"
  );
  parts.push("\nFlagged unread email (last 24h):");
  parts.push(
    emails.length
      ? emails
          .map((m) => `- From ${m.sender}: ${m.subject} — ${(m.snippet ?? "").slice(0, 120)}`)
          .join("\n")
      : "(none)"
  );
  return parts.join("\n");
}

function fallbackText(events, emails) {
  const lines = [];
  if (events.length) {
    lines.push("Today:");
    for (const e of events.slice(0, 10)) lines.push(`- ${e.title} (${e.start_time})`);
  }
  if (emails.length) {
    lines.push("Flagged email:");
    for (const m of emails.slice(0, 5)) lines.push(`- ${m.subject} (from ${m.sender})`);
  }
  if (!lines.length) lines.push("Nothing needs your attention right now.");
  return lines.join("\n");
}

/**
 * Generate the morning briefing from upcoming events + flagged emails.
 * Pulls from SQLite, calls the local LLM (scorer), stores the result in `briefings`.
 * On any LLM failure, stores a structured plain-text fallback — never returns blank.
 *
 * @returns {Promise<{ ok: true, text: string, fallback: boolean, events: number, emails: number }>}
 */
export async function generateBriefing({ db, _scorer, now = new Date() } = {}) {
  const localDb = db ?? openDb();
  const ownDb = !db;
  const scorer = _scorer ?? chatCompletion;

  const iso = now.toISOString();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const events = localDb
    .prepare(
      "SELECT title, start_time, end_time, location FROM events WHERE start_time BETWEEN ? AND ? ORDER BY start_time"
    )
    .all(iso, horizon);

  const emails = localDb
    .prepare(
      "SELECT sender, subject, snippet FROM emails WHERE is_flagged = 1 AND received_at > ? ORDER BY received_at DESC"
    )
    .all(since);

  const r = await scorer({ system: SYSTEM, user: buildUserPrompt(events, emails) });

  let text;
  let fallback = false;
  if (r.ok && r.text && r.text.trim()) {
    text = r.text.trim();
  } else {
    text = fallbackText(events, emails);
    fallback = true;
  }

  localDb.prepare("INSERT INTO briefings(generated_at, content_raw) VALUES (?, ?)").run(iso, text);

  if (ownDb) localDb.close();
  return { ok: true, text, fallback, events: events.length, emails: emails.length };
}

export { SYSTEM, buildUserPrompt, fallbackText };

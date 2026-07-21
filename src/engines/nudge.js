import { openDb } from "../db/index.js";

const RECENT_OPEN_WINDOW_MS = 30 * 60 * 1000; // skip nudges if dashboard opened in the last 30 min

const CHECKS = [
  { type: "2h", leadMin: 125, slackMin: 5 }, // event in ~2h → 115–125 min ahead
  { type: "30m", leadMin: 35, slackMin: 5 }, // event in ~30min → 25–35 min ahead
];

function setting(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

/**
 * Detect upcoming events and record proactive nudges (2h + 30min reminders).
 * Respects: already-nudged (per event+type), recent dashboard open, and a daily cap.
 * Records nudges in the `nudges` table; does NOT deliver them (web-push delivery is a
 * separate concern — this engine produces the nudge records a delivery layer will send).
 *
 * @returns {{ sent: object[], skipped: object[] }}
 */
export function runNudges({ db, now = new Date(), nudgesPerDay = 3 } = {}) {
  const localDb = db ?? openDb();
  const ownDb = !db;
  const iso = now.toISOString();
  const today = iso.slice(0, 10);

  // daily reset
  if (setting(localDb, "nudges_date") !== today) {
    setSetting(localDb, "nudges_date", today);
    setSetting(localDb, "nudges_sent_today", 0);
  }
  const sentToday = Number(setting(localDb, "nudges_sent_today", 0));
  const lastOpen = setting(localDb, "last_dashboard_open");
  const openedRecently =
    lastOpen && new Date(lastOpen).getTime() > now.getTime() - RECENT_OPEN_WINDOW_MS;

  const sent = [];
  const skipped = [];

  const insertNudge = localDb.prepare(
    "INSERT INTO nudges(event_id, nudge_type, sent_at) VALUES (?, ?, ?)"
  );
  const alreadyNudged = localDb.prepare(
    "SELECT 1 FROM nudges WHERE event_id = ? AND nudge_type = ?"
  );

  for (const c of CHECKS) {
    const lo = new Date(now.getTime() + (c.leadMin - c.slackMin) * 60 * 1000).toISOString();
    const hi = new Date(now.getTime() + (c.leadMin + c.slackMin) * 60 * 1000).toISOString();
    const candidates = localDb
      .prepare("SELECT id, title, start_time FROM events WHERE start_time BETWEEN ? AND ? ORDER BY start_time")
      .all(lo, hi);

    for (const ev of candidates) {
      if (alreadyNudged.get(ev.id, c.type)) {
        skipped.push({ event_id: ev.id, type: c.type, reason: "already_nudged" });
        continue;
      }
      if (openedRecently) {
        skipped.push({ event_id: ev.id, type: c.type, reason: "dashboard_open_recent" });
        continue;
      }
      if (sentToday + sent.length >= nudgesPerDay) {
        skipped.push({ event_id: ev.id, type: c.type, reason: "daily_limit" });
        continue;
      }
      insertNudge.run(ev.id, c.type, iso);
      sent.push({ event_id: ev.id, type: c.type, title: ev.title });
    }
  }

  setSetting(localDb, "nudges_sent_today", sentToday + sent.length);

  if (ownDb) localDb.close();
  return { sent, skipped };
}

export { CHECKS };

import { Router } from "express";

export function createApiRouter(getDb) {
  const router = new Router();

  router.get("/events", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, title, start_time, end_time, location
         FROM events
         WHERE start_time >= datetime('now')
           AND start_time <= datetime('now', '+48 hours')
         ORDER BY start_time ASC`
      )
      .all();
    res.json({ events: rows });
  });

  router.get("/emails/flagged", (_req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT id, sender, subject, snippet, received_at
         FROM emails
         WHERE is_flagged = 1
           AND received_at >= datetime('now', '-24 hours')
         ORDER BY received_at DESC`
      )
      .all();
    res.json({ emails: rows });
  });

  router.get("/briefings", (_req, res) => {
    const db = getDb();
    const latest = db
      .prepare(
        `SELECT id, generated_at, content_raw
         FROM briefings
         ORDER BY generated_at DESC
         LIMIT 1`
      )
      .get();
    const history = db
      .prepare(
        `SELECT id, generated_at
         FROM briefings
         ORDER BY generated_at DESC
         LIMIT 10`
      )
      .all();
    res.json({ latest, history });
  });

  router.get("/status", (_req, res) => {
    const db = getDb();
    const get = (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
    const nudgesToday = db
      .prepare(
        `SELECT COUNT(*) AS n FROM nudges
         WHERE date(sent_at) = date('now')`
      )
      .get()?.n ?? 0;
    res.json({
      last_sync: get("last_sync") ?? null,
      sources: {
        calendar: Boolean(get("google_connected")),
        gmail: Boolean(get("google_connected")),
      },
      nudges_today: nudgesToday,
    });
  });

  return router;
}

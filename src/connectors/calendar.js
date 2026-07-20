import { openDb } from "../db/index.js";

/**
 * Sync today + tomorrow's Google Calendar events into the `events` table.
 *
 * @param {object} args
 * @param {object} args.oauth2Client  An authenticated google.auth.OAuth2 instance.
 * @param {object} [args.db]          An open node:sqlite DatabaseSync (default: openDb()).
 * @param {object} [args._calendarApi] Injected calendar events API for testing
 *                                     (defaults to google.calendar('v3', { auth }).events).
 * @returns {Promise<{ synced: number, errors: string[] }>}
 */
export async function syncCalendar({ oauth2Client, db, _calendarApi } = {}) {
  const localDb = db ?? openDb();
  const ownDb = !db;

  const calendarApi =
    _calendarApi ?? (await import("googleapis")).google.calendar({ version: "v3", auth: oauth2Client }).events;

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  let events = [];
  let errors = [];
  try {
    const res = await calendarApi.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: horizon.toISOString(),
      singleEvents: true,
      maxResults: 250,
    });
    events = res.data.items ?? [];
  } catch (err) {
    errors.push(String(err?.message ?? err));
  }

  const upsert = localDb.prepare(
    `INSERT INTO events(google_id, title, start_time, end_time, location)
     VALUES ($gid, $title, $st, $et, $loc)
     ON CONFLICT(google_id) DO UPDATE SET
       title = excluded.title, start_time = excluded.start_time,
       end_time = excluded.end_time, location = excluded.location`
  );

  let synced = 0;
  for (const ev of events) {
    const gid = ev.id;
    if (!gid) continue;
    upsert.run({
      gid,
      title: ev.summary ?? "(untitled)",
      st: ev.start?.dateTime ?? ev.start?.date ?? now.toISOString(),
      et: ev.end?.dateTime ?? ev.end?.date ?? null,
      loc: ev.location ?? null,
    });
    synced++;
  }

  if (ownDb) localDb.close();
  return { synced, errors };
}

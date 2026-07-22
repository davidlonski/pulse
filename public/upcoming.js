// Upcoming events panel — pure helpers (browser + node test safe).
// The /api/events endpoint returns events as {id, title, start_time, end_time, location}
// where start_time is a SQLite UTC datetime string like "2026-07-21 14:30:00" (no Z).
// Append "Z" to get a Date in UTC; the existing fmt() helper does the same.

const AMBER_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// Parse a SQLite UTC datetime string ("YYYY-MM-DD HH:MM:SS") to a Date.
// Returns null on invalid input.
function parseEventTime(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

// True if `when` is between `now` and `now + AMBER_WINDOW_MS` (inclusive of future, exclusive of past).
function isImminent(when, now = new Date()) {
  const t = parseEventTime(when);
  if (!t) return false;
  const diff = t.getTime() - now.getTime();
  return diff >= 0 && diff <= AMBER_WINDOW_MS;
}

// Local YYYY-MM-DD key for a Date (so we can group by local calendar day).
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Bucket events into { today: [...], tomorrow: [...] } using local calendar days.
// Events beyond tomorrow are dropped (the 48h endpoint window should not produce any).
// `now` is injectable for tests.
function bucketizeEvents(events, now = new Date()) {
  const todayKey = localDateKey(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = localDateKey(tomorrow);
  const today = [];
  const tmrw = [];
  for (const e of events || []) {
    const t = parseEventTime(e?.start_time);
    if (!t) continue;
    const k = localDateKey(t);
    if (k === todayKey) today.push(e);
    else if (k === tomorrowKey) tmrw.push(e);
  }
  today.sort((a, b) => parseEventTime(a.start_time) - parseEventTime(b.start_time));
  tmrw.sort((a, b) => parseEventTime(a.start_time) - parseEventTime(b.start_time));
  return { today, tomorrow: tmrw };
}

export { AMBER_WINDOW_MS, parseEventTime, isImminent, localDateKey, bucketizeEvents };

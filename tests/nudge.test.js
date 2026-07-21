import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db/index.js";
import { runNudges } from "../src/engines/nudge.js";

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  return openDb(path.join(dir, "test.sqlite"));
}

const NOW = new Date("2026-07-21T12:00:00Z");

function addEvent(db, { id, gid = "g" + id, title, start }) {
  db.prepare(
    "INSERT INTO events(id, google_id, title, start_time) VALUES (?,?,?,?)"
  ).run(id, gid, title, start);
}

function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

test("2h event → nudge sent with type 2h", () => {
  const db = tmpDb();
  addEvent(db, { id: 1, title: "Dentist", start: new Date(NOW.getTime() + 120 * 60 * 1000).toISOString() });
  const r = runNudges({ db, now: NOW });
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].type, "2h");
  assert.equal(r.sent[0].title, "Dentist");
  db.close();
});

test("30m event → nudge sent with type 30m", () => {
  const db = tmpDb();
  addEvent(db, { id: 2, title: "Standup", start: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString() });
  const r = runNudges({ db, now: NOW });
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].type, "30m");
  db.close();
});

test("already nudged (same event+type) → skipped", () => {
  const db = tmpDb();
  addEvent(db, { id: 3, title: "Dentist", start: new Date(NOW.getTime() + 120 * 60 * 1000).toISOString() });
  runNudges({ db, now: NOW });
  const r2 = runNudges({ db, now: NOW });
  assert.equal(r2.sent.length, 0);
  assert.equal(r2.skipped.length, 1);
  assert.equal(r2.skipped[0].reason, "already_nudged");
  db.close();
});

test("dashboard opened recently → skipped (dashboard_open_recent)", () => {
  const db = tmpDb();
  addEvent(db, { id: 4, title: "Dentist", start: new Date(NOW.getTime() + 120 * 60 * 1000).toISOString() });
  setSetting(db, "last_dashboard_open", new Date(NOW.getTime() - 10 * 60 * 1000).toISOString());
  const r = runNudges({ db, now: NOW });
  assert.equal(r.sent.length, 0);
  assert.equal(r.skipped[0].reason, "dashboard_open_recent");
  db.close();
});

test("daily limit caps nudges (nudgesPerDay=1, two events)", () => {
  const db = tmpDb();
  addEvent(db, { id: 5, title: "A", start: new Date(NOW.getTime() + 120 * 60 * 1000).toISOString() });
  addEvent(db, { id: 6, title: "B", start: new Date(NOW.getTime() + 30 * 60 * 1000).toISOString() });
  const r = runNudges({ db, now: NOW, nudgesPerDay: 1 });
  assert.equal(r.sent.length, 1);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].reason, "daily_limit");
  db.close();
});

test("daily count resets across days", () => {
  const db = tmpDb();
  addEvent(db, { id: 7, title: "A", start: new Date(NOW.getTime() + 120 * 60 * 1000).toISOString() });
  runNudges({ db, now: NOW, nudgesPerDay: 1 });
  // next day, a new event
  const tomorrow = new Date("2026-07-22T12:00:00Z");
  addEvent(db, { id: 8, title: "C", start: new Date(tomorrow.getTime() + 120 * 60 * 1000).toISOString() });
  const r2 = runNudges({ db, now: tomorrow, nudgesPerDay: 1 });
  assert.equal(r2.sent.length, 1, "count should have reset for the new day");
  db.close();
});

test("event outside both windows → no nudge", () => {
  const db = tmpDb();
  addEvent(db, { id: 9, title: "Far", start: new Date(NOW.getTime() + 5 * 60 * 60 * 1000).toISOString() });
  const r = runNudges({ db, now: NOW });
  assert.equal(r.sent.length, 0);
  assert.equal(r.skipped.length, 0);
  db.close();
});

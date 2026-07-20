import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db/index.js";
import { syncCalendar } from "../src/connectors/calendar.js";

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  return openDb(path.join(dir, "test.sqlite"));
}

function fakeApi(events) {
  return { list: async () => ({ data: { items: events } }) };
}

const EVENTS = [
  { id: "g1", summary: "Dentist", start: { dateTime: "2026-07-21T15:00:00" }, end: { dateTime: "2026-07-21T16:00:00" }, location: "Office" },
  { id: "g2", summary: "Standup", start: { dateTime: "2026-07-21T09:00:00" }, end: { dateTime: "2026-07-21T09:15:00" } },
];

test("syncCalendar upserts events and returns { synced, errors }", async () => {
  const db = tmpDb();
  const r = await syncCalendar({ oauth2Client: {}, db, _calendarApi: fakeApi(EVENTS) });
  assert.equal(r.synced, 2);
  assert.deepEqual(r.errors, []);
  const rows = db.prepare("SELECT google_id, title FROM events ORDER BY title").all();
  assert.equal(rows.length, 2);
  db.close();
});

test("syncCalendar is idempotent (re-sync does not duplicate)", async () => {
  const db = tmpDb();
  await syncCalendar({ oauth2Client: {}, db, _calendarApi: fakeApi(EVENTS) });
  const r2 = await syncCalendar({ oauth2Client: {}, db, _calendarApi: fakeApi(EVENTS) });
  assert.equal(r2.synced, 2);
  const count = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
  assert.equal(count, 2);
  db.close();
});

test("syncCalendar updates changed events in place (same google_id)", async () => {
  const db = tmpDb();
  await syncCalendar({ oauth2Client: {}, db, _calendarApi: fakeApi(EVENTS) });
  const updated = [{ ...EVENTS[0], summary: "Dentist (moved)" }];
  await syncCalendar({ oauth2Client: {}, db, _calendarApi: fakeApi(updated) });
  const row = db.prepare("SELECT title FROM events WHERE google_id = 'g1'").get();
  assert.equal(row.title, "Dentist (moved)");
  const count = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
  assert.equal(count, 2);
  db.close();
});

test("syncCalendar records errors and returns synced 0 when the API throws", async () => {
  const db = tmpDb();
  const failingApi = { list: async () => { throw new Error("rate limited"); } };
  const r = await syncCalendar({ oauth2Client: {}, db, _calendarApi: failingApi });
  assert.equal(r.synced, 0);
  assert.match(r.errors[0], /rate limited/);
  db.close();
});

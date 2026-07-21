import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db/index.js";
import { generateBriefing } from "../src/engines/briefing.js";

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  return openDb(path.join(dir, "test.sqlite"));
}

const NOW = new Date("2026-07-21T07:00:00Z");

function seed(db, { events = [], emails = [] } = {}) {
  const ev = db.prepare(
    "INSERT INTO events(google_id, title, start_time, end_time, location) VALUES (?,?,?,?,?)"
  );
  for (const e of events) ev.run(e.gid, e.title, e.start, e.end ?? null, e.location ?? null);
  const em = db.prepare(
    "INSERT INTO emails(gmail_id, sender, subject, snippet, received_at, is_flagged) VALUES (?,?,?,?,?,?)"
  );
  for (const m of emails) em.run(m.gid, m.from, m.subject, m.snippet, m.recv, m.flag ? 1 : 0);
}

test("ok path: scorer returns text → briefing stored, fallback false", async () => {
  const db = tmpDb();
  seed(db, {
    events: [{ gid: "e1", title: "Dentist", start: "2026-07-21T15:00:00Z" }],
    emails: [{ gid: "m1", from: "boss", subject: "Review asap", snippet: "need your eyes", recv: "2026-07-21T06:00:00Z", flag: true }],
  });
  const scorer = async () => ({ ok: true, text: "You have a dentist at 3pm and a note from your boss." });
  const r = await generateBriefing({ db, _scorer: scorer, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.fallback, false);
  assert.equal(r.events, 1);
  assert.equal(r.emails, 1);
  const rows = db.prepare("SELECT content_raw FROM briefings ORDER BY id").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content_raw, "You have a dentist at 3pm and a note from your boss.");
  db.close();
});

test("fallback path: scorer fails → structured fallback stored, fallback true, never blank", async () => {
  const db = tmpDb();
  seed(db, {
    events: [{ gid: "e1", title: "Dentist", start: "2026-07-21T15:00:00Z" }],
    emails: [{ gid: "m1", from: "landlord", subject: "Rent", snippet: "past due", recv: "2026-07-21T06:00:00Z", flag: true }],
  });
  const scorer = async () => ({ ok: false, error: "ECONNREFUSED" });
  const r = await generateBriefing({ db, _scorer: scorer, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.fallback, true);
  assert.ok(r.text.length > 0, "fallback must never be blank");
  assert.match(r.text, /Dentist/);
  assert.match(r.text, /Rent/);
  db.close();
});

test("fallback path: scorer returns empty text → fallback", async () => {
  const db = tmpDb();
  seed(db, { events: [{ gid: "e1", title: "Standup", start: "2026-07-21T09:00:00Z" }] });
  const scorer = async () => ({ ok: true, text: "   " });
  const r = await generateBriefing({ db, _scorer: scorer, now: NOW });
  assert.equal(r.fallback, true);
  assert.match(r.text, /Standup/);
  db.close();
});

test("empty inputs: fallback says nothing needs attention", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: true, text: "x" });
  const r = await generateBriefing({ db, _scorer: scorer, now: NOW });
  assert.equal(r.events, 0);
  assert.equal(r.emails, 0);
  db.close();
});

test("history grows: two briefings → 2 rows", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: true, text: "briefing" });
  await generateBriefing({ db, _scorer: scorer, now: NOW });
  await generateBriefing({ db, _scorer: scorer, now: new Date("2026-07-22T07:00:00Z") });
  const count = db.prepare("SELECT COUNT(*) AS n FROM briefings").get().n;
  assert.equal(count, 2);
  db.close();
});

test("only events within the 48h window are included", async () => {
  const db = tmpDb();
  seed(db, {
    events: [
      { gid: "in", title: "Soon", start: "2026-07-21T12:00:00Z" },
      { gid: "out", title: "Far", start: "2026-07-25T12:00:00Z" },
    ],
  });
  const scorer = async () => ({ ok: false, error: "x" });
  const r = await generateBriefing({ db, _scorer: scorer, now: NOW });
  assert.equal(r.events, 1, "only the in-window event counts");
  assert.match(r.text, /Soon/);
  assert.doesNotMatch(r.text, /Far/);
  db.close();
});

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server.js";
import { MIGRATIONS } from "../src/db/index.js";

function makeTempDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(MIGRATIONS);
  return db;
}

function seed(db) {
  const now = new Date();
  const iso = (h) => new Date(now.getTime() + h * 3600_000).toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  db.prepare(
    `INSERT INTO events (google_id, title, start_time, end_time, location) VALUES ('g1','Standup',?,?,NULL)`
  ).run(iso(1), iso(1.5));
  db.prepare(
    `INSERT INTO events (google_id, title, start_time, end_time, location) VALUES ('g2','Past',?,?,NULL)`
  ).run(iso(-5), iso(-4));
  db.prepare(
    `INSERT INTO emails (gmail_id, sender, subject, snippet, received_at, is_flagged, scored_at) VALUES ('m1','a@b','Flagged','snip',?,1,datetime('now'))`
  ).run(iso(-1));
  db.prepare(
    `INSERT INTO emails (gmail_id, sender, subject, snippet, received_at, is_flagged, scored_at) VALUES ('m2','a@b','Old','snip',?,1,datetime('now'))`
  ).run(iso(-30));
  db.prepare(
    `INSERT INTO briefings (generated_at, content_raw) VALUES (?, 'hello')`
  ).run(iso(-3));
  db.prepare(`INSERT INTO settings (key, value) VALUES ('last_sync', datetime('now'))`).run();
  db.prepare(`INSERT INTO settings (key, value) VALUES ('google_connected', '1')`).run();
  db.prepare(`INSERT INTO nudges (event_id, nudge_type, sent_at) VALUES (1, 'two_hour', datetime('now'))`).run();
}

function start(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function withServer(fn) {
  const db = makeTempDb();
  seed(db);
  const app = createApp({ db });
  const server = await start(app);
  const { port } = server.address();
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("GET /api/events returns only upcoming within 48h", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/events`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.events.length, 1);
    assert.equal(body.events[0].title, "Standup");
  });
});

test("GET /api/emails/flagged returns last 24h flagged", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/emails/flagged`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.emails.length, 1);
    assert.equal(body.emails[0].subject, "Flagged");
  });
});

test("GET /api/briefings returns latest + history", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/briefings`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.latest.content_raw, "hello");
    assert.ok(Array.isArray(body.history));
    assert.equal(body.history.length, 1);
  });
});

test("GET /api/status reports sources + nudges today", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sources.calendar, true);
    assert.equal(body.sources.gmail, true);
    assert.equal(body.nudges_today, 1);
    assert.ok(body.last_sync);
  });
});

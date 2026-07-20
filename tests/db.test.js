import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db/index.js";

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  return openDb(path.join(dir, "test.sqlite"));
}

test("openDb creates all 5 tables", () => {
  const db = tmpDb();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const t of ["events", "emails", "briefings", "nudges", "settings"]) {
    assert.ok(tables.includes(t), `missing table: ${t}`);
  }
  db.close();
});

test("migrations are idempotent (re-opening recreates dropped tables)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  const p = path.join(dir, "test.sqlite");
  const db = openDb(p);
  db.exec("DROP TABLE settings");
  db.close();
  const db2 = openDb(p);
  const row = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
  assert.ok(row, "settings table not recreated");
  db2.close();
});

test("settings upsert works", () => {
  const db = tmpDb();
  const upsert = db.prepare(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  upsert.run("k1", "v1");
  upsert.run("k1", "v2");
  const v = db.prepare("SELECT value FROM settings WHERE key = 'k1'").get();
  assert.equal(v.value, "v2");
  db.close();
});

test("events unique on google_id prevents duplicates", () => {
  const db = tmpDb();
  const ins = db.prepare("INSERT INTO events(google_id, title, start_time) VALUES (?, ?, ?)");
  ins.run("g1", "Dentist", "2026-07-21T15:00:00");
  assert.throws(() => ins.run("g1", "Dup", "2026-07-21T15:00:00"));
  const count = db.prepare("SELECT COUNT(*) AS n FROM events").get().n;
  assert.equal(count, 1);
  db.close();
});

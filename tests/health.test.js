import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/server.js";
import { MIGRATIONS } from "../src/db/index.js";

function makeTempDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(MIGRATIONS);
  return db;
}

test("GET /health returns 200 and { status: 'ok' }", async () => {
  const app = createApp({ db: makeTempDb() });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(typeof body.ts, "string");
    assert.ok(!Number.isNaN(Date.parse(body.ts)));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("static dashboard is served at /", async () => {
  const app = createApp({ db: makeTempDb() });
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("<title>Pulse</title>"));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

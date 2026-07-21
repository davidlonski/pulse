import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db/index.js";
import { syncGmail } from "../src/connectors/gmail.js";

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-"));
  return openDb(path.join(dir, "test.sqlite"));
}

// Build a fake gmail API from a list of messages.
function fakeGmailApi(messages) {
  return {
    list: async () => ({ data: { messages: messages.map((m) => ({ id: m.id })) } }),
    get: async ({ id }) => {
      const m = messages.find((x) => x.id === id);
      if (!m) throw new Error("not found");
      return {
        data: {
          id: m.id,
          snippet: m.snippet,
          internalDate: m.internalDate,
          payload: {
            headers: [
              { name: "From", value: m.from },
              { name: "Subject", value: m.subject },
            ],
          },
        },
      };
    },
  };
}

const MESSAGES = [
  { id: "m1", from: "landlord <l@example.com>", subject: "URGENT: rent overdue", snippet: "past due", internalDate: "1784600000000" },
  { id: "m2", from: "boss <b@corp.com>", subject: "Weekly update", snippet: "fyi team", internalDate: "1784601000000" },
  { id: "m3", from: "news <n@news.com>", subject: "Your digest", snippet: "top stories today", internalDate: "1784602000000" },
];

test("pass 1: keyword email is auto-flagged without an LLM call", async () => {
  const db = tmpDb();
  let scorerCalled = false;
  const scorer = async () => { scorerCalled = true; return { ok: true, text: "routine" }; };
  const r = await syncGmail({
    oauth2Client: {},
    db,
    _gmailApi: fakeGmailApi([MESSAGES[0]]),
    _scorer: scorer,
  });
  assert.equal(r.synced, 1);
  assert.equal(r.flagged, 1);
  assert.equal(scorerCalled, false, "scorer must not be called for keyword email");
  const row = db.prepare("SELECT is_flagged FROM emails WHERE gmail_id='m1'").get();
  assert.equal(row.is_flagged, 1);
  db.close();
});

test("pass 2: scorer says important → flagged", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: true, text: "important" });
  const r = await syncGmail({
    oauth2Client: {},
    db,
    _gmailApi: fakeGmailApi([MESSAGES[1]]),
    _scorer: scorer,
  });
  assert.equal(r.flagged, 1);
  const row = db.prepare("SELECT is_flagged, scored_at FROM emails WHERE gmail_id='m2'").get();
  assert.equal(row.is_flagged, 1);
  assert.ok(row.scored_at, "scored_at should be set when Ollama scored it");
  db.close();
});

test("pass 2: scorer says routine → not flagged", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: true, text: "routine" });
  const r = await syncGmail({
    oauth2Client: {},
    db,
    _gmailApi: fakeGmailApi([MESSAGES[2]]),
    _scorer: scorer,
  });
  assert.equal(r.flagged, 0);
  const row = db.prepare("SELECT is_flagged FROM emails WHERE gmail_id='m3'").get();
  assert.equal(row.is_flagged, 0);
  db.close();
});

test("pass 2: scorer fails (ok:false) → not flagged, no crash", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: false, error: "ECONNREFUSED" });
  const r = await syncGmail({
    oauth2Client: {},
    db,
    _gmailApi: fakeGmailApi([MESSAGES[2]]),
    _scorer: scorer,
  });
  assert.equal(r.flagged, 0);
  assert.equal(r.synced, 1);
  assert.equal(r.errors.length, 0, "scorer failure is not a sync error");
  db.close();
});

test("upsert is idempotent (re-sync same messages does not duplicate)", async () => {
  const db = tmpDb();
  const scorer = async () => ({ ok: true, text: "routine" });
  const api = fakeGmailApi(MESSAGES);
  await syncGmail({ oauth2Client: {}, db, _gmailApi: api, _scorer: scorer });
  await syncGmail({ oauth2Client: {}, db, _gmailApi: api, _scorer: scorer });
  const count = db.prepare("SELECT COUNT(*) AS n FROM emails").get().n;
  assert.equal(count, 3);
  db.close();
});

test("list throws → synced 0, error recorded", async () => {
  const db = tmpDb();
  const failingApi = { list: async () => { throw new Error("gmail 401"); }, get: async () => ({}) };
  const r = await syncGmail({ oauth2Client: {}, db, _gmailApi: failingApi, _scorer: async () => ({ ok: true, text: "routine" }) });
  assert.equal(r.synced, 0);
  assert.match(r.errors[0], /gmail 401/);
  db.close();
});

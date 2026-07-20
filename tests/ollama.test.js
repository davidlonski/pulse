import test from "node:test";
import assert from "node:assert/strict";
import { chatCompletion } from "../src/ollama/client.js";

const originalFetch = globalThis.fetch;

function withFetch(stub, fn) {
  return async () => {
    globalThis.fetch = stub;
    try {
      await fn();
    } finally {
      globalThis.fetch = originalFetch;
    }
  };
}

test("chatCompletion returns { ok: true, text } on 200", withFetch(
  async (url, opts) => {
    assert.equal(opts.method, "POST");
    assert.ok(String(url).endsWith("/v1/chat/completions"));
    const sent = JSON.parse(opts.body);
    assert.equal(sent.stream, false);
    assert.equal(sent.messages[0].role, "system");
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "briefing text" } }] }),
    };
  },
  async () => {
    const r = await chatCompletion({ system: "s", user: "u" });
    assert.equal(r.ok, true);
    assert.equal(r.text, "briefing text");
  }
));

test("chatCompletion returns { ok: false } on connection refused (fetch throws)", withFetch(
  async () => { throw new Error("ECONNREFUSED"); },
  async () => {
    const r = await chatCompletion({ system: "s", user: "u", timeoutMs: 50 });
    assert.equal(r.ok, false);
    assert.match(r.error, /ECONNREFUSED/);
  }
));

test("chatCompletion returns { ok: false } on non-200", withFetch(
  async () => ({ ok: false, status: 500, json: async () => ({}) }),
  async () => {
    const r = await chatCompletion({ system: "s", user: "u" });
    assert.equal(r.ok, false);
    assert.match(r.error, /500/);
  }
));

test("chatCompletion returns { ok: false } when content missing", withFetch(
  async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }),
  async () => {
    const r = await chatCompletion({ system: "s", user: "u" });
    assert.equal(r.ok, false);
  }
));

test("chatCompletion returns { ok: false } on timeout (abort)", async () => {
  globalThis.fetch = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    });
  try {
    const r = await chatCompletion({ system: "s", user: "u", timeoutMs: 30 });
    assert.equal(r.ok, false);
    assert.match(r.error, /timeout/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

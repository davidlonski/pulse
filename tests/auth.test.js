import test from "node:test";
import assert from "node:assert/strict";
import { getAuthUrl, SCOPES } from "../src/auth/google.js";

test("getAuthUrl returns a URL with the configured client_id + scopes + offline access", () => {
  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/oauth/callback";
  const url = getAuthUrl();
  assert.match(url, /client_id=test-client-id/);
  for (const s of SCOPES) {
    assert.ok(
      url.includes(encodeURIComponent(s)),
      `missing scope: ${s}`
    );
  }
  assert.match(url, /access_type=offline/);
});

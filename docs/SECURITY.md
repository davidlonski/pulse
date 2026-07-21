# Security

Pulse is a local-first personal data tool. This document tracks the
trust assumptions, third-party data flows, and known-vulnerable
dependency hygiene for the project.

## Threat model

- **Local server.** Pulse runs on `localhost` and is bound to a
  single-user password (`PULSE_PASSWORD`) plus a session cookie
  signed with `SESSION_SECRET`. There is no internet-facing service.
- **Read-only Google access.** Google Calendar and Gmail are accessed
  via OAuth with the **narrowest scopes** required for the product:
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly`
  Pulse never sends, modifies, deletes, or labels anything on the
  user's Google account.
- **No third-party data export.** Pulse stores events, emails,
  briefings, and nudges in a local SQLite file under `data/`. Nothing
  is sent to any service other than Google (for read) and Ollama
  (for local LLM calls).
- **Secrets are read from environment only.** `.env` is gitignored;
  `.env.example` lists required vars without values. No secret is
  ever logged, echoed, or written to disk in plaintext outside of
  the configured `.env` file.

## Dependency hygiene

Pulse uses [`npm audit`](https://docs.npmjs.com/cli/v10/commands/npm-audit)
as the baseline for third-party dependency risk. The CI workflow
runs `npm test` on every push; `npm audit` is run manually as part
of dependency-hygiene passes (see [#41](https://github.com/davidlonski/pulse/issues/41))
and any newly-introduced advisory above `low` blocks merge until
addressed in a follow-up issue.

### `googleapis` transitive advisories (resolved 2026-07-20)

`googleapis@144.x` transitively depends on `uuid <11.1.1` (via
`googleapis-common` → `gaxios`). That range carries
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
(moderate: missing buffer bounds check in v3/v5/v6 when `buf` is
provided).

Pulse does **not** import `uuid` directly. The package is only
present as a transitive dependency of the Google client. The
vulnerable code path requires a caller to pass a `Buffer` argument
to `uuid()` — Pulse never does this (no code references `uuid`).

Resolution: `package.json` pins an npm `overrides` block to
`uuid@^11.1.1`, which removes the vulnerable version from the
resolved tree without bumping `googleapis` to `173.x` (a
semver-major change that the build-loop is not authorized to ship
on its own).

```json
"overrides": {
  "uuid": "^11.1.1"
}
```

Verified:
- `npm audit` → `found 0 vulnerabilities`
- `npm test` → 39/39 green
- No behavior change (verified by importing `googleapis` and
  loading both the calendar and gmail clients).

### Out of scope

- Replacing `googleapis` with a lighter Google client (e.g.,
  hand-rolled `fetch` wrappers). That's a product decision for
  later — it would require writing/maintaining OAuth refresh,
  retry, pagination, and quota handling.
- Adopting `npm audit` `--force` resolution paths that bump
  `googleapis` to `173.x`. That semver-major bump is gated on
  product review.

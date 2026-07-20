# Pulse — SQLite Schema

Storage layer for the MVP (see `docs/ARCHITECTURE.md` — "SQLite Over Postgres"). Backed by Node's built-in `node:sqlite` (`DatabaseSync`) — no native deps; migrations live in `src/db/migrations.sql` and run idempotently on `openDb()`.

## Tables

### `events`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `google_id` | TEXT UNIQUE NOT NULL | idempotency key from Google Calendar |
| `title` | TEXT NOT NULL | |
| `start_time` | TEXT NOT NULL | ISO 8601 |
| `end_time` | TEXT | nullable |
| `location` | TEXT | nullable |
| `created_at` | TEXT NOT NULL | default `datetime('now')` |

### `emails`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `gmail_id` | TEXT UNIQUE NOT NULL | idempotency key from Gmail |
| `sender` | TEXT | |
| `subject` | TEXT | |
| `snippet` | TEXT | first ~200 chars |
| `received_at` | TEXT NOT NULL | ISO 8601 |
| `is_flagged` | INTEGER NOT NULL | 0/1 — set by keyword pass + Ollama scoring |
| `scored_at` | TEXT | when Ollama scored it |

### `briefings`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `generated_at` | TEXT NOT NULL | when the briefing was generated |
| `content_raw` | TEXT | plain-text briefing |
| `content_html` | TEXT | optional rendered HTML |

### `nudges`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `event_id` | INTEGER | FK → `events.id` |
| `nudge_type` | TEXT NOT NULL | e.g. `2h`, `30m` |
| `sent_at` | TEXT NOT NULL | ISO 8601 |

### `settings`
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | |
| `value` | TEXT | upsert semantics |

## Notes

- All timestamps stored as ISO 8601 TEXT (SQLite has no native datetime type).
- `journal_mode = WAL` set on open for safe concurrent reads.
- `data/` is gitignored — the DB file is created on first run.
- Override the DB path with `PULSE_DB_PATH` (used by tests).

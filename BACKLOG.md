# Pulse — Product Backlog

All work tracked here. Issues are grouped by epic. Status moves from Open → In Progress → Completed.

Each issue is written to be executable by Cursor. Exact file paths, exact commands, exact acceptance criteria. No assumptions.

---

## Epics

| ID | Name | Description |
|---|---|---|
| CORE | Core Infrastructure | Server, auth, storage, config |
| CONNECT | Data Source Connectors | Google Calendar and Gmail integration |
| BRIEF | Morning Briefing Engine | Ollama-powered daily briefing generation and delivery |
| NUDGE | Proactive Nudge System | Event reminders and scheduled push alerts |
| UI | Dashboard UI | Web interface — feed, panels, status bar |
| INFRA | DevOps & Packaging | Deploy, scripts, health checks, docs |

---

## CORE Epic

### [CORE-001] Initialize Express server with base routing
**Priority:** Critical  
**Effort:** S  
**Status:** Open  

Set up the Node.js + Express server as the foundation. This is blocking all other work.

**Acceptance criteria:**
- [ ] File `package.json` exists at project root with `"main": "server.js"` and scripts: `{ "start": "node server.js", "dev": "nodemon server.js" }`
- [ ] Dependencies installed: `express@4.18.2`, `dotenv@16.0.3`, `node-cron@3.0.2`, `nodemon@2.0.22` (dev only)
- [ ] File `server.js` exists at project root
- [ ] `npm start` starts Express on port 3000 (from `process.env.PORT || 3000`)
- [ ] GET `/` returns the file at `public/index.html` with content-type `text/html`
- [ ] GET `/health` returns JSON: `{ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() }`
- [ ] GET `/login` returns the file at `public/login.html`
- [ ] `.env` file is loaded via `require('dotenv').config()` at server.js top
- [ ] GET to a non-existent route returns HTTP 404 with JSON: `{ error: "Not Found" }`
- [ ] Server includes `const cron = require('node-cron')` at top (placeholder for future cron jobs)
- [ ] Listening on port 3000 with console log: `Pulse server running on http://localhost:${PORT}`

**Implementation notes:**
```javascript
// server.js structure
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  console.log(`Pulse server running on http://localhost:${PORT}`);
});
```

**Test command:**
```bash
npm start
# Then: curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"...","uptime":...}
```

---

### [CORE-002] SQLite schema — events, emails, briefings, nudges, settings
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Initialize the SQLite database and create all tables. Data lives here.

**Acceptance criteria:**
- [ ] Dependencies installed: `better-sqlite3@9.0.0`
- [ ] Directory `db/` exists at project root
- [ ] File `db/init.sql` exists with full DDL for 5 tables (see schema below)
- [ ] File `db/database.js` exists, exports a single `Database` instance initialized at project root as `./pulse.db`
- [ ] `db/database.js` calls `db.exec(fs.readFileSync('./db/init.sql', 'utf-8'))` on startup
- [ ] All tables created with `CREATE TABLE IF NOT EXISTS` (idempotent)
- [ ] `settings` table seeded with defaults on first run: `INSERT OR IGNORE INTO settings (key, value) VALUES ('nudges_per_day', '3'), ('briefing_time', '07:00'), ...`
- [ ] File `docs/SCHEMA.md` documents each table: name, columns (type, constraints), purpose
- [ ] Running `node -e "require('./db/database.js')"` initializes the DB with zero errors
- [ ] File `./pulse.db` exists after initialization
- [ ] Running init a second time (idempotent) does not error and leaves data intact

**Schema (to be in db/init.sql):**
```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_time INTEGER NOT NULL,  -- Unix timestamp
  end_time INTEGER NOT NULL,
  location TEXT,
  calendar_id TEXT,
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  received_at INTEGER NOT NULL,  -- Unix timestamp
  snippet TEXT,
  is_flagged INTEGER DEFAULT 0,
  synced_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at INTEGER NOT NULL,  -- Unix timestamp
  content_raw TEXT NOT NULL,
  content_html TEXT
);

CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  nudge_type TEXT NOT NULL,  -- "2hr" or "30min"
  sent_at INTEGER NOT NULL,  -- Unix timestamp
  skipped INTEGER DEFAULT 0,
  UNIQUE(event_id, nudge_type)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_is_flagged ON emails(is_flagged);
CREATE INDEX IF NOT EXISTS idx_briefings_generated_at ON briefings(generated_at);
```

**db/database.js structure:**
```javascript
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('./pulse.db');
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
db.exec(schema);

// Seed settings table (idempotent)
db.exec(`
  INSERT OR IGNORE INTO settings (key, value) VALUES 
  ('nudges_per_day', '3'),
  ('briefing_time', '07:00'),
  ('last_calendar_sync', '0'),
  ('last_gmail_sync', '0'),
  ('last_dashboard_open', '0'),
  ('nudges_sent_today', '0');
`);

module.exports = db;
```

**Test command:**
```bash
rm -f pulse.db  # Start fresh
node -e "require('./db/database.js')"
sqlite3 pulse.db "SELECT name FROM sqlite_master WHERE type='table';"
# Expected: events, emails, briefings, nudges, settings
```

---

### [CORE-003] Single-user password protection + session management
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Protect the dashboard with a password gate. No multi-user auth — just a simple wall.

**Acceptance criteria:**
- [ ] Dependencies installed: `express-session@1.17.3`, `cookie-parser@1.4.6`
- [ ] `.env` contains `SESSION_SECRET=<random-string>` (at least 32 chars, generated by `openssl rand -hex 16`)
- [ ] `.env.example` includes `SESSION_SECRET` (no value)
- [ ] `.env.example` includes `PULSE_PASSWORD` (no value)
- [ ] File `src/routes/auth.js` exists and exports router
- [ ] GET `/login` returns `public/login.html`
- [ ] POST `/login` with JSON body `{ password: "..." }` checks password against `process.env.PULSE_PASSWORD`
  - On success: set session cookie `res.session.authenticated = true`, return JSON `{ success: true, redirect: '/' }`
  - On failure: return JSON `{ success: false, error: "Invalid password" }` with HTTP 401
- [ ] GET `/logout` clears session and redirects to `/login`
- [ ] Session cookie expires after 7 days (via `cookie: { maxAge: 7*24*60*60*1000 }`)
- [ ] All routes except `/login`, `/health`, and `/logout` check `req.session.authenticated` — if false, redirect to `/login`
- [ ] File `public/login.html` has a form with password field and submit button (no username)
- [ ] Starting server without `PULSE_PASSWORD` env var fails with error message: `Error: PULSE_PASSWORD not set in .env`

**Implementation in server.js:**
```javascript
const session = require('express-session');
const cookieParser = require('cookie-parser');
const authRouter = require('./src/routes/auth');

app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7*24*60*60*1000 }
}));

// Check if PULSE_PASSWORD is set
if (!process.env.PULSE_PASSWORD) {
  throw new Error('Error: PULSE_PASSWORD not set in .env');
}

app.use('/auth', authRouter);

// Middleware to protect all routes except login/health
app.use((req, res, next) => {
  const publicRoutes = ['/login', '/health', '/auth/login'];
  if (publicRoutes.includes(req.path)) {
    return next();
  }
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }
  next();
});
```

**Test command:**
```bash
PULSE_PASSWORD=testpass npm start
# Then in another terminal:
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"testpass"}' -c cookies.txt
curl http://localhost:3000/ -b cookies.txt
# Expected: returns dashboard HTML (not redirect)
```

---

### [CORE-004] Config and secrets management
**Priority:** Critical  
**Effort:** XS  
**Status:** Open  

Establish the pattern for managing secrets so nothing is committed to git.

**Acceptance criteria:**
- [ ] File `.env.example` exists at project root with all required keys (no values)
- [ ] `.env` is in `.gitignore`
- [ ] `.gitignore` also includes: `node_modules/`, `pulse.db*`, `*.log`, `.DS_Store`
- [ ] Server fails on startup with a clear error if any of these are missing from `.env`:
  - `PULSE_PASSWORD`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `SESSION_SECRET`
  - `VAPID_EMAIL`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
- [ ] README includes section "Setup" with step: "Copy `.env.example` to `.env` and fill in all values"
- [ ] Error message on missing var is clear: `Error: Missing required env var: PULSE_PASSWORD`

**Contents of .env.example:**
```
# Server
PORT=3000
SESSION_SECRET=<generate-with: openssl-rand-hex-16>
PULSE_PASSWORD=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:e4b

# Briefing
BRIEFING_TIME=07:00

# Web Push
VAPID_EMAIL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=

# Twilio (optional)
TWILIO_ENABLED=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_TO_NUMBER=
```

**Validation in server.js:**
```javascript
const requiredEnvVars = [
  'PULSE_PASSWORD',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'SESSION_SECRET',
  'VAPID_EMAIL',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY'
];

for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    throw new Error(`Error: Missing required env var: ${varName}`);
  }
}
```

---

## CONNECT Epic

### [CONNECT-001] Google OAuth 2.0 login flow
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Implement Google OAuth so Pulse can read Calendar and Gmail. Read-only scopes only.

**Acceptance criteria:**
- [ ] Dependencies installed: `googleapis@118.0.0`
- [ ] `.env` contains `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback`
- [ ] File `src/routes/oauth.js` exists and exports router
- [ ] GET `/oauth/start` redirects user to Google OAuth consent screen with scopes:
  - `https://www.googleapis.com/auth/calendar.readonly`
  - `https://www.googleapis.com/auth/gmail.readonly`
- [ ] GET `/oauth/callback?code=...` exchanges code for tokens (access token + refresh token)
- [ ] Tokens stored in `settings` table: keys `google_access_token` and `google_refresh_token`
- [ ] Tokens are never logged or exposed in HTTP responses
- [ ] GET `/oauth/disconnect` revokes token via Google API and clears both keys from settings
- [ ] File `public/settings.html` has a "Connect Google" button (GET `/oauth/start`) and "Disconnect" button (GET `/oauth/disconnect`)
- [ ] After successful connect: redirect to `/settings` with message "Google connected successfully"
- [ ] After successful disconnect: redirect to `/settings` with message "Google disconnected"
- [ ] Token auto-refresh: if access token expires, automatically request new one using refresh token

**Implementation in src/routes/oauth.js:**
```javascript
const express = require('express');
const { google } = require('googleapis');
const db = require('../db/database');

const router = express.Router();
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get('/start', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly'
    ]
  });
  res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'google_access_token',
    tokens.access_token
  );
  if (tokens.refresh_token) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'google_refresh_token',
      tokens.refresh_token
    );
  }
  
  res.redirect('/settings?message=Google%20connected%20successfully');
});

router.get('/disconnect', async (req, res) => {
  db.prepare('DELETE FROM settings WHERE key IN (?, ?)').run(
    'google_access_token',
    'google_refresh_token'
  );
  res.redirect('/settings?message=Google%20disconnected');
});

module.exports = router;
```

**Test command:**
```bash
npm start
# Open http://localhost:3000/settings
# Click "Connect Google", complete OAuth flow
# Check database: sqlite3 pulse.db "SELECT * FROM settings WHERE key LIKE 'google%';"
# Expected: rows with access_token and refresh_token values
```

---

### [CONNECT-002] Google Calendar connector — fetch next 48h events
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Pull upcoming calendar events every 15 minutes and store them in SQLite.

**Acceptance criteria:**
- [ ] File `src/connectors/calendar.js` exists and exports function `syncCalendarEvents(db, oauth2Client)`
- [ ] Function fetches all events from `now` → `now + 48 hours` using `calendar.events.list()`
- [ ] Events stored in `events` table via upsert: if `id` exists, update; otherwise insert
- [ ] Each event stored with: `id` (Google's event ID), `title`, `start_time`, `end_time`, `location`, `calendar_id`, `synced_at`
- [ ] `start_time` and `end_time` are Unix timestamps (seconds since epoch)
- [ ] Multi-calendar support: fetches from all calendars in user's account (not just primary)
- [ ] Recurring events resolved to individual instances (not parent event)
- [ ] Function includes error handling: if Google API call fails, logs error and returns early (no crash)
- [ ] cron job in `src/cron/index.js` calls this function every 15 minutes (runs regardless of auth status)
- [ ] If no Google token in settings, function skips silently and logs "No Google token, skipping calendar sync"
- [ ] Database updates `settings.last_calendar_sync` to current timestamp after successful sync

**Implementation in src/connectors/calendar.js:**
```javascript
const { google } = require('googleapis');

async function syncCalendarEvents(db, oauth2Client) {
  const accessToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('google_access_token')?.value;
  if (!accessToken) {
    console.log('No Google token, skipping calendar sync');
    return;
  }

  oauth2Client.setCredentials({ access_token: accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const { data } = await calendar.calendarList.list();
    const calendarIds = data.items.map(cal => cal.id);

    for (const calendarId of calendarIds) {
      const { data: events } = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        timeMax: in48h.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      for (const event of events.items || []) {
        const startTime = new Date(event.start.dateTime || event.start.date).getTime() / 1000;
        const endTime = new Date(event.end.dateTime || event.end.date).getTime() / 1000;

        db.prepare(`
          INSERT OR REPLACE INTO events (id, title, start_time, end_time, location, calendar_id, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(event.id, event.summary, Math.floor(startTime), Math.floor(endTime), event.location || null, calendarId, Math.floor(Date.now() / 1000));
      }
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('last_calendar_sync', Math.floor(Date.now() / 1000));
  } catch (err) {
    console.error('Calendar sync error:', err.message);
  }
}

module.exports = { syncCalendarEvents };
```

**Test command:**
```bash
npm start
# Wait for first 15-min sync or trigger manually
sqlite3 pulse.db "SELECT COUNT(*) FROM events;"
# Expected: > 0 (if you have upcoming calendar events)
```

---

### [CONNECT-003] Gmail connector — fetch and flag important unread emails
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Pull unread emails every 15 minutes and use Ollama to score importance.

**Acceptance criteria:**
- [ ] Dependencies installed: `axios@1.6.0` (for Ollama HTTP calls)
- [ ] File `src/connectors/gmail.js` exists and exports function `syncGmailEmails(db, oauth2Client)`
- [ ] Function fetches up to 50 unread emails from last 24 hours using Gmail API
- [ ] Flagging logic:
  - Auto-flag if sender is in the list of senders from past 30 days (known sender)
  - Auto-flag if subject or snippet contains keywords: "urgent", "action", "deadline", "invoice", "review", "meeting"
  - Otherwise: send to Ollama for scoring
- [ ] Ollama call to `http://localhost:11434/v1/chat/completions`:
  ```json
  {
    "model": "gemma4:e4b",
    "messages": [
      { "role": "system", "content": "You are an email importance classifier." },
      { "role": "user", "content": "Is this email important or routine?\n\nSubject: {subject}\nFrom: {sender}\nSnippet: {snippet}\n\nRespond with only one word: important or routine" }
    ],
    "temperature": 0.3,
    "stream": false
  }
  ```
  - Parse response: if text includes "important" → flag email
- [ ] Emails stored in `emails` table via upsert: id, subject, sender, received_at, snippet, is_flagged
- [ ] `received_at` is Unix timestamp
- [ ] `snippet` is first 200 characters of email body
- [ ] Function includes error handling: if Ollama fails, log error and skip email (don't crash)
- [ ] Function includes error handling: if Gmail API fails, log error and return early
- [ ] cron job calls this function every 15 minutes
- [ ] If no Google token, function skips silently
- [ ] Settings table updated: `last_gmail_sync` to current timestamp after successful sync

**Implementation in src/connectors/gmail.js:**
```javascript
const { google } = require('googleapis');
const axios = require('axios');

async function scoreEmailImportance(subject, sender, snippet) {
  try {
    const response = await axios.post(`${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'You are an email importance classifier.' },
        { role: 'user', content: `Is this email important or routine?\n\nSubject: ${subject}\nFrom: ${sender}\nSnippet: ${snippet}\n\nRespond with only one word: important or routine` }
      ],
      temperature: 0.3,
      stream: false
    }, { timeout: 5000 });

    const text = response.data.choices[0].message.content.toLowerCase();
    return text.includes('important');
  } catch (err) {
    console.error('Ollama scoring error:', err.message);
    return false;
  }
}

async function syncGmailEmails(db, oauth2Client) {
  const accessToken = db.prepare('SELECT value FROM settings WHERE key = ?').get('google_access_token')?.value;
  if (!accessToken) {
    console.log('No Google token, skipping Gmail sync');
    return;
  }

  oauth2Client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  try {
    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread after:2d',
      maxResults: 50
    });

    const messages = data.messages || [];
    const keywords = ['urgent', 'action', 'deadline', 'invoice', 'review', 'meeting'];
    const knownSenders = new Set();

    // Build set of known senders from past 30 days
    const thirtyDaysAgo = Math.floor((Date.now() - 30*24*60*60*1000) / 1000);
    const past30Emails = db.prepare('SELECT DISTINCT sender FROM emails WHERE received_at > ?').all(thirtyDaysAgo);
    past30Emails.forEach(row => knownSenders.add(row.sender));

    for (const msg of messages) {
      const { data: full } = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const headers = full.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
      const sender = headers.find(h => h.name === 'From')?.value || '(no sender)';
      const snippet = full.snippet.substring(0, 200);
      const receivedAt = Math.floor(full.internalDate / 1000);

      // Auto-flag logic
      let isFlagged = knownSenders.has(sender);
      if (!isFlagged) {
        isFlagged = keywords.some(kw => subject.toLowerCase().includes(kw) || snippet.toLowerCase().includes(kw));
      }
      if (!isFlagged) {
        isFlagged = await scoreEmailImportance(subject, sender, snippet);
      }

      db.prepare(`
        INSERT OR REPLACE INTO emails (id, subject, sender, received_at, snippet, is_flagged)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(msg.id, subject, sender, receivedAt, snippet, isFlagged ? 1 : 0);
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('last_gmail_sync', Math.floor(Date.now() / 1000));
  } catch (err) {
    console.error('Gmail sync error:', err.message);
  }
}

module.exports = { syncGmailEmails };
```

**Test command:**
```bash
npm start
# (requires Ollama running on localhost:11434 with gemma4:e4b pulled)
# Wait for first 15-min sync or trigger manually
sqlite3 pulse.db "SELECT COUNT(*) FROM emails WHERE is_flagged = 1;"
# Expected: > 0 (if you have unread emails)
```

---

## BRIEF Epic

### [BRIEF-001] Ollama briefing engine — generate morning briefing
**Priority:** Critical  
**Effort:** M  
**Status:** Open  

Core briefing generation: pull events + flagged emails, call Ollama, store result.

**Acceptance criteria:**
- [ ] File `src/engines/briefing.js` exists and exports async function `generateBriefing(db)`
- [ ] Function queries events WHERE `start_time BETWEEN now AND now+48h` from events table
- [ ] Function queries emails WHERE `is_flagged=1 AND received_at > now-24h` from emails table
- [ ] Function builds structured prompt:
  ```
  You are a morning briefing generator for a busy professional.

  Here are today's calendar events and flagged emails. Generate a brief, conversational morning briefing (max 150 words) that highlights what needs attention. Do not list raw data — synthesize it into prose.

  CALENDAR EVENTS (today and tomorrow):
  [formatted list of events with times]

  FLAGGED EMAILS (last 24 hours):
  [formatted list of emails with sender + subject]

  Generate the briefing:
  ```
- [ ] Function calls Ollama at `http://localhost:11434/v1/chat/completions`:
  - model: from `process.env.OLLAMA_MODEL`
  - messages: system prompt + user prompt above
  - temperature: 0.7
  - max_tokens: 300
- [ ] Response text extracted and stored in `briefings` table: `INSERT INTO briefings (generated_at, content_raw) VALUES (?, ?)`
- [ ] `generated_at` is Unix timestamp
- [ ] If Ollama call fails (timeout, no model, error): generate fallback briefing (structured list, no AI)
  ```
  FALLBACK BRIEFING:
  Today's events:
  [event titles with times]
  
  Flagged emails:
  [sender + subject]
  ```
- [ ] Function returns briefing text as string
- [ ] Function includes error logging but does not crash or throw

**Implementation in src/engines/briefing.js:**
```javascript
const axios = require('axios');
const db = require('../db/database');

async function generateBriefing(db) {
  const now = Math.floor(Date.now() / 1000);
  const tomorrow = now + 24 * 60 * 60;
  const in48h = now + 48 * 60 * 60;

  const events = db.prepare(`
    SELECT title, start_time, end_time FROM events
    WHERE start_time BETWEEN ? AND ?
    ORDER BY start_time
  `).all(now, in48h);

  const emails = db.prepare(`
    SELECT sender, subject FROM emails
    WHERE is_flagged = 1 AND received_at > ?
    ORDER BY received_at DESC
  `).all(now - 24*60*60);

  const eventStr = events.map(e => {
    const start = new Date(e.start_time * 1000).toLocaleTimeString();
    return `- ${e.title} at ${start}`;
  }).join('\n') || '(no events)';

  const emailStr = emails.map(e => `- From ${e.sender}: ${e.subject}`).join('\n') || '(no flagged emails)';

  const userPrompt = `You are a morning briefing generator. Create a brief, conversational briefing (max 150 words).

CALENDAR EVENTS (next 48 hours):
${eventStr}

FLAGGED EMAILS (last 24 hours):
${emailStr}

Generate the briefing:`;

  try {
    const response = await axios.post(`${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, {
      model: process.env.OLLAMA_MODEL,
      messages: [
        { role: 'system', content: 'You are a morning briefing generator for a busy professional.' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 300,
      stream: false
    }, { timeout: 10000 });

    const briefing = response.data.choices[0].message.content;
    db.prepare('INSERT INTO briefings (generated_at, content_raw) VALUES (?, ?)').run(now, briefing);
    return briefing;
  } catch (err) {
    console.error('Ollama briefing error:', err.message);
    
    // Fallback briefing
    const fallback = `MORNING BRIEFING (generated offline)\n\nToday's events:\n${eventStr}\n\nFlagged emails:\n${emailStr}`;
    db.prepare('INSERT INTO briefings (generated_at, content_raw) VALUES (?, ?)').run(now, fallback);
    return fallback;
  }
}

module.exports = { generateBriefing };
```

**Test command:**
```bash
npm start
# (requires Ollama running and model pulled)
node -e "
  const db = require('./db/database');
  const { generateBriefing } = require('./src/engines/briefing');
  generateBriefing(db).then(b => console.log(b));
"
```

---

## UI Epic (Minimal for MVP)

### [UI-001] Public/index.html — Dashboard 3-panel layout
**Priority:** Critical  
**Effort:** L  
**Status:** Open  

Build the main dashboard. Three panels: feed, briefing, status. Pure HTML/CSS/JS.

**File structure:**
- `public/index.html` — main HTML (serve via GET `/`)
- `public/style.css` — all styles
- `public/dashboard.js` — polls API and updates DOM every 5 min

**Acceptance criteria:**
- [ ] `public/index.html` is valid HTML5, links stylesheet and JS, no build step
- [ ] Layout: three columns on desktop (feed 60% | briefing 40%), single column on mobile
- [ ] Panel 1 "Today's Feed": 
  - Chronological list of next 48h events + flagged emails
  - Each event: title, start time, duration, location (if exists)
  - Each email: sender, subject, time received
  - Sections for "Today" vs "Tomorrow"
  - Empty states: "Nothing on the calendar — you're clear."
- [ ] Panel 2 "Morning Briefing":
  - Latest briefing card with time generated
  - "History" link to see past briefings
  - If no briefing yet: "Your briefing will be ready at 7:00 AM"
- [ ] Panel 3 "Status Bar":
  - Last sync time per source (Calendar, Gmail)
  - Nudges sent today: "2/3"
  - Connection indicators: green dot = synced within 30 min, yellow = > 30 min, red = never
- [ ] Dashboard fetches data every 5 minutes from:
  - GET `/api/events` → returns JSON array of upcoming events
  - GET `/api/emails/flagged` → returns JSON array of flagged emails
  - GET `/api/briefings/latest` → returns latest briefing or null
  - GET `/api/status` → returns `{ lastCalendarSync, lastGmailSync, nudigts_sent_today }`
- [ ] Auto-refresh updates the DOM without full page reload (vanilla JS fetch + DOM manipulation)
- [ ] All times displayed in user's local timezone
- [ ] Loads in under 2 seconds on localhost (test with DevTools Network tab)
- [ ] Mobile-responsive: works on 375px width (test with iPhone SE viewport)
- [ ] No frameworks: vanilla HTML/CSS/JS only

**public/dashboard.js outline:**
```javascript
async function fetchAndUpdate() {
  const events = await fetch('/api/events').then(r => r.json());
  const emails = await fetch('/api/emails/flagged').then(r => r.json());
  const briefing = await fetch('/api/briefings/latest').then(r => r.json());
  const status = await fetch('/api/status').then(r => r.json());

  // Update DOM based on data
  document.getElementById('feed').innerHTML = /* ... */;
  document.getElementById('briefing').innerHTML = /* ... */;
  document.getElementById('status-bar').innerHTML = /* ... */;
}

// Auto-refresh every 5 minutes
fetchAndUpdate();
setInterval(fetchAndUpdate, 5 * 60 * 1000);
```

**Test command:**
```bash
npm start
# Open http://localhost:3000 in browser (after login)
# Check that feed, briefing, status render
# Use DevTools → Network to verify < 2 second load
```

---

## INFRA Epic

### [INFRA-001] Deploy script for Mac Studio
**Priority:** High  
**Effort:** S  
**Status:** Open  

Simple script to get Pulse running persistently on Mac.

**Acceptance criteria:**
- [ ] File `scripts/start.sh` exists at project root
- [ ] `scripts/start.sh` does:
  1. `npm install` (installs deps)
  2. Checks if Ollama is running on `http://localhost:11434` (curl `/api/health`), fails if not
  3. Checks if model is available: `ollama list | grep gemma4:e4b`, fails if not
  4. Initializes DB: `node -e "require('./db/database')"`
  5. Starts Pulse via `pm2 start server.js --name pulse --instances 1 --error /tmp/pulse-error.log --out /tmp/pulse-out.log`
  6. Output: "Pulse started. View logs: pm2 logs pulse"
- [ ] File `scripts/stop.sh` runs `pm2 stop pulse && pm2 delete pulse`
- [ ] File `scripts/logs.sh` runs `pm2 logs pulse`
- [ ] Dependencies installed: `pm2@5.3.0` (globally: `npm install -g pm2@5.3.0`)
- [ ] `pm2 startup` configured to auto-start on system boot (run once manually after first `scripts/start.sh`)
- [ ] README includes "Running Pulse on Mac Studio" section with instructions

**scripts/start.sh content:**
```bash
#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Checking Ollama..."
if ! curl -s http://localhost:11434/api/health > /dev/null; then
  echo "ERROR: Ollama not running on http://localhost:11434"
  echo "Start Ollama first: ollama serve"
  exit 1
fi

echo "Checking model..."
if ! ollama list | grep -q gemma4:e4b; then
  echo "ERROR: gemma4:e4b not found. Pull it first:"
  echo "  ollama pull gemma4:e4b"
  exit 1
fi

echo "Initializing database..."
node -e "require('./db/database')"

echo "Starting Pulse..."
pm2 start server.js --name pulse --instances 1 --error /tmp/pulse-error.log --out /tmp/pulse-out.log

echo "Pulse started. View logs: pm2 logs pulse"
echo ""
echo "To enable auto-start on boot:"
echo "  pm2 startup"
echo "  pm2 save"
```

**Test command:**
```bash
chmod +x scripts/start.sh scripts/stop.sh scripts/logs.sh
./scripts/start.sh
pm2 logs pulse
# Should show server logs
./scripts/stop.sh
```

---

### [INFRA-002] README setup guide
**Priority:** High  
**Effort:** S  
**Status:** Open  

Complete README so someone can set up Pulse from scratch in 15 minutes.

**Sections to include:**
1. **What is Pulse** — one paragraph description
2. **Prerequisites** — Node.js 18+, Ollama, Google Cloud project
3. **Quick Start** — step by step:
   - `git clone https://github.com/davidlonski/pulse.git && cd pulse`
   - Create Google OAuth app and get credentials
   - Copy `.env.example` to `.env` and fill in values
   - `./scripts/start.sh`
   - Open http://localhost:3000
4. **Google OAuth Setup** — instructions to create Cloud project, enable APIs, set redirect URI
5. **Ollama Setup** — install Ollama, pull `gemma4:e4b`
6. **Environment Variables** — table of all vars, required vs optional
7. **Troubleshooting** — common errors:
   - "Ollama not running" → how to start
   - "Google token invalid" → how to reconnect
   - "Database locked" → rm pulse.db and restart
8. **Architecture** — link to `docs/ARCHITECTURE.md`
9. **Backlog** — link to `BACKLOG.md`

**Test command:**
```bash
# Have someone new follow the README steps
# Should be able to get Pulse running in < 15 minutes
```

---

## Notes for Cursor

- Each issue is executable end-to-end
- Exact file paths, exact npm versions, exact commands
- Acceptance criteria are verifiable (test commands provided)
- Dependencies listed explicitly (version pinned)
- SQL and JavaScript code samples provided — use as starting point, adapt as needed
- If something is unclear, ask; don't guess
- Commit after each issue completion: `git add . && git commit -m "[EPIC-NNN] description"`
- Push to `davidlonski/pulse` after every few issues

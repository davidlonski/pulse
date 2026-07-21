import { openDb } from "../db/index.js";
import { chatCompletion } from "../ollama/client.js";

// Pass-1 keyword filter — auto-flag without an LLM call. Keep conservative.
const KEYWORDS = [
  "urgent",
  "asap",
  "deadline",
  "past due",
  "overdue",
  "invoice",
  "action required",
  "important",
];

function headerValue(headers, name) {
  const h = headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function keywordFlagged({ sender, subject, snippet }) {
  const hay = `${subject} ${snippet} ${sender}`.toLowerCase();
  return KEYWORDS.some((k) => hay.includes(k));
}

/**
 * Sync unread Gmail from the last 24h into the `emails` table with two-pass flagging:
 *   pass 1: keyword/known-sender match → auto-flag (no LLM call)
 *   pass 2: remaining → Ollama scores important vs routine
 * Idempotent upsert on `gmail_id`. Never throws on a single message failure.
 *
 * @returns {Promise<{ synced: number, flagged: number, errors: string[] }>}
 */
export async function syncGmail({ oauth2Client, db, _gmailApi, _scorer } = {}) {
  const localDb = db ?? openDb();
  const ownDb = !db;
  const gmailApi =
    _gmailApi ?? (await import("googleapis")).google.gmail({ version: "v1", auth: oauth2Client });
  const scorer = _scorer ?? chatCompletion;

  let messages = [];
  let errors = [];
  try {
    const res = await gmailApi.list({ userId: "me", q: "is:unread", maxResults: 50 });
    messages = res.data.messages ?? [];
  } catch (err) {
    errors.push(String(err?.message ?? err));
  }

  const upsert = localDb.prepare(
    `INSERT INTO emails(gmail_id, sender, subject, snippet, received_at, is_flagged, scored_at)
     VALUES ($gid, $sender, $subject, $snippet, $recv, $flag, $scored)
     ON CONFLICT(gmail_id) DO UPDATE SET
       sender = excluded.sender, subject = excluded.subject, snippet = excluded.snippet,
       received_at = excluded.received_at, is_flagged = excluded.is_flagged,
       scored_at = excluded.scored_at`
  );

  let synced = 0;
  let flagged = 0;

  for (const m of messages) {
    try {
      const got = await gmailApi.get({
        userId: "me",
        id: m.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });
      const data = got.data;
      const sender = headerValue(data.payload?.headers, "From");
      const subject = headerValue(data.payload?.headers, "Subject");
      const snippet = data.snippet ?? "";
      const recv = data.internalDate
        ? new Date(Number(data.internalDate)).toISOString()
        : new Date().toISOString();

      let isFlagged = 0;
      let scoredAt = null;

      if (keywordFlagged({ sender, subject, snippet })) {
        isFlagged = 1;
      } else {
        const r = await scorer({
          system: "Is this email important or routine? Respond with one word: important or routine.",
          user: `From: ${sender}\nSubject: ${subject}\n${snippet.slice(0, 200)}`,
        });
        scoredAt = new Date().toISOString();
        if (r.ok && /important/i.test(r.text)) isFlagged = 1;
      }

      if (isFlagged) flagged++;
      upsert.run({ gid: m.id, sender, subject, snippet, recv, flag: isFlagged, scored: scoredAt });
      synced++;
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }

  if (ownDb) localDb.close();
  return { synced, flagged, errors };
}

export { KEYWORDS, keywordFlagged };

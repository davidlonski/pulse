import { bucketizeEvents, isImminent } from "./upcoming.js";

const POLL_MS = 5 * 60 * 1000;

function fmt(iso) {
  if (!iso) return "";
  const d = new Date(iso + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function getJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function renderFeed({ events = [], emails = [] }) {
  const el = document.getElementById("feed");
  const items = [
    ...events.map((e) => ({ kind: "ev", when: e.start_time, html: `<span class="tag ev">event</span>${esc(e.title)}<span class="when">${fmt(e.start_time)}${e.location ? " · " + esc(e.location) : ""}</span>` })),
    ...emails.map((m) => ({ kind: "em", when: m.received_at, html: `<span class="tag em">email</span>${esc(m.subject || "(no subject)")}<span class="when">${esc(m.sender || "")} · ${fmt(m.received_at)}</span>` })),
  ].sort((a, b) => new Date(a.when) - new Date(b.when));

  if (!items.length) { el.innerHTML = `<li class="muted">Nothing on the feed.</li>`; return; }
  el.innerHTML = items.map((i) => `<li>${i.html}</li>`).join("");
}

function renderBriefing({ latest, history = [] }) {
  const el = document.getElementById("briefing");
  if (!latest) { el.className = "briefing muted"; el.textContent = "No briefing yet."; }
  else {
    el.className = "briefing";
    el.textContent = latest.content_raw || "(empty briefing)";
  }
  const hl = document.getElementById("history-list");
  hl.innerHTML = history.map((h) => `<li>${fmt(h.generated_at)}</li>`).join("");
}

function renderStatus({ last_sync, sources, nudges_today }) {
  const el = document.getElementById("status");
  const row = (label, ok) => `<li><span><span class="dot ${ok ? "ok" : "bad"}"></span>${label}</span><span>${ok ? "connected" : "not connected"}</span></li>`;
  el.innerHTML = [
    row("Calendar", sources.calendar),
    row("Gmail", sources.gmail),
    `<li><span>Last sync</span><span>${last_sync ? fmt(last_sync) : "never"}</span></li>`,
    `<li><span>Nudges today</span><span>${nudges_today}</span></li>`,
  ].join("");

  const badge = document.getElementById("sync-badge");
  badge.textContent = last_sync ? `synced ${fmt(last_sync)}` : "no sync yet";
}

function renderUpcoming(events) {
  const { today, tomorrow } = bucketizeEvents(events || []);
  const renderBucket = (id, list) => {
    const el = document.getElementById(id);
    if (!list.length) { el.innerHTML = `<li class="muted">No events.</li>`; return; }
    el.innerHTML = list.map((e) => {
      const imminent = isImminent(e.start_time) ? " imminent" : "";
      const loc = e.location ? `<span class="loc">${esc(e.location)}</span>` : "";
      return `<li class="upcoming-item${imminent}"><span class="title">${esc(e.title)}</span><span class="when">${fmt(e.start_time)}</span>${loc}</li>`;
    }).join("");
  };
  renderBucket("upcoming-today", today);
  renderBucket("upcoming-tomorrow", tomorrow);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refresh() {
  try {
    const [events, emails, briefings, status] = await Promise.all([
      getJson("/api/events"),
      getJson("/api/emails/flagged"),
      getJson("/api/briefings"),
      getJson("/api/status"),
    ]);
    renderFeed({ events: events.events, emails: emails.emails });
    renderUpcoming(events.events);
    renderBriefing(briefings);
    renderStatus(status);
  } catch (e) {
    document.getElementById("sync-badge").textContent = "error";
    console.error(e);
  }
}

refresh();
setInterval(refresh, POLL_MS);

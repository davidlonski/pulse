const DEFAULT_BASE = "http://localhost:11434";
const DEFAULT_MODEL = "gemma4:e4b";
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Call the local Ollama (OpenAI-compatible) chat completions endpoint.
 * Never throws — returns { ok: true, text } on success, { ok: false, error } on any failure.
 * Callers (briefing engine, email scoring) must handle the { ok: false } path
 * with a structured fallback so the user never sees a blank briefing card.
 */
export async function chatCompletion({ system, user, model, timeoutMs } = {}) {
  const base = process.env.OLLAMA_BASE_URL || DEFAULT_BASE;
  const mdl = model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  const url = `${base}/v1/chat/completions`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: mdl,
        messages: [
          { role: "system", content: system ?? "" },
          { role: "user", content: user ?? "" },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      return { ok: false, error: "no content in response" };
    }
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === "AbortError" ? `timeout after ${timeout}ms` : String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}

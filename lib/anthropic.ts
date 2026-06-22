/**
 * Minimal server-side Anthropic Messages API client (no SDK dependency).
 *
 * ── PLUG IN YOUR LLM HERE ──────────────────────────────────────────────────
 * Used by /api/analyze and /api/regenerate. To switch provider, change
 * `callClaude` to call your LLM of choice and return the raw text response —
 * the routes only depend on this one function.
 * ───────────────────────────────────────────────────────────────────────────
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Transient statuses worth retrying: 429 (rate limit), 529 (overloaded),
// and 5xx gateway hiccups. These are temporary on Anthropic's side, so we
// back off and retry rather than throwing away work already done (e.g. a
// paid Whisper transcription that precedes the analysis step).
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callClaude(prompt: string, maxTokens = 8192): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

  let lastError = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          // Note: no `temperature` — newer Claude models (Fable 5+) reject it
          // as deprecated. Faithful, non-creative extraction is enforced via
          // the prompts instead.
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      // Network-level failure — also transient, retry.
      lastError = err instanceof Error ? err.message : "network error";
      if (attempt < MAX_ATTEMPTS) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new Error(`LLM service unreachable: ${lastError}`);
    }

    if (res.ok) {
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
      if (!text) throw new Error("LLM returned an empty response.");
      return text;
    }

    const detail = await res.text().catch(() => "");
    lastError = `LLM service error (${res.status}): ${detail.slice(0, 300)}`;

    // Retry transient errors with exponential backoff; fail fast on the rest
    // (e.g. 400 bad request, 401 auth) where retrying can't help.
    if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get("retry-after")) * 1000;
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : backoffMs(attempt));
      continue;
    }
    throw new Error(lastError);
  }

  throw new Error(lastError || "LLM request failed after retries.");
}

/** Exponential backoff with jitter: ~0.8s, 1.6s, 3.2s … */
function backoffMs(attempt: number): number {
  return Math.round(2 ** attempt * 400 * (0.75 + Math.random() * 0.5));
}

/**
 * Tolerant JSON extraction: models occasionally wrap JSON in markdown fences
 * or add a stray sentence — find the outermost JSON object and parse it.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Could not parse LLM response as JSON.");
  }
}

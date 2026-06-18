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

export async function callClaude(prompt: string, maxTokens = 8192): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      // Note: no `temperature` — newer Claude models (Fable 5+) reject it as
      // deprecated. Faithful, non-creative extraction is enforced via the
      // prompts instead.
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM service error (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = data.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
  if (!text) throw new Error("LLM returned an empty response.");
  return text;
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

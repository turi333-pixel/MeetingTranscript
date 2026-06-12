import { NextRequest, NextResponse } from "next/server";
import { callClaude, extractJson } from "@/lib/anthropic";
import type { ActionItem } from "@/lib/types";

/**
 * POST /api/regenerate
 *
 * Powers the "Regenerate summary" and "Improve action list" buttons.
 * Takes the labelled transcript plus the previous output and asks the LLM
 * for an improved version. Uses the same pluggable LLM client as
 * /api/analyze (see lib/anthropic.ts to swap providers).
 */

export const runtime = "nodejs";
export const maxDuration = 120;

interface RegenerateBody {
  mode: "summary" | "actions";
  language: string;
  /** Transcript with speaker labels already applied, as plain text. */
  transcript: string;
  previousSummary?: string;
  previousActions?: ActionItem[];
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let body: RegenerateBody;
  try {
    body = (await req.json()) as RegenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
  }

  const shared = `Below is the labelled transcript of a conversation (language: "${body.language}").

<transcript>
${body.transcript}
</transcript>

Strict rules:
- Write in the SAME language as the conversation. Do not translate.
- Do NOT invent information that is not supported by the transcript.
- Mark genuinely unclear points explicitly rather than guessing.`;

  try {
    if (body.mode === "summary") {
      const prompt = `${shared}

The previous executive summary was:
<previous>
${body.previousSummary ?? "(none)"}
</previous>

Write an improved executive summary: clearer structure, the key decisions, outcomes and context a busy executive needs, nothing fabricated. Respond with ONLY a JSON object: {"summary": "markdown string"}`;
      const parsed = extractJson(await callClaude(prompt)) as { summary?: string };
      if (!parsed.summary) throw new Error("LLM did not return a summary.");
      return NextResponse.json({ summary: parsed.summary });
    }

    if (body.mode === "actions") {
      const prompt = `${shared}

The previous action list was:
<previous>
${JSON.stringify(body.previousActions ?? [], null, 2)}
</previous>

Re-extract and improve the action list: catch missed commitments, remove items that are not real tasks, sharpen wording. For each item include owner (or null), task, deadline exactly as mentioned (or null), priority only if inferable (or null), and openQuestions (array, may be empty). Respond with ONLY a JSON object:
{"actions": [{"task": "...", "owner": null, "deadline": null, "priority": null, "openQuestions": []}]}`;
      const parsed = extractJson(await callClaude(prompt)) as { actions?: Omit<ActionItem, "id">[] };
      const actions: ActionItem[] = (parsed.actions ?? []).map((a, i) => ({
        id: `action-${Date.now()}-${i}`,
        task: a.task ?? "",
        owner: a.owner ?? null,
        deadline: a.deadline ?? null,
        priority: a.priority === "high" || a.priority === "medium" || a.priority === "low" ? a.priority : null,
        openQuestions: Array.isArray(a.openQuestions) ? a.openQuestions : [],
      })).filter((a) => a.task.trim().length > 0);
      return NextResponse.json({ actions });
    }

    return NextResponse.json({ error: "Unknown mode. Use 'summary' or 'actions'." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

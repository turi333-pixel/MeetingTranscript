import { NextRequest, NextResponse } from "next/server";
import { callClaude, extractJson } from "@/lib/anthropic";
import type { MeetingFeedback } from "@/lib/types";

/**
 * POST /api/feedback
 *
 * Produces blameless, team-retrospective feedback about the MEETING (not
 * verdicts about individuals) from the labelled transcript plus the
 * objective metrics computed client-side in lib/metrics.ts.
 *
 * Uses the same pluggable LLM client as /api/analyze (see lib/anthropic.ts).
 *
 * NOTE (phase 2): this route is transcript-only. Audio-derived signals
 * (tone, energy, talking-over-each-other) would be added by passing extra
 * acoustic features into the prompt here — see the project notes.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

interface FeedbackBody {
  language: string;
  /** Labelled transcript as plain text. */
  transcript: string;
  /** Pre-computed objective metrics, as text (talk-time, turns, pace…). */
  metrics: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let body: FeedbackBody;
  try {
    body = (await req.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.transcript?.trim()) {
    return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
  }

  const prompt = `You are an experienced, supportive meeting facilitator helping a team run a blameless retrospective. Below is the labelled transcript of a meeting (language: "${body.language}") and objective metrics measured from it.

<metrics>
${body.metrics}
</metrics>

<transcript>
${body.transcript}
</transcript>

Give constructive feedback about HOW THE MEETING WENT, for the whole team to read together. Respond with ONLY a JSON object (no markdown fences):

{
  "overview": "2-3 neutral sentences on how the meeting went overall",
  "structure": ["observation about agenda clarity, goal, time management, staying on topic", ...],
  "dynamics": ["observation about collaboration and interaction, e.g. whether quieter participants were invited in", ...],
  "wentWell": ["something the team did well and should keep doing", ...],
  "improve": ["a concrete, specific thing to try next time", ...]
}

Strict rules:
- This is a TEAM retrospective. Comment on the MEETING and group behaviour, NOT on individuals' character or performance. Never say a named person was "disengaged", "weak", or similar.
- When participation was uneven, raise it neutrally and as a shared responsibility (e.g. "Most of the talking came from two people — next time the group could explicitly invite quieter voices in"), and remember low talk-time can be a legitimate role (note-taker, observer). Do NOT assume the cause.
- Ground every point in the transcript or the metrics provided. Do NOT invent details, decisions, or events that are not supported.
- Write all text in the SAME language as the meeting (${body.language}). Do not translate.
- Be specific and actionable, not generic. 2-5 bullets per list; a list may be shorter if there is genuinely little to say.
- This is based on a text transcript only — it cannot judge tone of voice or emotion, so do not claim to.`;

  try {
    const parsed = extractJson(await callClaude(prompt, 4000)) as Partial<MeetingFeedback>;
    const list = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

    const feedback: MeetingFeedback = {
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      structure: list(parsed.structure),
      dynamics: list(parsed.dynamics),
      wentWell: list(parsed.wentWell),
      improve: list(parsed.improve),
    };
    return NextResponse.json({ feedback });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Feedback generation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

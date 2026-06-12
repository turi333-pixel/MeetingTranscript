import { NextRequest, NextResponse } from "next/server";
import { callClaude, extractJson } from "@/lib/anthropic";
import type { ActionItem, AnalysisResult, Speaker, TranscriptSegment } from "@/lib/types";

/**
 * POST /api/analyze
 *
 * Receives the timestamped transcript and returns:
 *   - speaker map (with self-introduced names when detected)
 *   - per-segment speaker assignment
 *   - executive summary (in the conversation's original language)
 *   - structured action items
 *   - speaker-identification confidence
 *
 * ── PLUG IN YOUR LLM HERE ──────────────────────────────────────────────────
 * Default implementation: Anthropic Claude via lib/anthropic.ts
 * (model from ANTHROPIC_MODEL, key from ANTHROPIC_API_KEY).
 * To use another LLM, replace `callClaude()` — the prompt below is
 * provider-agnostic and demands strict JSON output.
 *
 * ── DIARISATION NOTE ───────────────────────────────────────────────────────
 * If you wired a dedicated acoustic diarisation provider in
 * /api/transcribe (see comments there), incoming segments will already have
 * `speakerId` set. The prompt instructs the model to preserve those ids and
 * only attach names/labels. Without acoustic diarisation, the model infers
 * speaker turns from the text itself — good for clean turn-taking, weaker
 * on overlapping speech, hence the explicit confidence score.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const runtime = "nodejs";
export const maxDuration = 300;

interface AnalyzeRequestBody {
  language: string;
  segments: TranscriptSegment[];
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let body: AnalyzeRequestBody;
  try {
    body = (await req.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.segments) || body.segments.length === 0) {
    return NextResponse.json({ error: "No transcript segments to analyze." }, { status: 400 });
  }

  // Compact transcript representation the model reads: id, time, optional
  // pre-assigned speaker (from acoustic diarisation), text.
  const transcriptForModel = body.segments
    .map((s) => {
      const time = `${formatTime(s.start)}-${formatTime(s.end)}`;
      const spk = s.speakerId ? ` (${s.speakerId})` : "";
      const flag = s.lowConfidence ? " [low-confidence]" : "";
      return `[${s.id} | ${time}]${spk}${flag} ${s.text}`;
    })
    .join("\n");

  const hasAcousticDiarisation = body.segments.some((s) => s.speakerId);

  const prompt = `You are an expert meeting analyst. Below is a literal, timestamped transcript of a conversation. The detected language is "${body.language}".

<transcript>
${transcriptForModel}
</transcript>

Analyze it and respond with ONLY a JSON object (no markdown fences, no commentary) with this exact shape:

{
  "speakers": [
    {
      "id": "S1",
      "label": "string — the person's real name ONLY if they introduce themselves or are clearly addressed by name in the transcript; otherwise 'Speaker 1', 'Speaker 2', ...",
      "nameSource": "self-introduced" | "addressed-by-others" | "unknown",
      "confidence": 0.0-1.0,
      "notes": "short role/context inferred from the conversation, or null"
    }
  ],
  "segmentSpeakers": { "<segment id>": "<speaker id>", ... one entry for EVERY segment id ... },
  "summary": "executive summary as markdown",
  "actions": [
    {
      "task": "string",
      "owner": "speaker label/name or null if not identifiable",
      "deadline": "deadline exactly as mentioned in the conversation, or null",
      "priority": "high" | "medium" | "low" | null,
      "openQuestions": ["open question or dependency", ...]
    }
  ],
  "speakerConfidence": 0.0-1.0
}

Strict rules:
- ${hasAcousticDiarisation
    ? "Segments already carry acoustic speaker ids in parentheses — KEEP that grouping exactly; your job is only to attach names/labels and confidence."
    : "Infer speaker turns from content, phrasing, and turn-taking. Be conservative: if you cannot tell speakers apart, use fewer speakers and lower speakerConfidence."}
- Use a real name ONLY when the transcript itself supports it (self-introduction like "Hi, I'm Ana" or being addressed: "Thanks, Ana"). If a name is garbled or uncertain, keep the generic label and mention the uncertain name in "notes" as e.g. "possibly 'Ana' (unclear)".
- Write "summary" and all "actions" fields in the SAME language as the conversation (${body.language}). Do not translate.
- Do NOT invent information. No owners, deadlines or priorities that are not supported by the transcript — use null instead.
- Only include real commitments/tasks in "actions"; an empty array is valid.
- "speakerConfidence" reflects how sure you are about the speaker separation overall (text-only attribution should rarely exceed 0.85).
- "segmentSpeakers" must contain every segment id exactly once.`;

  try {
    const raw = await callClaude(prompt, 16000);
    const parsed = extractJson(raw) as {
      speakers?: Speaker[];
      segmentSpeakers?: Record<string, string>;
      summary?: string;
      actions?: Omit<ActionItem, "id">[];
      speakerConfidence?: number;
    };

    // Defensive normalisation so the UI never sees a malformed result.
    const speakers: Speaker[] = (parsed.speakers ?? []).map((s, i) => ({
      id: s.id || `S${i + 1}`,
      label: s.label || `Speaker ${i + 1}`,
      nameSource: s.nameSource === "self-introduced" || s.nameSource === "addressed-by-others" ? s.nameSource : "unknown",
      confidence: clamp01(s.confidence),
      notes: s.notes ?? null,
    }));

    const validIds = new Set(speakers.map((s) => s.id));
    const segmentSpeakers: Record<string, string> = {};
    for (const seg of body.segments) {
      const assigned = parsed.segmentSpeakers?.[seg.id];
      // Preserve acoustic ids when present; otherwise trust the model, but
      // never reference a speaker that does not exist in the map.
      const id = seg.speakerId ?? assigned;
      if (id && validIds.has(id)) segmentSpeakers[seg.id] = id;
    }

    const actions: ActionItem[] = (parsed.actions ?? []).map((a, i) => ({
      id: `action-${i}`,
      task: a.task ?? "",
      owner: a.owner ?? null,
      deadline: a.deadline ?? null,
      priority: a.priority === "high" || a.priority === "medium" || a.priority === "low" ? a.priority : null,
      openQuestions: Array.isArray(a.openQuestions) ? a.openQuestions : [],
    })).filter((a) => a.task.trim().length > 0);

    const result: AnalysisResult = {
      summary: parsed.summary ?? "",
      speakers,
      actions,
      segmentSpeakers,
      speakerConfidence: clamp01(parsed.speakerConfidence),
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, Number(v.toFixed(3))));
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

import { NextRequest, NextResponse } from "next/server";
import type { TranscriptSegment, TranscriptionResult } from "@/lib/types";

/**
 * POST /api/transcribe
 *
 * Receives an audio file (multipart/form-data, field "file") and returns a
 * timestamped, literal transcription with per-segment confidence and the
 * auto-detected language.
 *
 * ── PLUG IN YOUR TRANSCRIPTION API HERE ────────────────────────────────────
 * Default implementation: OpenAI Whisper (`whisper-1`) with
 * response_format=verbose_json, which returns:
 *   - `language`: auto-detected language
 *   - `segments[]`: timestamped text with `avg_logprob` and `no_speech_prob`,
 *     which we convert into a 0–1 confidence score.
 *
 * To swap in another provider (Deepgram, AssemblyAI, Google STT, a
 * self-hosted Whisper…), replace `transcribeWithWhisper()` and keep the
 * return shape (`TranscriptionResult`) identical — the rest of the app only
 * depends on that shape.
 *
 * ── DEDICATED ACOUSTIC DIARISATION (optional upgrade) ──────────────────────
 * Whisper does not separate speakers acoustically. In this MVP, speaker
 * attribution happens in /api/analyze using an LLM over the timestamped
 * transcript (works well for turn-taking conversations, weaker on overlap).
 * For production-grade diarisation, run the audio through a diarisation API
 * here and attach a `speakerId` to each segment by overlapping timestamps:
 *
 *   // Example: AssemblyAI (set ASSEMBLYAI_API_KEY in .env.local)
 *   // 1. POST audio to https://api.assemblyai.com/v2/upload
 *   // 2. POST https://api.assemblyai.com/v2/transcript
 *   //    { audio_url, speaker_labels: true, language_detection: true }
 *   // 3. Poll until status === "completed"; map `utterances[].speaker`
 *   //    onto our segments by timestamp overlap.
 *
 * If segments already carry speakerIds when they reach /api/analyze, the LLM
 * is instructed to keep them and only attach names/labels.
 * ───────────────────────────────────────────────────────────────────────────
 */

// Whisper hard limit; checked client-side too, re-checked here for safety.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Segments below this confidence are flagged as uncertain in the UI.
const LOW_CONFIDENCE_THRESHOLD = 0.6;

export const runtime = "nodejs";
// Transcription of long files can take a while — allow up to 5 minutes.
export const maxDuration = 300;

interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
  no_speech_prob: number;
}

interface WhisperVerboseResponse {
  language: string;
  duration: number;
  text: string;
  segments?: WhisperSegment[];
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No audio file received." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Audio file exceeds the 25 MB transcription limit. Please use a shorter or compressed recording." },
      { status: 413 },
    );
  }

  try {
    const result = await transcribeWithWhisper(file, apiKey);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function transcribeWithWhisper(file: File, apiKey: string): Promise<TranscriptionResult> {
  const model = process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";

  const body = new FormData();
  body.append("file", file, file.name || "recording.webm");
  body.append("model", model);
  // verbose_json gives us timestamps + confidence signals per segment.
  body.append("response_format", "verbose_json");
  // temperature 0 favours accuracy/determinism over speed or creativity.
  body.append("temperature", "0");
  // NOTE: we deliberately do NOT pass `language`, so Whisper auto-detects it
  // and the transcript stays in the conversation's original language.

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Transcription service error (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as WhisperVerboseResponse;
  const rawSegments = data.segments ?? [];

  const segments: TranscriptSegment[] = rawSegments
    // Drop segments Whisper itself believes are silence/noise, instead of
    // keeping hallucinated filler text ("do not invent missing information").
    .filter((s) => s.no_speech_prob < 0.9 && s.text.trim().length > 0)
    .map((s, i) => {
      // avg_logprob is the mean token log-probability; exp() maps it to a
      // rough 0–1 confidence. no_speech_prob further discounts segments that
      // may not contain speech at all.
      const confidence = Math.max(
        0,
        Math.min(1, Math.exp(s.avg_logprob) * (1 - s.no_speech_prob)),
      );
      return {
        id: `seg-${i}`,
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        confidence: Number(confidence.toFixed(3)),
        lowConfidence: confidence < LOW_CONFIDENCE_THRESHOLD,
        speakerId: null,
      };
    });

  const overall =
    segments.length > 0
      ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      : 0;

  return {
    language: data.language ?? "unknown",
    durationSec: data.duration ?? (segments.at(-1)?.end ?? 0),
    segments,
    confidence: Number(overall.toFixed(3)),
  };
}

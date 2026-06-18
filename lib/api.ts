/**
 * Client-side processing pipeline:
 *   audio → /api/transcribe (Whisper) → /api/analyze (LLM) → SessionData
 */

import { computeMetrics, metricsToText } from "./metrics";
import type {
  ActionItem,
  AnalysisResult,
  MeetingFeedback,
  ProcessingStage,
  SessionData,
  TranscriptionResult,
} from "./types";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function processAudio(
  file: Blob,
  fileName: string,
  source: "upload" | "recording",
  onStage: (stage: ProcessingStage) => void,
): Promise<SessionData> {
  // 1. Transcribe (language auto-detect, timestamps, confidence)
  onStage("uploading");
  const form = new FormData();
  form.append("file", file, fileName);
  onStage("transcribing");
  const res = await fetch("/api/transcribe", { method: "POST", body: form });
  const transcription = (await res.json().catch(() => ({}))) as TranscriptionResult & { error?: string };
  if (!res.ok) throw new Error(transcription.error ?? `Transcription failed (${res.status})`);
  if (!transcription.segments?.length) {
    throw new Error("No speech detected in the audio. Please check the recording and try again.");
  }

  // 2. Speaker identification + summary + actions
  onStage("analyzing");
  const analysis = await postJson<AnalysisResult>("/api/analyze", {
    language: transcription.language,
    segments: transcription.segments,
  });

  // 3. Assemble the session
  onStage("done");
  const now = new Date();
  return {
    id: `session-${now.getTime()}`,
    createdAt: now.toISOString(),
    title: `${source === "recording" ? "Recording" : "Upload"} — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    source,
    language: transcription.language,
    durationSec: transcription.durationSec,
    transcriptionConfidence: transcription.confidence,
    speakerConfidence: analysis.speakerConfidence,
    segments: transcription.segments.map((s) => ({
      ...s,
      speakerId: analysis.segmentSpeakers[s.id] ?? null,
    })),
    speakers: analysis.speakers,
    summary: analysis.summary,
    actions: analysis.actions,
    audioSaved: false,
  };
}

export async function regenerateSummary(session: SessionData): Promise<string> {
  const { summary } = await postJson<{ summary: string }>("/api/regenerate", {
    mode: "summary",
    language: session.language,
    transcript: labelledTranscript(session),
    previousSummary: session.summary,
  });
  return summary;
}

export async function improveActions(session: SessionData): Promise<ActionItem[]> {
  const { actions } = await postJson<{ actions: ActionItem[] }>("/api/regenerate", {
    mode: "actions",
    language: session.language,
    transcript: labelledTranscript(session),
    previousActions: session.actions,
  });
  return actions;
}

export async function generateFeedback(session: SessionData): Promise<MeetingFeedback> {
  const { feedback } = await postJson<{ feedback: MeetingFeedback }>("/api/feedback", {
    language: session.language,
    transcript: labelledTranscript(session),
    metrics: metricsToText(computeMetrics(session)),
  });
  return feedback;
}

/** Transcript as plain text with current (possibly user-edited) speaker labels. */
export function labelledTranscript(session: SessionData): string {
  const labels = new Map(session.speakers.map((s) => [s.id, s.label]));
  return session.segments
    .map((seg) => {
      const who = seg.speakerId ? labels.get(seg.speakerId) ?? seg.speakerId : "Unknown";
      const flag = seg.lowConfidence ? " ⚠" : "";
      return `[${formatTimestamp(seg.start)}] ${who}${flag}: ${seg.text}`;
    })
    .join("\n");
}

export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

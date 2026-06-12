/**
 * Shared domain types used by the UI, the API routes and local storage.
 */

/** One timestamped chunk of literal transcription. */
export interface TranscriptSegment {
  id: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** Literal transcribed text — never rewritten by the LLM. */
  text: string;
  /** 0–1 transcription confidence derived from Whisper's avg_logprob. */
  confidence: number;
  /** True when the segment should be visually flagged as uncertain. */
  lowConfidence: boolean;
  /** Speaker id (e.g. "S1") assigned during analysis; null if unassigned. */
  speakerId: string | null;
}

export type NameSource = "self-introduced" | "addressed-by-others" | "unknown";

export interface Speaker {
  /** Stable id used in segments, e.g. "S1". */
  id: string;
  /** Display label: a real name if detected, otherwise "Speaker 1" etc. */
  label: string;
  /** How the name was detected. "unknown" means a generic label is used. */
  nameSource: NameSource;
  /** 0–1 confidence that this speaker separation/name is correct. */
  confidence: number;
  /** Short role/description inferred from the conversation, if any. */
  notes: string | null;
}

export type Priority = "high" | "medium" | "low";

export interface ActionItem {
  id: string;
  /** What needs to be done. */
  task: string;
  /** Speaker label or name; null when not identifiable. */
  owner: string | null;
  /** Deadline exactly as mentioned (e.g. "next Friday"); null if none. */
  deadline: string | null;
  /** Only set when reasonably inferable from the conversation. */
  priority: Priority | null;
  /** Open questions or dependencies blocking the task. */
  openQuestions: string[];
}

/** Result of the /api/transcribe route. */
export interface TranscriptionResult {
  /** ISO-639-1 code detected by Whisper, e.g. "en", "es". */
  language: string;
  durationSec: number;
  segments: TranscriptSegment[];
  /** 0–1 overall transcription confidence. */
  confidence: number;
}

/** Result of the /api/analyze route. */
export interface AnalysisResult {
  /** Executive summary in the conversation's original language (markdown). */
  summary: string;
  speakers: Speaker[];
  actions: ActionItem[];
  /** Map of segment id -> speaker id. */
  segmentSpeakers: Record<string, string>;
  /** 0–1 overall speaker-identification confidence. */
  speakerConfidence: number;
}

/** A fully processed session persisted in the browser. */
export interface SessionData {
  id: string;
  createdAt: string; // ISO date
  title: string;
  source: "upload" | "recording";
  language: string;
  durationSec: number;
  transcriptionConfidence: number;
  speakerConfidence: number;
  segments: TranscriptSegment[];
  speakers: Speaker[];
  summary: string;
  actions: ActionItem[];
  /** True when the user explicitly chose to keep the audio in IndexedDB. */
  audioSaved: boolean;
}

export type ProcessingStage =
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "done";

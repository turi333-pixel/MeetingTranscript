/**
 * Deterministic meeting metrics computed directly from the transcript +
 * timestamps. No LLM, no audio — these are objective measurements, so they
 * are recomputed on the fly each render rather than stored.
 *
 * The LLM feedback route is given these numbers so its qualitative comments
 * stay grounded in real data instead of guessing.
 */

import type { SessionData } from "./types";

export interface SpeakerStats {
  speakerId: string;
  label: string;
  /** Total seconds this speaker held the floor. */
  talkSeconds: number;
  /** Share of total speaking time, 0–1. */
  talkPct: number;
  /** Number of separate times they took the floor (contiguous runs). */
  turns: number;
  /** Longest single uninterrupted stretch, in seconds. */
  longestTurnSeconds: number;
  words: number;
  /** Speaking pace; null when there is too little audio to be meaningful. */
  wordsPerMinute: number | null;
}

export interface MeetingMetrics {
  durationSec: number;
  /** Sum of all segment durations (can differ from duration: gaps/overlap). */
  totalSpeakingSeconds: number;
  /** Time within the meeting where nobody was transcribed as speaking. */
  deadAirSeconds: number;
  speakers: SpeakerStats[];
  /** Label of whoever spoke first / last, if known. */
  startedBy: string | null;
  endedBy: string | null;
  /** Labels of speakers who contributed very little (possible non-participation). */
  nearSilentLabels: string[];
  /** True when speakers are reasonably balanced (no one dominates heavily). */
  balanced: boolean;
}

// A speaker below this share of talk time (with 3+ participants) is flagged
// as near-silent — surfaced as a gentle question, never an accusation.
const NEAR_SILENT_PCT = 0.07;
// If the top speaker holds more than this share, participation is "unbalanced".
const DOMINANCE_PCT = 0.6;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function computeMetrics(session: SessionData): MeetingMetrics {
  const labels = new Map(session.speakers.map((s) => [s.id, s.label]));
  const label = (id: string | null) => (id ? labels.get(id) ?? id : "Unknown");

  // Seed an accumulator for every known speaker so silent ones still appear.
  const acc = new Map<string, { talk: number; turns: number; longest: number; words: number }>();
  for (const s of session.speakers) acc.set(s.id, { talk: 0, turns: 0, longest: 0, words: 0 });
  const ensure = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { talk: 0, turns: 0, longest: 0, words: 0 }));
    return a;
  };

  let totalSpeaking = 0;
  let prevSpeaker: string | null | undefined;
  let runSeconds = 0;
  let runSpeaker: string | null = null;

  for (const seg of session.segments) {
    const dur = Math.max(0, seg.end - seg.start);
    const id = seg.speakerId ?? "__unknown__";
    const a = ensure(id);
    a.talk += dur;
    a.words += countWords(seg.text);
    totalSpeaking += dur;

    if (id !== prevSpeaker) {
      a.turns += 1;
      // close the previous run
      if (runSpeaker != null) {
        const ra = ensure(runSpeaker);
        ra.longest = Math.max(ra.longest, runSeconds);
      }
      runSpeaker = id;
      runSeconds = dur;
    } else {
      runSeconds += dur;
    }
    prevSpeaker = id;
  }
  // close the final run
  if (runSpeaker != null) {
    const ra = ensure(runSpeaker);
    ra.longest = Math.max(ra.longest, runSeconds);
  }

  const speakers: SpeakerStats[] = [...acc.entries()]
    .map(([id, a]) => ({
      speakerId: id,
      label: id === "__unknown__" ? "Unknown" : label(id),
      talkSeconds: Math.round(a.talk),
      talkPct: totalSpeaking > 0 ? a.talk / totalSpeaking : 0,
      turns: a.turns,
      longestTurnSeconds: Math.round(a.longest),
      words: a.words,
      wordsPerMinute: a.talk >= 5 ? Math.round(a.words / (a.talk / 60)) : null,
    }))
    .sort((x, y) => y.talkSeconds - x.talkSeconds);

  const nearSilentLabels =
    speakers.length >= 3
      ? speakers.filter((s) => s.talkPct < NEAR_SILENT_PCT).map((s) => s.label)
      : [];

  const top = speakers[0];
  const balanced = !top || top.talkPct <= DOMINANCE_PCT;

  return {
    durationSec: session.durationSec,
    totalSpeakingSeconds: Math.round(totalSpeaking),
    deadAirSeconds: Math.max(0, Math.round(session.durationSec - totalSpeaking)),
    speakers,
    startedBy: session.segments.length ? label(session.segments[0].speakerId) : null,
    endedBy: session.segments.length ? label(session.segments[session.segments.length - 1].speakerId) : null,
    nearSilentLabels,
    balanced,
  };
}

/** Human-readable mm:ss-ish duration for stat display. */
export function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Compact text form of the metrics, used in exports and as LLM grounding. */
export function metricsToText(m: MeetingMetrics): string {
  const lines = [
    `Duration: ${formatDuration(m.durationSec)} · speaking time ${formatDuration(m.totalSpeakingSeconds)} · quiet/no-speech ${formatDuration(m.deadAirSeconds)}`,
    `Opened by: ${m.startedBy ?? "—"} · closed by: ${m.endedBy ?? "—"}`,
    "Participation:",
    ...m.speakers.map(
      (s) =>
        `  - ${s.label}: ${Math.round(s.talkPct * 100)}% of talk time (${formatDuration(s.talkSeconds)}), ${s.turns} turns, longest ${formatDuration(s.longestTurnSeconds)}${s.wordsPerMinute != null ? `, ~${s.wordsPerMinute} wpm` : ""}`,
    ),
  ];
  if (m.nearSilentLabels.length) lines.push(`Contributed little: ${m.nearSilentLabels.join(", ")}`);
  return lines.join("\n");
}

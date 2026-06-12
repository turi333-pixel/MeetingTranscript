"use client";

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { formatTimestamp, labelledTranscript } from "@/lib/api";
import { buildFullTranscriptText } from "@/lib/export";
import type { SessionData } from "@/lib/types";

/** Stable per-speaker accent colours (cycled when there are many speakers). */
const SPEAKER_COLORS = [
  "text-indigo-700 bg-indigo-50",
  "text-emerald-700 bg-emerald-50",
  "text-rose-700 bg-rose-50",
  "text-amber-700 bg-amber-50",
  "text-sky-700 bg-sky-50",
  "text-purple-700 bg-purple-50",
];

type View = "timestamps" | "fulltext";

interface Props {
  session: SessionData;
  onToast: (msg: string) => void;
}

export function TranscriptTab({ session, onToast }: Props) {
  const [view, setView] = useState<View>("timestamps");
  const speakerIndex = new Map(session.speakers.map((s, i) => [s.id, i]));
  const labels = new Map(session.speakers.map((s) => [s.id, s.label]));

  // Full-text view: merge consecutive segments from the same speaker.
  const paragraphs: { who: string; speakerId: string | null; text: string }[] = [];
  for (const seg of session.segments) {
    const who = seg.speakerId ? labels.get(seg.speakerId) ?? seg.speakerId : "Unknown";
    const last = paragraphs[paragraphs.length - 1];
    if (last && last.who === who) last.text += " " + seg.text;
    else paragraphs.push({ who, speakerId: seg.speakerId, text: seg.text });
  }

  return (
    <div>
      {/* View toggle + copy for the current view */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Transcript view">
          {(
            [
              ["timestamps", "Per timestamp"],
              ["fulltext", "Full text"],
            ] as [View, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                view === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <CopyButton
          onToast={onToast}
          getText={() => (view === "timestamps" ? labelledTranscript(session) : buildFullTranscriptText(session))}
        />
      </div>

      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        Literal transcript in the original language. Passages marked{" "}
        <span className="rounded bg-amber-200/60 px-1">like this ⚠</span> were transcribed with low
        confidence — verify them against the audio if accuracy is critical.
      </p>

      {view === "timestamps" ? (
        <ul className="grid gap-3">
          {session.segments.map((seg) => {
            const color =
              seg.speakerId != null
                ? SPEAKER_COLORS[(speakerIndex.get(seg.speakerId) ?? 0) % SPEAKER_COLORS.length]
                : "text-slate-600 bg-slate-100";
            return (
              <li key={seg.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${color}`}>
                    {seg.speakerId ? labels.get(seg.speakerId) ?? seg.speakerId : "Unknown"}
                  </span>
                  <span className="text-[11px] tabular-nums text-slate-400">{formatTimestamp(seg.start)}</span>
                  {seg.lowConfidence && (
                    <span
                      className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      title={`Transcription confidence ${Math.round(seg.confidence * 100)}%`}
                    >
                      ⚠ {Math.round(seg.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${seg.lowConfidence ? "bg-amber-50 text-slate-700" : "text-slate-800"}`}>
                  {seg.text}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {paragraphs.map((p, i) => {
            const color =
              p.speakerId != null
                ? SPEAKER_COLORS[(speakerIndex.get(p.speakerId) ?? 0) % SPEAKER_COLORS.length].split(" ")[0]
                : "text-slate-600";
            return (
              <p key={i} className="mb-3 text-sm leading-relaxed text-slate-800 last:mb-0">
                <strong className={color}>{p.who}:</strong> {p.text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

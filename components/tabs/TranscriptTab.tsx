"use client";

import { formatTimestamp } from "@/lib/api";
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

export function TranscriptTab({ session }: { session: SessionData }) {
  const speakerIndex = new Map(session.speakers.map((s, i) => [s.id, i]));
  const labels = new Map(session.speakers.map((s) => [s.id, s.label]));

  return (
    <div>
      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        Literal transcript in the original language. Passages marked{" "}
        <span className="rounded bg-amber-200/60 px-1">like this ⚠</span> were transcribed with low
        confidence — verify them against the audio if accuracy is critical.
      </p>

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
    </div>
  );
}

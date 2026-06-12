"use client";

import { useState } from "react";
import type { SessionData } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  "self-introduced": "introduced themselves",
  "addressed-by-others": "addressed by name",
  unknown: "name not detected",
};

interface Props {
  session: SessionData;
  onUpdate: (s: SessionData) => void;
}

/**
 * Lists detected speakers with confidence and lets the user rename them.
 * Renames propagate everywhere (transcript labels, action owners shown by
 * label, exports) because all views resolve labels through the speaker map.
 */
export function SpeakersTab({ session, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function commit(speakerId: string) {
    const label = draft.trim();
    setEditing(null);
    if (!label) return;
    onUpdate({
      ...session,
      speakers: session.speakers.map((s) => (s.id === speakerId ? { ...s, label } : s)),
    });
  }

  const segmentCount = (id: string) => session.segments.filter((s) => s.speakerId === id).length;

  return (
    <div>
      <p className="mb-3 text-xs leading-relaxed text-slate-500">
        Names are used only when someone said them in the conversation. Tap a name to correct it —
        the change applies to the transcript and all exports.
      </p>

      <ul className="grid gap-3">
        {session.speakers.map((sp) => (
          <li key={sp.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            {editing === sp.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commit(sp.id);
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Speaker name"
                  aria-label="Speaker name"
                />
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white active:bg-indigo-700">
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-2 text-sm text-slate-500">
                  ✕
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setEditing(sp.id);
                  setDraft(sp.label);
                }}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="text-base font-semibold text-slate-900">{sp.label}</span>
                <span className="text-xs font-medium text-indigo-600">✎ Edit</span>
              </button>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {SOURCE_LABELS[sp.nameSource]}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                {segmentCount(sp.id)} segments
              </span>
            </div>

            {/* Per-speaker identification confidence */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                <span>Identification confidence</span>
                <span>{Math.round(sp.confidence * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${
                    sp.confidence >= 0.8 ? "bg-emerald-500" : sp.confidence >= 0.6 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.round(sp.confidence * 100)}%` }}
                />
              </div>
            </div>

            {sp.notes && <p className="mt-2.5 text-xs italic leading-relaxed text-slate-500">{sp.notes}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

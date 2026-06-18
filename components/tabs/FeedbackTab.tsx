"use client";

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { generateFeedback } from "@/lib/api";
import { buildFeedbackText } from "@/lib/export";
import { computeMetrics, formatDuration } from "@/lib/metrics";
import type { SessionData } from "@/lib/types";

/** Bar colours, keyed by each speaker's index in session.speakers (matches Transcript). */
const BAR_COLORS = ["bg-indigo-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-sky-500", "bg-purple-500"];

interface Props {
  session: SessionData;
  onUpdate: (s: SessionData) => void;
  onToast: (msg: string) => void;
}

export function FeedbackTab({ session, onUpdate, onToast }: Props) {
  const [busy, setBusy] = useState(false);
  const metrics = computeMetrics(session);
  const feedback = session.feedback;

  // Keep bar colours consistent with the Transcript tab's speaker order.
  const colorIndex = new Map(session.speakers.map((s, i) => [s.id, i]));

  async function generate() {
    setBusy(true);
    try {
      const fb = await generateFeedback(session);
      onUpdate({ ...session, feedback: fb });
      onToast(feedback ? "Feedback regenerated" : "Feedback generated");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Feedback generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* ── Objective metrics (instant, computed from the transcript) ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Participation</h2>
        <ul className="grid gap-2.5">
          {metrics.speakers.map((s) => {
            const color = BAR_COLORS[(colorIndex.get(s.speakerId) ?? 0) % BAR_COLORS.length];
            return (
              <li key={s.speakerId}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="font-medium text-slate-700">{s.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {Math.round(s.talkPct * 100)}% · {formatDuration(s.talkSeconds)} · {s.turns} turns
                    {s.wordsPerMinute != null ? ` · ${s.wordsPerMinute} wpm` : ""}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, Math.round(s.talkPct * 100))}%` }} />
                </div>
              </li>
            );
          })}
        </ul>

        {/* Headline stats */}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["Duration", formatDuration(metrics.durationSec)],
            ["Speaking", formatDuration(metrics.totalSpeakingSeconds)],
            ["Quiet", formatDuration(metrics.deadAirSeconds)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-slate-50 py-2">
              <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
              <dd className="text-sm font-semibold tabular-nums text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          {metrics.startedBy && `Opened by ${metrics.startedBy}`}
          {metrics.endedBy && `, closed by ${metrics.endedBy}. `}
          {metrics.balanced ? "Talk time was fairly balanced." : "One participant did most of the talking."}
          {metrics.nearSilentLabels.length > 0 &&
            ` ${metrics.nearSilentLabels.join(", ")} contributed little — if that wasn't their role, the group could invite them in more next time.`}
        </p>
      </section>

      {/* ── Qualitative LLM feedback (on demand) ── */}
      {feedback ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Team retrospective</h2>
            <CopyButton onToast={onToast} getText={() => buildFeedbackText(session)} />
          </div>

          {feedback.overview && <p className="mb-4 text-sm leading-relaxed text-slate-700">{feedback.overview}</p>}

          <FeedbackList title="Structure & time" items={feedback.structure} accent="text-slate-700" />
          <FeedbackList title="Dynamics" items={feedback.dynamics} accent="text-slate-700" />
          <FeedbackList title="What went well" items={feedback.wentWell} accent="text-emerald-700" />
          <FeedbackList title="Try next time" items={feedback.improve} accent="text-indigo-700" />

          <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
            Based on the text transcript only — it reflects what was said, not tone of voice. Use it as a
            prompt for discussion, not a verdict.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
          <p className="mb-1 text-sm font-medium text-slate-800">Generate a team retrospective</p>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Blameless feedback on how the meeting went — structure, dynamics, what went well and what to try
            next time. Uses one AI request.
          </p>
        </section>
      )}

      <button
        onClick={() => void generate()}
        disabled={busy}
        className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition active:bg-indigo-100 disabled:opacity-50"
      >
        {busy ? "Analysing the meeting…" : feedback ? "↻ Regenerate feedback" : "✦ Generate feedback"}
      </button>
    </div>
  );
}

function FeedbackList({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-3 last:mb-0">
      <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</h3>
      <ul className="grid gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

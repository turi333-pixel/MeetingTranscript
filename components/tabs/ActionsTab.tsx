"use client";

import { useState } from "react";
import { improveActions } from "@/lib/api";
import type { SessionData } from "@/lib/types";

const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
};

interface Props {
  session: SessionData;
  onUpdate: (s: SessionData) => void;
  onToast: (msg: string) => void;
}

export function ActionsTab({ session, onUpdate, onToast }: Props) {
  const [busy, setBusy] = useState(false);

  async function improve() {
    setBusy(true);
    try {
      const actions = await improveActions(session);
      onUpdate({ ...session, actions });
      onToast("Action list improved");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Improvement failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {session.actions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm text-slate-500">No action items were identified in this conversation.</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {session.actions.map((a, i) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                  {i + 1}
                </span>
                <p className="flex-1 text-sm font-medium leading-snug text-slate-900">{a.task}</p>
                {a.priority && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[a.priority]}`}>
                    {a.priority}
                  </span>
                )}
              </div>
              <dl className="mt-2.5 grid gap-1 pl-7 text-xs text-slate-600">
                <div className="flex gap-1.5">
                  <dt className="font-medium text-slate-400">Owner:</dt>
                  <dd>{a.owner ?? <span className="italic text-slate-400">not identified</span>}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="font-medium text-slate-400">Deadline:</dt>
                  <dd>{a.deadline ?? <span className="italic text-slate-400">none mentioned</span>}</dd>
                </div>
                {a.openQuestions.length > 0 && (
                  <div>
                    <dt className="font-medium text-slate-400">Open questions / dependencies:</dt>
                    <dd>
                      <ul className="mt-0.5 list-disc pl-4">
                        {a.openQuestions.map((q, qi) => (
                          <li key={qi}>{q}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => void improve()}
        disabled={busy}
        className="mt-4 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition active:bg-indigo-100 disabled:opacity-50"
      >
        {busy ? "Improving…" : "✦ Improve action list"}
      </button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { regenerateSummary } from "@/lib/api";
import { markdownToHtml } from "@/lib/export";
import type { SessionData } from "@/lib/types";

interface Props {
  session: SessionData;
  onUpdate: (s: SessionData) => void;
  onToast: (msg: string) => void;
}

export function SummaryTab({ session, onUpdate, onToast }: Props) {
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      const summary = await regenerateSummary(session);
      onUpdate({ ...session, summary });
      onToast("Summary regenerated");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <CopyButton onToast={onToast} getText={() => session.summary} label="Copy summary" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {session.summary ? (
          // markdownToHtml escapes its input before adding markup — safe here.
          <div className="prose-summary" dangerouslySetInnerHTML={{ __html: markdownToHtml(session.summary) }} />
        ) : (
          <p className="text-sm text-slate-500">No summary was generated.</p>
        )}
      </div>

      <button
        onClick={() => void regenerate()}
        disabled={busy}
        className="mt-4 w-full rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 transition active:bg-indigo-100 disabled:opacity-50"
      >
        {busy ? "Regenerating…" : "↻ Regenerate summary"}
      </button>
    </div>
  );
}

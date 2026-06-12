"use client";

import { useEffect, useState } from "react";
import { ActionsTab } from "./tabs/ActionsTab";
import { SpeakersTab } from "./tabs/SpeakersTab";
import { SummaryTab } from "./tabs/SummaryTab";
import { TranscriptTab } from "./tabs/TranscriptTab";
import { formatTimestamp } from "@/lib/api";
import { buildText, copyToClipboard, downloadPdf, downloadWord, type ExportPart } from "@/lib/export";
import { deleteAudio, getAudio } from "@/lib/storage";
import type { SessionData } from "@/lib/types";

type Tab = "summary" | "transcript" | "actions" | "speakers";

const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "transcript", label: "Transcript" },
  { key: "actions", label: "Actions" },
  { key: "speakers", label: "Speakers" },
];

interface Props {
  session: SessionData;
  onBack: () => void;
  onUpdate: (s: SessionData) => void;
  onDelete: () => void;
}

export function ResultsView({ session, onBack, onUpdate, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>("summary");
  const [exportOpen, setExportOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load opt-in saved audio for playback (object URL revoked on unmount).
  useEffect(() => {
    let url: string | null = null;
    if (session.audioSaved) {
      void getAudio(session.id).then((blob) => {
        if (blob) {
          url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [session.id, session.audioSaved]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function handleCopy(part: ExportPart) {
    const ok = await copyToClipboard(buildText(session, part));
    showToast(ok ? "Copied to clipboard" : "Copy failed — your browser blocked clipboard access");
    setExportOpen(false);
  }

  async function handleDeleteAudio() {
    if (!confirm("Delete the saved audio from this device? The transcript and results are kept.")) return;
    await deleteAudio(session.id);
    setAudioUrl(null);
    onUpdate({ ...session, audioSaved: false });
    showToast("Audio deleted");
  }

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const confColor = (n: number) =>
    n >= 0.8 ? "bg-emerald-100 text-emerald-800" : n >= 0.6 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 pb-0 pt-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="rounded-lg p-2 text-slate-600 active:bg-slate-100" aria-label="Back to home">
            ←
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{session.title}</h1>

          {/* Export menu */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 active:bg-slate-100"
              aria-expanded={exportOpen}
            >
              Export
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} aria-hidden />
                <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {(
                    [
                      ["all", "Everything"],
                      ["summary", "Summary"],
                      ["transcript", "Transcript"],
                      ["actions", "Action list"],
                    ] as [ExportPart, string][]
                  ).map(([part, label]) => (
                    <div key={part} className="flex items-center justify-between gap-1 rounded-lg px-2 py-1.5">
                      <span className="text-xs font-medium text-slate-700">{label}</span>
                      <span className="flex gap-1">
                        <button onClick={() => void handleCopy(part)} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 active:bg-slate-200">
                          Copy
                        </button>
                        <button
                          onClick={() => {
                            downloadPdf(session, part);
                            setExportOpen(false);
                          }}
                          className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 active:bg-slate-200"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => {
                            downloadWord(session, part);
                            setExportOpen(false);
                          }}
                          className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700 active:bg-slate-200"
                        >
                          Word
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Meta + confidence badges */}
        <div className="mt-2 flex flex-wrap gap-1.5 px-1 pb-2 text-[11px]">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {session.language} · {formatTimestamp(session.durationSec)}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${confColor(session.transcriptionConfidence)}`}>
            Transcription {pct(session.transcriptionConfidence)}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${confColor(session.speakerConfidence)}`}>
            Speakers {pct(session.speakerConfidence)}
          </span>
        </div>

        {/* Tabs */}
        <nav className="flex" role="tablist" aria-label="Results">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 border-b-2 px-1 pb-2.5 pt-1 text-sm font-medium transition ${
                tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Saved audio playback (only when the user opted to keep it) */}
      {audioUrl && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <audio controls src={audioUrl} className="h-9 w-full" />
          <button onClick={() => void handleDeleteAudio()} className="shrink-0 rounded-lg p-2 text-slate-400 active:text-red-600" aria-label="Delete saved audio">
            🗑️
          </button>
        </div>
      )}

      {/* Active tab */}
      <div className="flex-1 px-4 py-4">
        {tab === "summary" && <SummaryTab session={session} onUpdate={onUpdate} onToast={showToast} />}
        {tab === "transcript" && <TranscriptTab session={session} onToast={showToast} />}
        {tab === "actions" && <ActionsTab session={session} onUpdate={onUpdate} onToast={showToast} />}
        {tab === "speakers" && <SpeakersTab session={session} onUpdate={onUpdate} onToast={showToast} />}
      </div>

      {/* Danger zone */}
      <footer className="px-4 pb-8 pt-2">
        <button
          onClick={() => {
            if (confirm("Delete this session — transcript, summary, actions and any saved audio? This cannot be undone.")) {
              onDelete();
            }
          }}
          className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 transition active:bg-red-50"
        >
          Delete session &amp; all data
        </button>
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

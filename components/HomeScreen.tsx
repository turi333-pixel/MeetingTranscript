"use client";

import { useRef } from "react";
import { formatTimestamp } from "@/lib/api";
import type { SessionData } from "@/lib/types";

// Client-side guard matching the Whisper API limit (re-checked server-side).
const MAX_FILE_BYTES = 25 * 1024 * 1024;

interface Props {
  sessions: SessionData[];
  error: string | null;
  onDismissError: () => void;
  onFilePicked: (file: File) => void;
  onRecord: () => void;
  onOpenSession: (s: SessionData) => void;
  onDeleteSession: (id: string) => void;
}

export function HomeScreen({
  sessions,
  error,
  onDismissError,
  onFilePicked,
  onRecord,
  onOpenSession,
  onDeleteSession,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      alert("This file is larger than 25 MB (the transcription limit). Please use a shorter or compressed recording.");
      return;
    }
    onFilePicked(file);
  }

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 pt-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">MeetingTranscript</h1>
        <p className="mt-1 text-sm text-slate-500">
          Accurate meeting transcription, speakers, summary and action items.
        </p>
      </header>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
          <p className="flex-1 text-sm text-red-800">{error}</p>
          <button onClick={onDismissError} className="text-sm font-medium text-red-600" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {/* The two main entry points */}
      <div className="grid gap-4">
        <button
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition active:scale-[0.99] active:bg-slate-100"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-2xl" aria-hidden>
            ⬆️
          </span>
          <span>
            <span className="block text-base font-semibold text-slate-900">Upload audio</span>
            <span className="block text-sm text-slate-500">MP3, M4A, WAV, WebM — up to 25 MB</span>
          </span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm,.ogg,.mp4"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = ""; // allow re-picking the same file
          }}
        />

        <button
          onClick={onRecord}
          className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition active:scale-[0.99] active:bg-slate-100"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100 text-2xl" aria-hidden>
            🎙️
          </span>
          <span>
            <span className="block text-base font-semibold text-slate-900">Record conversation</span>
            <span className="block text-sm text-slate-500">Live-listen with the microphone</span>
          </span>
        </button>
      </div>

      {/* Previous sessions (stored only in this browser) */}
      {sessions.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Previous sessions
          </h2>
          <ul className="grid gap-2">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <button onClick={() => onOpenSession(s)} className="flex-1 text-left">
                  <span className="block truncate text-sm font-medium text-slate-900">{s.title}</span>
                  <span className="block text-xs text-slate-500">
                    {formatTimestamp(s.durationSec)} · {s.language} · {s.speakers.length}{" "}
                    {s.speakers.length === 1 ? "speaker" : "speakers"}
                    {s.audioSaved ? " · audio saved" : ""}
                  </span>
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this session, its transcript and any saved audio? This cannot be undone.")) {
                      onDeleteSession(s.id);
                    }
                  }}
                  className="rounded-lg p-2 text-slate-400 transition active:bg-red-50 active:text-red-600"
                  aria-label={`Delete ${s.title}`}
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto pt-10 text-center text-xs leading-relaxed text-slate-400">
        Audio is sent to external AI services (OpenAI &amp; Anthropic) only when you start processing,
        and is never stored on a server. Transcripts stay on this device until you delete them.
      </footer>
    </div>
  );
}

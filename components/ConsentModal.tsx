"use client";

import { useState } from "react";

/**
 * GDPR consent step shown before any audio leaves the device:
 *  - before processing an uploaded file
 *  - before the microphone starts recording
 * Audio retention is opt-in (unchecked by default).
 */
interface Props {
  mode: "upload" | "record";
  onConfirm: (keepAudio: boolean) => void;
  onCancel: () => void;
}

export function ConsentModal({ mode, onConfirm, onCancel }: Props) {
  const [keepAudio, setKeepAudio] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
      >
        <h2 id="consent-title" className="text-lg font-semibold text-slate-900">
          {mode === "record" ? "Before recording starts" : "Before processing starts"}
        </h2>

        <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-slate-600">
          {mode === "record" && (
            <li className="flex gap-2.5">
              <span aria-hidden>🎙️</span>
              <span>
                Make sure <strong>everyone in the conversation consents</strong> to being recorded —
                in many countries this is a legal requirement.
              </span>
            </li>
          )}
          <li className="flex gap-2.5">
            <span aria-hidden>☁️</span>
            <span>
              The audio will be <strong>sent to external AI services</strong> (OpenAI for transcription,
              Anthropic for analysis) to produce the transcript, summary and action items.
            </span>
          </li>
          <li className="flex gap-2.5">
            <span aria-hidden>🔒</span>
            <span>
              Audio is processed in memory and <strong>not stored on any server</strong>. Results are kept
              only in this browser, and you can delete them at any time.
            </span>
          </li>
        </ul>

        <label className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={keepAudio}
            onChange={(e) => setKeepAudio(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-indigo-600"
          />
          <span>
            Also keep the audio <strong>on this device</strong> so I can replay it later
            <span className="block text-xs text-slate-500">Off by default — audio is discarded after processing.</span>
          </span>
        </label>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition active:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(keepAudio)}
            className="rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition active:bg-indigo-700"
          >
            {mode === "record" ? "Agree & record" : "Agree & process"}
          </button>
        </div>
      </div>
    </div>
  );
}

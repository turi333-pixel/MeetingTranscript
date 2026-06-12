"use client";

import { useEffect, useRef, useState } from "react";
import { ConsentModal } from "./ConsentModal";

/**
 * Browser recorder built on the MediaRecorder API.
 * Flow: consent → mic permission → record (pause/resume) → stop → process.
 * Picks an Whisper-compatible container per browser:
 * audio/webm;codecs=opus (Chrome/Firefox/Android) or audio/mp4 (Safari/iOS).
 */
interface Props {
  onComplete: (blob: Blob, mimeType: string, keepAudio: boolean) => void;
  onCancel: () => void;
}

type Phase = "consent" | "starting" | "recording" | "paused";

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Recorder({ onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>("consent");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const keepAudioRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Set when the user taps "Stop & transcribe", so onstop knows whether to
  // hand the audio off for processing or discard it (cancel/unmount).
  const finishRef = useRef(false);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  async function start(keepAudio: boolean) {
    keepAudioRef.current = keepAudio;
    setPhase("starting");
    try {
      // Echo cancellation / noise suppression improve far-field meeting audio.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!finishRef.current) return; // cancelled — discard audio
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        if (blob.size === 0) {
          setError("No audio was captured. Please try again.");
          setPhase("consent");
          return;
        }
        onComplete(blob, type, keepAudioRef.current);
      };

      recorder.start(1000); // gather data every second so nothing is lost
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    } catch {
      setError("Microphone access was denied. Please allow microphone access in your browser settings and try again.");
      setPhase("consent");
    }
  }

  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase("paused");
    } else if (rec.state === "paused") {
      rec.resume();
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      setPhase("recording");
    }
  }

  function finish() {
    finishRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  function cancel() {
    finishRef.current = false;
    cleanup();
    onCancel();
  }

  if (phase === "consent") {
    return (
      <>
        {error && (
          <div className="fixed inset-x-0 top-0 z-[60] m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}
        <ConsentModal mode="record" onConfirm={(keep) => void start(keep)} onCancel={onCancel} />
      </>
    );
  }

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-10">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl ${
            phase === "recording" ? "animate-pulse bg-rose-100" : "bg-slate-200"
          }`}
          aria-hidden
        >
          🎙️
        </div>
        <p className="mt-6 font-mono text-4xl font-semibold tabular-nums text-slate-900" aria-live="polite">
          {mins}:{String(secs).padStart(2, "0")}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {phase === "starting" && "Starting microphone…"}
          {phase === "recording" && "Listening — speak naturally"}
          {phase === "paused" && "Paused"}
        </p>
      </div>

      <div className="mt-12 grid w-full max-w-xs gap-3">
        <button
          onClick={finish}
          disabled={phase === "starting"}
          className="rounded-xl bg-indigo-600 px-4 py-4 text-base font-semibold text-white transition active:bg-indigo-700 disabled:opacity-50"
        >
          Stop &amp; transcribe
        </button>
        <button
          onClick={togglePause}
          disabled={phase === "starting"}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition active:bg-slate-100 disabled:opacity-50"
        >
          {phase === "paused" ? "Resume" : "Pause"}
        </button>
        <button onClick={cancel} className="rounded-xl px-4 py-3 text-sm font-medium text-slate-500 transition active:bg-slate-100">
          Cancel &amp; discard
        </button>
      </div>
    </div>
  );
}

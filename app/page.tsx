"use client";

import { useEffect, useState } from "react";
import { ConsentModal } from "@/components/ConsentModal";
import { HomeScreen } from "@/components/HomeScreen";
import { ProcessingScreen } from "@/components/ProcessingScreen";
import { Recorder } from "@/components/Recorder";
import { ResultsView } from "@/components/ResultsView";
import { processAudio } from "@/lib/api";
import { deleteSession, listSessions, saveAudio, saveSession } from "@/lib/storage";
import type { ProcessingStage, SessionData } from "@/lib/types";

type Screen = "home" | "record" | "processing" | "results";

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [current, setCurrent] = useState<SessionData | null>(null);
  const [stage, setStage] = useState<ProcessingStage>("uploading");
  const [error, setError] = useState<string | null>(null);
  /** File picked by the user, waiting for processing consent. */
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);

  // Sessions live only in this browser (localStorage) — load after mount.
  useEffect(() => setSessions(listSessions()), []);

  async function runPipeline(
    blob: Blob,
    fileName: string,
    source: "upload" | "recording",
    keepAudio: boolean,
  ) {
    setError(null);
    setScreen("processing");
    try {
      const session = await processAudio(blob, fileName, source, setStage);
      // Audio is kept ONLY when the user opted in; otherwise the blob is
      // simply dropped here and garbage-collected (GDPR data minimisation).
      if (keepAudio) {
        await saveAudio(session.id, blob);
        session.audioSaved = true;
      }
      saveSession(session);
      setSessions(listSessions());
      setCurrent(session);
      setScreen("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed. Please try again.");
      setScreen("home");
    }
  }

  function handleSessionUpdate(updated: SessionData) {
    saveSession(updated);
    setCurrent(updated);
    setSessions(listSessions());
  }

  async function handleSessionDelete(id: string) {
    await deleteSession(id);
    setSessions(listSessions());
    if (current?.id === id) {
      setCurrent(null);
      setScreen("home");
    }
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg">
      {screen === "home" && (
        <HomeScreen
          sessions={sessions}
          error={error}
          onDismissError={() => setError(null)}
          onFilePicked={(file) => setPendingUpload(file)}
          onRecord={() => {
            setError(null);
            setScreen("record");
          }}
          onOpenSession={(s) => {
            setCurrent(s);
            setScreen("results");
          }}
          onDeleteSession={handleSessionDelete}
        />
      )}

      {/* Consent before an uploaded file is sent to external AI services */}
      {pendingUpload && (
        <ConsentModal
          mode="upload"
          onCancel={() => setPendingUpload(null)}
          onConfirm={(keepAudio) => {
            const file = pendingUpload;
            setPendingUpload(null);
            void runPipeline(file, file.name, "upload", keepAudio);
          }}
        />
      )}

      {screen === "record" && (
        <Recorder
          onCancel={() => setScreen("home")}
          onComplete={(blob, mimeType, keepAudio) => {
            const ext = mimeType.includes("mp4") ? "m4a" : "webm";
            void runPipeline(blob, `recording.${ext}`, "recording", keepAudio);
          }}
        />
      )}

      {screen === "processing" && <ProcessingScreen stage={stage} />}

      {screen === "results" && current && (
        <ResultsView
          session={current}
          onBack={() => setScreen("home")}
          onUpdate={handleSessionUpdate}
          onDelete={() => void handleSessionDelete(current.id)}
        />
      )}
    </main>
  );
}

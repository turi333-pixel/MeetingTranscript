"use client";

import type { ProcessingStage } from "@/lib/types";

const STEPS: { key: ProcessingStage; label: string; detail: string }[] = [
  { key: "uploading", label: "Preparing audio", detail: "Getting your audio ready to send" },
  { key: "transcribing", label: "Transcribing", detail: "Detecting language and converting speech to text" },
  { key: "analyzing", label: "Identifying speakers & analysing", detail: "Speakers, summary and action items" },
  { key: "done", label: "Done", detail: "" },
];

export function ProcessingScreen({ stage }: { stage: ProcessingStage }) {
  const activeIndex = STEPS.findIndex((s) => s.key === stage);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden />
      <h2 className="mt-6 text-lg font-semibold text-slate-900">Processing your conversation</h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        Accuracy is prioritised over speed — long recordings can take a few minutes.
      </p>

      <ol className="mt-8 w-full max-w-xs" aria-live="polite">
        {STEPS.filter((s) => s.key !== "done").map((step, i) => {
          const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
          return (
            <li key={step.key} className="flex gap-3 pb-5 last:pb-0">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  state === "done"
                    ? "bg-emerald-500 text-white"
                    : state === "active"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 text-slate-500"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span>
                <span className={`block text-sm font-medium ${state === "todo" ? "text-slate-400" : "text-slate-900"}`}>
                  {step.label}
                  {state === "active" && "…"}
                </span>
                <span className="block text-xs text-slate-500">{step.detail}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

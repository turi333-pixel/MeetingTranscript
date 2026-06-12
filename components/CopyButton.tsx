"use client";

import { copyToClipboard } from "@/lib/export";

/** Small pill button that copies a section's text to the clipboard. */
interface Props {
  getText: () => string;
  onToast: (msg: string) => void;
  label?: string;
}

export function CopyButton({ getText, onToast, label = "Copy" }: Props) {
  return (
    <button
      onClick={async () => {
        const ok = await copyToClipboard(getText());
        onToast(ok ? "Copied to clipboard" : "Copy failed — your browser blocked clipboard access");
      }}
      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition active:bg-slate-100"
    >
      ⧉ {label}
    </button>
  );
}

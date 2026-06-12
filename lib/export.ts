/**
 * Copy & export utilities: clipboard, PDF (via the browser's print-to-PDF,
 * which works on iOS/Android/desktop without heavy dependencies) and Word
 * (.doc via Word-compatible HTML — opens natively in Word/Pages/Google Docs).
 */

import { formatTimestamp, labelledTranscript } from "./api";
import type { SessionData } from "./types";

export type ExportPart = "summary" | "transcript" | "actions" | "all";

// ── Plain-text builders (used for clipboard copy) ──────────────────────────

export function buildText(session: SessionData, part: ExportPart): string {
  const blocks: string[] = [];
  if (part === "summary" || part === "all") {
    blocks.push(`# Executive summary\n\n${session.summary}`);
  }
  if (part === "actions" || part === "all") {
    blocks.push(`# Action items\n\n${actionsText(session)}`);
  }
  if (part === "transcript" || part === "all") {
    blocks.push(`# Transcript\n\n${transcriptHeader(session)}\n\n${labelledTranscript(session)}`);
  }
  return blocks.join("\n\n---\n\n");
}

function actionsText(session: SessionData): string {
  if (session.actions.length === 0) return "No action items identified.";
  return session.actions
    .map((a, i) => {
      const lines = [`${i + 1}. ${a.task}`];
      if (a.owner) lines.push(`   Owner: ${a.owner}`);
      if (a.deadline) lines.push(`   Deadline: ${a.deadline}`);
      if (a.priority) lines.push(`   Priority: ${a.priority}`);
      if (a.openQuestions.length) lines.push(`   Open questions: ${a.openQuestions.join("; ")}`);
      return lines.join("\n");
    })
    .join("\n");
}

function transcriptHeader(session: SessionData): string {
  return [
    `Language: ${session.language}`,
    `Duration: ${formatTimestamp(session.durationSec)}`,
    `Transcription confidence: ${Math.round(session.transcriptionConfidence * 100)}%`,
    `Speaker identification confidence: ${Math.round(session.speakerConfidence * 100)}%`,
    `(⚠ marks low-confidence passages)`,
  ].join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── HTML document (shared by PDF print and Word export) ────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Tiny markdown-to-HTML for summaries (headings, bold, lists, paragraphs).
 * Input is escaped, so this is safe to inject. Also used by the Summary tab.
 */
export function markdownToHtml(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      const h = block.match(/^(#{1,4})\s+(.*)$/);
      if (h) return `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      return `<p>${lines.map(inline).join("<br/>")}</p>`;
    })
    .join("\n");
  function inline(s: string): string {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>");
  }
}

function buildHtml(session: SessionData, part: ExportPart): string {
  const labels = new Map(session.speakers.map((s) => [s.id, s.label]));
  const sections: string[] = [];

  sections.push(
    `<h1>${esc(session.title)}</h1>
     <p class="meta">Language: ${esc(session.language)} · Duration: ${formatTimestamp(session.durationSec)} ·
     Transcription confidence: ${Math.round(session.transcriptionConfidence * 100)}% ·
     Speaker confidence: ${Math.round(session.speakerConfidence * 100)}%</p>`,
  );

  if (part === "summary" || part === "all") {
    sections.push(`<h2>Executive summary</h2>${markdownToHtml(session.summary)}`);
  }

  if (part === "actions" || part === "all") {
    const rows = session.actions
      .map(
        (a) => `<tr>
          <td>${esc(a.task)}</td>
          <td>${esc(a.owner ?? "—")}</td>
          <td>${esc(a.deadline ?? "—")}</td>
          <td>${esc(a.priority ?? "—")}</td>
          <td>${a.openQuestions.length ? esc(a.openQuestions.join("; ")) : "—"}</td>
        </tr>`,
      )
      .join("");
    sections.push(
      `<h2>Action items</h2>` +
        (session.actions.length
          ? `<table><thead><tr><th>Task</th><th>Owner</th><th>Deadline</th><th>Priority</th><th>Open questions</th></tr></thead><tbody>${rows}</tbody></table>`
          : `<p>No action items identified.</p>`),
    );
  }

  if (part === "transcript" || part === "all") {
    const lines = session.segments
      .map((seg) => {
        const who = seg.speakerId ? labels.get(seg.speakerId) ?? seg.speakerId : "Unknown";
        const cls = seg.lowConfidence ? ` class="low"` : "";
        return `<p${cls}><span class="ts">[${formatTimestamp(seg.start)}]</span> <strong>${esc(who)}:</strong> ${esc(seg.text)}${seg.lowConfidence ? ' <span class="flag">⚠ low confidence</span>' : ""}</p>`;
      })
      .join("\n");
    sections.push(`<h2>Transcript</h2>${lines}`);
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(session.title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a202c; line-height: 1.55; max-width: 720px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #cbd5e0; padding-bottom: .3rem; }
  .meta { color: #4a5568; font-size: .85rem; }
  .ts { color: #718096; font-size: .8rem; font-variant-numeric: tabular-nums; }
  .low { background: #fffbea; } .flag { color: #b7791f; font-size: .75rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { border: 1px solid #cbd5e0; padding: .4rem .5rem; text-align: left; vertical-align: top; }
  th { background: #edf2f7; }
</style></head><body>${sections.join("\n")}</body></html>`;
}

// ── PDF: open a print window; the user saves as PDF (mobile & desktop) ─────

export function downloadPdf(session: SessionData, part: ExportPart): void {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow pop-ups to export as PDF.");
    return;
  }
  win.document.write(buildHtml(session, part));
  win.document.close();
  // Give the new window a moment to render before opening the print dialog.
  setTimeout(() => win.print(), 400);
}

// ── Word: download Word-compatible HTML with a .doc extension ──────────────

export function downloadWord(session: SessionData, part: ExportPart): void {
  const blob = new Blob(["﻿" + buildHtml(session, part)], {
    type: "application/msword",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${session.title.replace(/[^\p{L}\p{N}\- ]/gu, "").trim() || "transcript"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

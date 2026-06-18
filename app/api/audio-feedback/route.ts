import { NextRequest, NextResponse } from "next/server";
import { extractJson } from "@/lib/anthropic";
import type { AudioSignals } from "@/lib/types";

/**
 * POST /api/audio-feedback  (phase 2)
 *
 * Listens to the AUDIO (not just the transcript) and returns observations
 * about tone, energy and overlapping/interrupted speech.
 *
 * ── PLUG IN YOUR AUDIO MODEL HERE ──────────────────────────────────────────
 * Default: OpenAI audio-native chat model (OPENAI_AUDIO_MODEL, default
 * gpt-audio-mini) via the chat completions `input_audio` interface. The audio
 * arrives as a small 16 kHz mono WAV prepared in the browser (lib/audio.ts).
 *
 * The transcript is passed as text context so the model can attribute what it
 * hears to who said it. To swap providers (e.g. Gemini), replace the fetch
 * below and keep the AudioSignals return shape.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_WAV_BYTES = 60 * 1024 * 1024; // matches the client-side 30-min cap

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }

  let file: File | null = null;
  let transcript = "";
  let language = "unknown";
  try {
    const form = await req.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
    transcript = String(form.get("transcript") ?? "");
    language = String(form.get("language") ?? "unknown");
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a 'file' field." }, { status: 400 });
  }

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (file.size > MAX_WAV_BYTES) {
    return NextResponse.json({ error: "Audio is too long to analyse. Please use a shorter recording." }, { status: 413 });
  }

  const model = process.env.OPENAI_AUDIO_MODEL ?? "gpt-audio-mini";
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const prompt = `You are helping a team run a blameless meeting retrospective. You can HEAR the meeting audio. A text transcript (language: "${language}") is provided for context so you can tell who said what:

<transcript>
${transcript.slice(0, 12000)}
</transcript>

Listen to the audio and report ONLY what the words alone cannot convey: tone, energy, pace, and moments of people talking over each other or audible tension/enthusiasm. Respond with ONLY a JSON object (no markdown fences):

{
  "overview": "1-2 sentences on the overall tone and energy of the meeting",
  "observations": ["specific audio-derived point (e.g. energy dipped in the second half, two speakers talked over each other near the start, the close felt rushed)", ...]
}

Strict rules:
- This is a TEAM retrospective: describe the MEETING and group, never judge an individual's character.
- Report only what you can actually hear. Do NOT invent emotions or events. If the audio is unclear or neutral, say so plainly and keep the list short.
- Write in the SAME language as the meeting (${language}).
- 2-5 observations; fewer is fine if there is little of note.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        modalities: ["text"], // audio in, text out
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "input_audio", input_audio: { data: base64, format: "wav" } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Audio model error (${res.status}): ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Audio model returned an empty response.");

    const parsed = extractJson(text) as Partial<AudioSignals>;
    const signals: AudioSignals = {
      overview: typeof parsed.overview === "string" ? parsed.overview : "",
      observations: Array.isArray(parsed.observations)
        ? parsed.observations.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        : [],
      model,
    };
    return NextResponse.json({ signals });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Audio analysis failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

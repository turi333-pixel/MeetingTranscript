# MeetingTranscript

Mobile-first web app for accurate meeting and conversation transcription:
record live or upload audio, get a literal transcript with speaker labels, an
executive summary and a structured action list — in the conversation's
original language, with explicit confidence scores and uncertainty markers.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your OPENAI_API_KEY and ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

> Microphone recording requires a secure context: `localhost` works; on a
> phone over LAN you need HTTPS (e.g. `npx ngrok http 3000` or deploy).

## Architecture

```
record (MediaRecorder) ─┐
                        ├─► POST /api/transcribe ──► OpenAI Whisper (verbose_json)
upload (file input) ────┘        │                    language auto-detect,
                                 │                    timestamps, confidence
                                 ▼
                        POST /api/analyze ─────────► Anthropic Claude
                                 │                    speaker separation & naming,
                                 │                    summary, action items
                                 ▼
                        SessionData → localStorage (results)
                                    → IndexedDB (audio, opt-in only)
```

| Concern | Where | How to swap |
|---|---|---|
| Transcription | `app/api/transcribe/route.ts` | Replace `transcribeWithWhisper()`; keep the `TranscriptionResult` shape |
| Acoustic diarisation (optional upgrade) | comments in `app/api/transcribe/route.ts` | Plug AssemblyAI/Deepgram/pyannote; set `speakerId` per segment — `/api/analyze` will preserve it |
| LLM analysis | `app/api/analyze/route.ts`, `app/api/regenerate/route.ts` | Swap `callClaude()` in `lib/anthropic.ts` |
| Persistence | `lib/storage.ts` | Replace with Supabase/Firebase calls; nothing else touches storage directly |

## Quality behaviour

- **Accuracy over speed** — Whisper at temperature 0, low-temperature LLM extraction.
- **Original language preserved** — Whisper auto-detects; summary and actions are written in the same language.
- **No invention** — prompts forbid fabricated owners/deadlines/names; near-silent segments Whisper flags are dropped instead of kept as likely hallucinations.
- **Uncertainty is visible** — per-segment confidence from Whisper's `avg_logprob`/`no_speech_prob`; segments under 60 % are flagged ⚠ in the UI and exports. Real names are used only if self-introduced or addressed by name, otherwise "Speaker N"; uncertain names appear as notes ("possibly 'Ana'").
- **Confidence scores** — overall transcription confidence and speaker-identification confidence shown as badges; per-speaker confidence bars in the Speakers tab.
- **Editable speakers** — rename in the Speakers tab; propagates to transcript and exports.

Note: without a dedicated diarisation API, speaker separation is LLM-inferred
from the text — solid for turn-taking meetings, weaker on overlapping speech.
The speaker confidence score reflects this; wire in acoustic diarisation for
production use (see comments in the transcribe route).

## Privacy & GDPR

- Explicit consent dialog before recording **and** before processing uploads, stating that audio goes to OpenAI/Anthropic.
- Audio is processed in memory server-side and never written to disk or database.
- Audio retention is **opt-in** (IndexedDB on the device); off by default.
- All results live in the browser only (localStorage); delete buttons remove sessions, transcripts and audio.
- No accounts, no cookies, no analytics in the MVP. To add accounts later, swap `lib/storage.ts` for a backend and put auth in front of the API routes.

## Exports

Copy to clipboard, print-to-PDF and Word (`.doc`) for the summary, transcript,
action list, or everything together (`lib/export.ts`).

## Environment variables

See `.env.example`. Required: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
Optional: `OPENAI_TRANSCRIPTION_MODEL`, `ANTHROPIC_MODEL`, `ASSEMBLYAI_API_KEY`.

## Limits

- 25 MB per audio file (Whisper API limit) — roughly 25–50 minutes of
  compressed audio. For longer meetings, chunk the audio client-side before
  upload (split on silence) and concatenate the segment lists.
- localStorage holds ~5 MB of sessions; oldest sessions are trimmed when full.

/**
 * Client-side audio preparation for phase-2 tone/energy analysis.
 *
 * The recorder produces WebM/Opus or MP4/M4A, but audio-native chat models
 * accept WAV/MP3. Rather than transcode on the server (which would need
 * ffmpeg), we decode the recording in the browser with the Web Audio API and
 * re-encode it as a small 16 kHz mono 16-bit WAV. 16 kHz mono is plenty for
 * speech/prosody analysis and keeps the upload (and the audio-token cost)
 * small.
 */

const TARGET_RATE = 16000;
// Safety cap so a very long meeting can't produce a huge, expensive request.
// ~30 min at 16 kHz mono 16-bit ≈ 57 MB WAV; we cap the analysed span instead.
const MAX_SECONDS = 30 * 60;

export async function toMonoWav16k(input: Blob): Promise<{ blob: Blob; seconds: number; truncated: boolean }> {
  const arrayBuf = await input.arrayBuffer();

  // decodeAudioData handles the container/codec (webm/opus, mp4/m4a, wav…).
  const AudioCtx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    void decodeCtx.close();
  }

  const truncated = decoded.duration > MAX_SECONDS;
  const seconds = Math.min(decoded.duration, MAX_SECONDS);
  const frameCount = Math.ceil(seconds * TARGET_RATE);

  // Resample to 16 kHz mono via an OfflineAudioContext.
  const offline = new OfflineAudioContext(1, frameCount, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();

  return { blob: encodeWav(rendered.getChannelData(0), TARGET_RATE), seconds, truncated };
}

/** Encode mono Float32 PCM samples as a 16-bit WAV blob. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

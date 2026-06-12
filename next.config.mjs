/** @type {import('next').NextConfig} */
const nextConfig = {
  // Route handlers stream request bodies, so audio uploads are not subject to
  // the legacy 4 MB body-parser limit. If you deploy behind a proxy (nginx,
  // Vercel, etc.) make sure its body-size limit allows your audio files
  // (OpenAI Whisper accepts up to 25 MB per file).
};

export default nextConfig;

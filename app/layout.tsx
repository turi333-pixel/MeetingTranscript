import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MeetingTranscript — meeting transcription & action items",
  description:
    "Record or upload a conversation, get an accurate transcript with speakers, an executive summary and action items. Processed on demand, stored only on your device.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Prevent iOS zoom-on-input jumping around the recording UI
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

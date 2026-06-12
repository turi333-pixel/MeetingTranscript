/**
 * Local-only persistence (GDPR-friendly MVP):
 *  - Sessions (transcript, summary, actions, speakers) live in localStorage.
 *  - Audio is stored in IndexedDB ONLY when the user explicitly opts in;
 *    by default recordings/uploads are discarded after processing.
 *  - Everything can be deleted by the user from the UI.
 *
 * LATER: to move to Supabase/Firebase, replace the functions in this file
 * with API-backed equivalents and add auth — the rest of the app only calls
 * these functions, never localStorage/IndexedDB directly.
 */

import type { SessionData } from "./types";

const SESSIONS_KEY = "transcribe.sessions.v1";
const DB_NAME = "transcribe-audio";
const STORE = "audio";

// ── Sessions (localStorage) ────────────────────────────────────────────────

export function listSessions(): SessionData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const sessions = raw ? (JSON.parse(raw) as SessionData[]) : [];
    return sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function saveSession(session: SessionData): void {
  const sessions = listSessions().filter((s) => s.id !== session.id);
  sessions.unshift(session);
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // localStorage is full (~5 MB) — drop oldest sessions until it fits.
    while (sessions.length > 1) {
      sessions.pop();
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        return;
      } catch {
        /* keep trimming */
      }
    }
  }
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = listSessions().filter((s) => s.id !== id);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  await deleteAudio(id); // always remove any stored audio with the session
}

// ── Audio (IndexedDB, opt-in only) ─────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAudio(sessionId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, sessionId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAudio(sessionId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(sessionId);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  } catch {
    return null;
  }
}

export async function deleteAudio(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(sessionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* nothing stored */
  }
}

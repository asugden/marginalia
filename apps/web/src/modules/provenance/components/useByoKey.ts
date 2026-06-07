// Bring-your-own LLM key (slice 5). The key lives ONLY in the browser's
// localStorage and is attached to chat requests via the
// X-Provenance-LLM-Key header (see api.ts streamChatTurn). It is never
// sent to the server except on that proxied request, and the worker
// never persists it.
//
// We deliberately keep this dead simple: a string or null, plus set/clear.
// No syncing, no expiry — it's the student's own credential to manage.

import { useCallback, useState } from "react";

const BYO_KEY_STORAGE = "provenance.llmKey";

function read(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(BYO_KEY_STORAGE);
}

export interface ByoKeyState {
  /** The stored key, or null if the student hasn't set one. */
  key: string | null;
  /** True when a personal key is in effect. */
  active: boolean;
  setKey: (next: string) => void;
  clear: () => void;
}

export function useByoKey(): ByoKeyState {
  const [key, setKeyState] = useState<string | null>(() => read());

  const setKey = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed) {
      window.localStorage.removeItem(BYO_KEY_STORAGE);
      setKeyState(null);
      return;
    }
    window.localStorage.setItem(BYO_KEY_STORAGE, trimmed);
    setKeyState(trimmed);
  }, []);

  const clear = useCallback(() => {
    window.localStorage.removeItem(BYO_KEY_STORAGE);
    setKeyState(null);
  }, []);

  return { key, active: key !== null, setKey, clear };
}

/** Mask a key for display: show the first 3 and last 4 chars only. */
export function maskKey(key: string): string {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

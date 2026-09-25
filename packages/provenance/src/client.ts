// Live, in-editor helpers: the "best guess" half of provenance.
//
// An editor assigns origins as the student works so it can repaint without a
// round trip. Nothing here is authoritative — the server recomputes the frozen
// render from the event log (see render.ts) — but these rules are shared so
// every editor guesses the same way, and an improvement lands everywhere.

import type { OriginRun } from "./origins.js";

/** Collapse runs of whitespace to one space, so text that differs only in
 *  spacing still matches. */
export function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, " ");
}

// ── Reversion ───────────────────────────────────────────────────────────
//
// When a student re-types text that exactly matches a past AI contribution
// this long or longer, the typed run is re-stamped `llm`, so suggested wording
// can't be laundered into "human" by typing it out. The floor keeps short
// common phrases from tripping it.

export const MIN_REVERSION_LENGTH = 12;

/** Add a contribution to a reversion index (normalized, deduped,
 *  longest-first), if it clears the minimum length. Mutates `list`. */
export function rememberContribution(list: string[], text: string): void {
  const norm = normalizeForMatch(text).trim();
  if (norm.length < MIN_REVERSION_LENGTH) return;
  if (list.includes(norm)) return;
  list.push(norm);
  list.sort((a, b) => b.length - a.length);
}

/** Is `text` (one insert) an exact retype of a remembered contribution? */
export function isReversion(list: ReadonlyArray<string>, text: string): boolean {
  const norm = normalizeForMatch(text);
  if (norm.trim().length < MIN_REVERSION_LENGTH) return false;
  return list.some((c) => c.includes(norm.trim()));
}

/**
 * Slow-retype detection: does the trailing end of an accumulated run of typed
 * text reproduce a remembered contribution? Returns how many trailing
 * characters to re-stamp, or 0. Longest match wins (the list is sorted
 * longest-first), so a fully retyped sentence re-marks in full.
 */
export function trailingReversionLength(list: ReadonlyArray<string>, runText: string): number {
  const norm = normalizeForMatch(runText).trim();
  if (norm.length < MIN_REVERSION_LENGTH) return 0;
  for (const c of list) {
    if (norm.endsWith(c) && c.length >= MIN_REVERSION_LENGTH) return c.length;
  }
  return 0;
}

// ── Internal clipboard ("move") ─────────────────────────────────────────
//
// Moving a paragraph is ordinary writing and must not read as importing one.
// A MoveBuffer remembers text recently cut or copied *from this document*,
// with the origins it carried, so a paste of it can restore those origins.
//
// The window is deliberately short: it covers the real interaction (cut,
// scroll, paste) and little else. A longer window would start absorbing
// genuine outside pastes that happen to resemble deleted text.

export const MOVE_TTL_MS = 30_000;
export const MOVE_BUFFER_MAX = 8;
/** Below this length, matching is coincidence-prone and not worth it. */
export const MIN_MOVE_LENGTH = 12;

interface MoveEntry<O extends string> {
  norm: string;
  origins: OriginRun<O>[];
  at: number;
}

export class MoveBuffer<O extends string = string> {
  private entries: MoveEntry<O>[] = [];
  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Record text that left (or was copied from) the document. */
  remember(text: string, origins: OriginRun<O>[]): void {
    const norm = normalizeForMatch(text).trim();
    if (norm.length < MIN_MOVE_LENGTH) return;
    const dupe = this.entries.findIndex((c) => c.norm === norm);
    if (dupe >= 0) this.entries.splice(dupe, 1);
    this.entries.push({ norm, origins, at: this.now() });
    while (this.entries.length > MOVE_BUFFER_MAX) this.entries.shift();
  }

  /** Origins for `text` if it was recently cut/copied from this document. */
  lookup(text: string): OriginRun<O>[] | null {
    const norm = normalizeForMatch(text).trim();
    if (norm.length < MIN_MOVE_LENGTH) return null;
    const now = this.now();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const c = this.entries[i]!;
      if (now - c.at > MOVE_TTL_MS) continue;
      if (c.norm === norm) return c.origins;
    }
    return null;
  }
}

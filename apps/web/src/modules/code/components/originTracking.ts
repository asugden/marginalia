// CodeMirror extension that records where each cell's text came from.
//
// The same model as the writing tool's Tiptap tracker, using the same shared
// rules from @marginalia/provenance (move buffer, reversion index, run
// splicing) so an improvement there applies here:
//
//   typing                 → human
//   paste / drop           → pasted, unless it is
//     · text recently cut or copied inside this notebook → move (origins kept)
//     · text from a AI reply                           → llm
//   typing that reproduces a AI reply (≥ MIN_REVERSION_LENGTH, exact)
//                          → llm, for the part that matches
//   undo / redo re-inserting recently removed text → move (origins restored)
//
// Every edit becomes an event for the server's append-only log. Like the
// writing tool, this file is a live best guess; the render an instructor
// sees is recomputed from the log at submission (worker render.ts).
//
// The one deliberate difference from the Tiptap tracker: a slow retype of
// AI chat text is logged as a delete of the typed span followed by an
// llm_insert of the same text, so replay re-labels the span rather than
// inserting it a second time.

import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { Extension, Transaction } from "@codemirror/state";
import {
  encodeRuns,
  expandRuns,
  isReversion,
  MIN_REVERSION_LENGTH,
  MoveBuffer,
  normalizeForMatch,
  sliceRuns,
  spliceRuns,
  trailingReversionLength,
  type Origin,
  type OriginRun,
} from "@marginalia/provenance";
import type { OutboundCodeEvent } from "../api.js";

export type TrackedCellEvent = Omit<OutboundCodeEvent, "clientSeq">;

/** Shared by every cell in one notebook. */
export interface TrackingContext {
  /** One buffer for the whole notebook, so moving code between cells keeps
   *  its origins. */
  moves: MoveBuffer<Origin>;
  /** Reversion index of AI chat text (lines and code blocks). */
  chatContributions: string[];
  /** Normalized full AI replies, for "was this paste from the AI chat?". */
  chatReplies: string[];
  emit: (events: TrackedCellEvent[]) => void;
  onRuns: (cellId: string, runs: OriginRun[]) => void;
}

/**
 * Register a AI reply. Lines already present in the notebook are skipped,
 * so an AI reply quoting the student's own code back to them never turns that
 * code into "AI" when the student next edits it.
 */
export function noteChatReply(ctx: TrackingContext, reply: string, notebookText: string): void {
  const norm = (s: string) => normalizeForMatch(s).trim();
  const existing = new Set(notebookText.split("\n").map(norm).filter(Boolean));
  ctx.chatReplies.push(norm(reply));
  const push = (text: string) => {
    const n = norm(text);
    if (n.length < MIN_REVERSION_LENGTH || existing.has(n) || ctx.chatContributions.includes(n)) return;
    ctx.chatContributions.push(n);
  };
  for (const line of reply.split("\n")) push(line);
  for (const m of reply.matchAll(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g)) push(m[1] ?? "");
  ctx.chatContributions.sort((a, b) => b.length - a.length);
}

function isFromChat(ctx: TrackingContext, text: string): boolean {
  const n = normalizeForMatch(text).trim();
  return n.length >= MIN_REVERSION_LENGTH && ctx.chatReplies.some((r) => r.includes(n));
}

function totalLength(runs: OriginRun[]): number {
  return runs.reduce((s, r) => s + r.length, 0);
}

export function originTracking(
  cellId: string,
  initialRuns: OriginRun[] | undefined,
  initialLength: number,
  ctx: TrackingContext,
): Extension {
  // Runs that don't cover the loaded text (an older notebook, a dropped save)
  // start as human: the unknown is reported as the student's, never as an
  // import.
  let runs: OriginRun[] =
    initialRuns && totalLength(initialRuns) === initialLength
      ? initialRuns.map((r) => ({ ...r }))
      : initialLength > 0
        ? [{ origin: "human", length: initialLength }]
        : [];
  // Consecutive typed text, for slow-retype detection (see the file header).
  let typedRun: { text: string; from: number; to: number } | null = null;

  const rememberSelection = (view: EditorView) => {
    const sel = view.state.selection.main;
    if (sel.empty) return;
    ctx.moves.remember(view.state.sliceDoc(sel.from, sel.to), sliceRuns(runs, sel.from, sel.to));
  };

  const classify = (tr: Transaction, text: string) => {
    const paste = tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop");
    const history = tr.isUserEvent("undo") || tr.isUserEvent("redo");
    if (paste || history) {
      const restored = ctx.moves.lookup(text);
      if (restored) {
        return {
          kind: "move" as const,
          origin: null,
          inserted: encodeRuns(expandRuns(restored, text.length)),
          restored,
        };
      }
    }
    if (paste) {
      const origin: Origin = isFromChat(ctx, text) ? "llm" : "pasted";
      return {
        kind: origin === "llm" ? ("llm_insert" as const) : ("paste" as const),
        origin,
        inserted: [{ origin, length: text.length }],
      };
    }
    const origin: Origin = isReversion(ctx.chatContributions, text) ? "llm" : "human";
    return { kind: "insert" as const, origin, inserted: [{ origin, length: text.length }] };
  };

  const onUpdate = (u: ViewUpdate) => {
    if (!u.docChanged) return;
    const events: TrackedCellEvent[] = [];
    for (const tr of u.transactions) {
      if (!tr.docChanged) continue;
      const before = tr.startState.doc;
      let shift = 0;
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, insertedText) => {
        const at = fromA + shift;
        const removedLen = toA - fromA;
        if (removedLen > 0) {
          const removed = before.sliceString(fromA, toA);
          const removedRuns = sliceRuns(runs, at, at + removedLen);
          events.push({ cellId, kind: "delete", offset: at, length: removedLen, text: removed, origin: null });
          runs = spliceRuns(runs, at, removedLen, []);
          // A delete may be the first half of a move (cut, then paste).
          ctx.moves.remember(removed, removedRuns);
          typedRun = null;
        }
        const text = insertedText.toString();
        if (text.length > 0) {
          const c = classify(tr, text);
          events.push({
            cellId,
            kind: c.kind,
            offset: at,
            length: text.length,
            text,
            origin: c.origin,
            ...("restored" in c && c.restored ? { restoredOrigins: c.restored } : {}),
          });
          runs = spliceRuns(runs, at, 0, c.inserted);

          if (c.kind === "insert" && c.origin === "human") {
            typedRun =
              typedRun && typedRun.to === at
                ? { text: typedRun.text + text, from: typedRun.from, to: at + text.length }
                : { text, from: at, to: at + text.length };
            // No contribution is longer than the longest one, so older typed
            // characters can be dropped from the window.
            const cap = ctx.chatContributions[0]?.length ?? 0;
            if (typedRun.text.length > cap + 64) {
              const drop = typedRun.text.length - (cap + 64);
              typedRun = { text: typedRun.text.slice(drop), from: typedRun.from + drop, to: typedRun.to };
            }
            const match = trailingReversionLength(ctx.chatContributions, typedRun.text);
            if (match > 0) {
              // Re-label the matched tail as llm: remove it, then re-insert
              // the same text as an llm_insert, so replay stays in step.
              const from = Math.max(typedRun.from, typedRun.to - match);
              const len = typedRun.to - from;
              const doc = tr.state.doc;
              const same = doc.sliceString(from, typedRun.to);
              events.push({ cellId, kind: "delete", offset: from, length: len, text: same, origin: null });
              events.push({ cellId, kind: "llm_insert", offset: from, length: len, text: same, origin: "llm" });
              runs = spliceRuns(runs, from, len, [{ origin: "llm", length: len }]);
              typedRun = null;
            }
          } else {
            typedRun = null;
          }
        }
        shift += text.length - removedLen;
      });
    }
    if (events.length) {
      ctx.emit(events);
      ctx.onRuns(cellId, runs);
    }
  };

  return [
    EditorView.updateListener.of(onUpdate),
    EditorView.domEventHandlers({
      copy: (_e, view) => {
        rememberSelection(view);
        return false;
      },
      cut: (_e, view) => {
        rememberSelection(view);
        return false;
      },
    }),
  ];
}

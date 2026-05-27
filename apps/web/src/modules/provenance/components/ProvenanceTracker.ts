// Tiptap extension that:
//   1. Stamps every inserted character with an `origin` mark (default human).
//   2. Catches paste events and marks the inserted text as `pasted`.
//   3. Captures insert / delete / paste events into a callback so the
//      EditorPage can buffer + POST them to the worker.
//
// The trick: ProseMirror gives us a clean stream of transactions and the
// transform that produced each one. We walk the transform's ReplaceSteps
// to derive (offset, length, text) for each individual edit.
//
// We deliberately do NOT mutate text in this extension — we only attach
// marks via an appendTransaction hook. That keeps ProseMirror's own undo /
// collab logic untouched.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep, ReplaceAroundStep } from "@tiptap/pm/transform";
import type { Origin } from "./OriginMark.js";

export type TrackedEventKind = "insert" | "delete" | "paste";

export interface TrackedEvent {
  kind: TrackedEventKind;
  /** ProseMirror position at the start of the change. */
  offset: number;
  /** Chars inserted (insert/paste) or removed (delete). */
  length: number;
  /** Inserted text for insert/paste; removed text for delete. */
  text: string;
  origin?: Origin;
  /** Per-keystroke gap timings (insert only). ms between adjacent keystrokes. */
  timingGapsMs?: number[];
}

interface NextOpHint {
  origin: Origin;
  kind: TrackedEventKind;
}

const pluginKey = new PluginKey<NextOpHint | null>("provenance-tracker");

export interface ProvenanceTrackerOptions {
  onEvents: (events: TrackedEvent[]) => void;
}

interface KeystrokeWindow {
  startedAt: number;
  lastAt: number;
  gaps: number[];
}

export const ProvenanceTracker = Extension.create<ProvenanceTrackerOptions>({
  name: "provenanceTracker",

  addOptions() {
    return { onEvents: () => undefined };
  },

  addProseMirrorPlugins() {
    const { onEvents } = this.options;

    // Tracks the timing of the current keystroke run. Reset whenever we
    // flush an insert event so we don't keep cumulating across bursts.
    let keystroke: KeystrokeWindow | null = null;

    // Tracks the inputType of the most recent beforeinput event so we can
    // distinguish a normal type from, e.g., a paste. Slice 2 only needs
    // the paste signal; later slices will use insertReplacementText to
    // detect Grammarly.
    let lastInputType: string | null = null;

    return [
      new Plugin<NextOpHint | null>({
        key: pluginKey,

        state: {
          init: () => null,
          // The transaction may carry a "next-op hint" set by handlePaste
          // before the paste's own transaction runs. Read it from the tr's
          // meta and store it so appendTransaction can find it.
          apply(tr, value) {
            const meta = tr.getMeta(pluginKey) as NextOpHint | null | undefined;
            if (meta !== undefined) return meta;
            return value;
          },
        },

        props: {
          handleDOMEvents: {
            beforeinput: (_view, ev) => {
              const e = ev as InputEvent;
              lastInputType = e.inputType ?? null;
              // Track per-keystroke timing for insertText only — paste /
              // replacement etc. aren't keystrokes.
              if (e.inputType === "insertText") {
                const now = performance.now();
                if (!keystroke) {
                  keystroke = { startedAt: now, lastAt: now, gaps: [] };
                } else {
                  keystroke.gaps.push(Math.round(now - keystroke.lastAt));
                  keystroke.lastAt = now;
                }
              } else {
                // Any non-typing input flushes the keystroke window.
                keystroke = null;
              }
              return false;
            },
          },

          handlePaste: (view, _event, _slice) => {
            // Stash a hint that the *next* transaction is a paste. We don't
            // intercept the paste here; let ProseMirror insert the slice
            // and tag it on the way out.
            view.dispatch(
              view.state.tr.setMeta(pluginKey, {
                origin: "pasted" as const,
                kind: "paste" as const,
              }),
            );
            return false;
          },
        },

        // Tag inserted text with the origin mark, and emit events.
        // appendTransaction runs after the user's transaction is applied
        // and lets us add a follow-up transaction with the mark.
        appendTransaction: (transactions, _oldState, newState) => {
          const userTrs = transactions.filter((t) => t.docChanged);
          if (userTrs.length === 0) return null;

          const hint = pluginKey.getState(newState);
          // Clear the hint so the *next* transaction doesn't reuse it.
          // We do that by setting meta to null on our own appended tr below.

          const events: TrackedEvent[] = [];
          let markTr = newState.tr;
          let didMark = false;
          const originMarkType = newState.schema.marks.origin;

          for (const tr of userTrs) {
            for (let i = 0; i < tr.steps.length; i++) {
              const step = tr.steps[i]!;
              if (
                !(step instanceof ReplaceStep) &&
                !(step instanceof ReplaceAroundStep)
              ) {
                continue;
              }
              // step.from / step.to are positions in the doc *before* this
              // step was applied; map through the rest of the transaction
              // (and any later transactions) to find where the inserted
              // text now lives in newState.doc.
              const mapping = tr.mapping.slice(i);
              const insertedFrom = mapping.map(step.from, -1);
              const sliceSize = step.slice.size;
              const insertedTo = insertedFrom + sliceSize;

              const removedLen = step.to - step.from;
              const insertedText = sliceSize > 0
                ? newState.doc.textBetween(insertedFrom, insertedTo, "\n", "\n")
                : "";

              if (removedLen > 0) {
                // We can't easily recover the *exact* removed text after the
                // fact; use the step's slice openness only matters for
                // structure. Best we can do is report length; slice-replay
                // tools will read the prior doc state.
                events.push({
                  kind: "delete",
                  offset: step.from,
                  length: removedLen,
                  text: "",
                });
              }

              if (sliceSize > 0) {
                const isPaste = hint?.kind === "paste";
                const origin: Origin = isPaste ? "pasted" : "human";

                if (originMarkType) {
                  markTr = markTr.addMark(
                    insertedFrom,
                    insertedTo,
                    originMarkType.create({
                      origin,
                      sourceMessageId: null,
                    }),
                  );
                  didMark = true;
                }

                const event: TrackedEvent = {
                  kind: isPaste ? "paste" : "insert",
                  offset: insertedFrom,
                  length: sliceSize,
                  text: insertedText,
                  origin,
                };
                if (!isPaste && keystroke && keystroke.gaps.length > 0) {
                  event.timingGapsMs = keystroke.gaps.slice();
                }
                events.push(event);
              }
            }
          }

          // Reset the keystroke window once we've consumed it.
          keystroke = null;
          lastInputType = lastInputType; // silence unused-var if linted

          if (events.length > 0) onEvents(events);

          if (didMark) {
            // Clear the paste hint as part of our appended transaction so
            // it doesn't bleed into the next user transaction.
            markTr.setMeta(pluginKey, null);
            // Don't add to history — this is a derived mark application,
            // not user-visible edit history.
            markTr.setMeta("addToHistory", false);
            return markTr;
          }
          if (hint) {
            // Make sure we clear a stale hint even when nothing else changed.
            return newState.tr.setMeta(pluginKey, null).setMeta("addToHistory", false);
          }
          return null;
        },
      }),
    ];
  },
});

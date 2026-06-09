// Tiptap extension that:
//   1. Stamps every inserted character with an `origin` mark (default human).
//   2. Catches paste events and marks the inserted text as `pasted`.
//   3. Exposes an `insertLlmText` command that inserts text from a chat
//      message at the current selection, marked `origin: "llm"` and linked
//      to the source message via `sourceMessageId` (slice 4).
//   4. Captures insert / delete / paste / llm_insert / replace events into a
//      callback so EditorPage can buffer + POST them to the worker.
//   5. (slice 7) Flags browser spellcheck / autocorrect / Grammarly word
//      replacements (inputType "insertReplacementText") as origin="edited"
//      via a `replace` event — kept distinct from paste so autocorrect isn't
//      lumped in with clipboard content.
//   6. (slice 7) Re-stamps re-typed text as origin="llm" when it exactly
//      matches a remembered LLM contribution >= MIN_REVERSION_LENGTH chars,
//      so suggested wording isn't laundered into "human" by retyping it.
//
// The trick: ProseMirror gives us a clean stream of transactions and the
// transform that produced each one. We walk the transform's ReplaceSteps
// to derive (offset, length, text) for each individual edit. A short-lived
// "next-op hint" stashed on the upcoming transaction tells appendTransaction
// what origin to stamp (paste vs llm_insert vs the default human).
//
// We deliberately do NOT mutate text in appendTransaction — we only attach
// marks via a follow-up transaction. That keeps ProseMirror's undo / collab
// logic untouched. The `insertLlmText` command DOES mutate; that's a normal
// user-initiated change.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReplaceStep, ReplaceAroundStep } from "@tiptap/pm/transform";
import type { Origin } from "./OriginMark.js";

export type TrackedEventKind =
  | "insert"
  | "delete"
  | "paste"
  | "llm_insert"
  | "replace";

// Reversion: when a student re-types text that exactly matches a chunk of a
// past LLM contribution this long (or longer), we flip the typed run's origin
// back to "llm" so suggested wording can't be laundered into "human" by hand.
const MIN_REVERSION_LENGTH = 12;

export interface TrackedEvent {
  kind: TrackedEventKind;
  /** ProseMirror position at the start of the change. */
  offset: number;
  /** Chars inserted (insert/paste/llm_insert) or removed (delete). */
  length: number;
  /** Inserted text for insert/paste/llm_insert; removed text for delete. */
  text: string;
  origin?: Origin;
  sourceMessageId?: string;
  /** Per-keystroke gap timings (insert only). ms between adjacent keystrokes. */
  timingGapsMs?: number[];
}

interface NextOpHint {
  origin: Origin;
  kind: TrackedEventKind;
  sourceMessageId?: string;
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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    provenanceTracker: {
      /**
       * Insert text from a chat message at the current selection. Stamps
       * the inserted range with origin="llm" + sourceMessageId. Replaces
       * any non-empty selection (parity with normal typing).
       */
      insertLlmText: (args: { text: string; sourceMessageId: string }) => ReturnType;
      /**
       * Remember a chunk of LLM-contributed text for the reversion index so
       * that later re-typing of it gets re-stamped origin="llm". Called by
       * `insertLlmText` itself, and on load to rehydrate from existing
       * origin="llm" marks. Does not change the document.
       */
      noteLlmContribution: (text: string) => ReturnType;
      /**
       * Scan the current document for runs marked origin="llm" and seed the
       * reversion index from them, so re-typing previously-suggested text is
       * caught even after a reload (the in-memory index is otherwise empty on
       * a fresh load). Idempotent.
       */
      rehydrateLlmContributions: () => ReturnType;
    };
  }
}

/** Normalize for reversion matching: collapse runs of whitespace to a single
 *  space so re-typed text that differs only in spacing still matches. */
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, " ");
}

/** Add a contribution to the reversion index (normalized, deduped,
 *  longest-first), if it clears the minimum length. */
function rememberContribution(list: string[], text: string): void {
  const norm = normalizeForMatch(text).trim();
  if (norm.length < MIN_REVERSION_LENGTH) return;
  if (list.includes(norm)) return;
  list.push(norm);
  list.sort((a, b) => b.length - a.length);
}

interface ProvenanceTrackerStorage {
  /** Normalized LLM contributions, longest-first, for reversion matching. */
  llmContributions: string[];
}

export const ProvenanceTracker = Extension.create<
  ProvenanceTrackerOptions,
  ProvenanceTrackerStorage
>({
  name: "provenanceTracker",

  addOptions() {
    return { onEvents: () => undefined };
  },

  addStorage() {
    return { llmContributions: [] };
  },

  onCreate() {
    // Seed the reversion index from any LLM-marked text already in the loaded
    // document so retyping suggested wording is caught after a reload too.
    this.editor.commands.rehydrateLlmContributions();
  },

  addCommands() {
    return {
      noteLlmContribution:
        (text) =>
        () => {
          rememberContribution(this.storage.llmContributions, text);
          return true;
        },
      rehydrateLlmContributions:
        () =>
        ({ state }) => {
          const originType = state.schema.marks.origin;
          if (!originType) return true;
          const list = this.storage.llmContributions;
          // Walk text nodes; accumulate contiguous origin="llm" runs and
          // remember each as one contribution (a run = one insert/paste of
          // suggested text). A boundary or non-llm text flushes the run.
          let run = "";
          const flush = () => {
            if (run) rememberContribution(list, run);
            run = "";
          };
          state.doc.descendants((node) => {
            if (!node.isText) {
              flush();
              return true;
            }
            const isLlm = node.marks.some(
              (m) => m.type === originType && m.attrs.origin === "llm",
            );
            if (isLlm) run += node.text ?? "";
            else flush();
            return true;
          });
          flush();
          return true;
        },
      insertLlmText:
        ({ text, sourceMessageId }) =>
        ({ chain, state, commands }) => {
          if (!text) return false;
          commands.noteLlmContribution(text);
          // Smart spacing: if the cursor is right after a non-whitespace
          // character (i.e. we'd glue onto a word), prepend a space.
          const { from } = state.selection;
          let toInsert = text;
          const charBefore = from > 0 ? state.doc.textBetween(from - 1, from, "\n", "\n") : "";
          if (charBefore && /\S/.test(charBefore) && !/^\s/.test(text)) {
            toInsert = " " + text;
          }
          // Stash the hint so appendTransaction marks the inserted range as
          // llm with the right sourceMessageId, and emits an llm_insert event.
          return chain()
            .focus()
            .command(({ tr, dispatch }) => {
              if (dispatch) {
                tr.setMeta(pluginKey, {
                  origin: "llm" as const,
                  kind: "llm_insert" as const,
                  sourceMessageId,
                });
              }
              return true;
            })
            .insertContent(toInsert)
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    const { onEvents } = this.options;
    // Same array instance the command mutates — read live during replay so a
    // contribution noted earlier this session is matchable on later retyping.
    const llmContributions = this.storage.llmContributions;

    // Tracks the timing of the current keystroke run. Reset whenever we
    // flush an insert event so we don't keep cumulating across bursts.
    let keystroke: KeystrokeWindow | null = null;

    // Is this typed text an exact retype of a remembered LLM contribution?
    // Match on normalized whitespace; require MIN_REVERSION_LENGTH so short
    // common words ("the model") don't get swept up.
    //
    // TODO(reversion-slow-typing): this matches at event granularity, so it
    // catches bulk re-insertion (paste→edit, IME, autocomplete) but NOT a
    // student retyping LLM text slowly character-by-character — each 1-char
    // insert falls under MIN_REVERSION_LENGTH and never matches. Slow manual
    // retyping is a plausibly common laundering path; revisit with a rolling
    // window over recent human inserts (accumulate adjacent single-char
    // inserts, match the trailing buffer against the index, restamp the run
    // retroactively). Skipped for v1.
    const isLlmReversion = (text: string): boolean => {
      const norm = normalizeForMatch(text);
      if (norm.trim().length < MIN_REVERSION_LENGTH) return false;
      return llmContributions.some((c) => c.includes(norm.trim()));
    };

    return [
      new Plugin<NextOpHint | null>({
        key: pluginKey,

        state: {
          init: () => null,
          // The transaction may carry a "next-op hint" set by handlePaste or
          // the insertLlmText command. Read it from the tr's meta and store
          // it so appendTransaction can find it.
          apply(tr, value) {
            const meta = tr.getMeta(pluginKey) as NextOpHint | null | undefined;
            if (meta !== undefined) return meta;
            return value;
          },
        },

        props: {
          handleDOMEvents: {
            beforeinput: (view, ev) => {
              const e = ev as InputEvent;
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
                if (e.inputType === "insertReplacementText") {
                  // Spellcheck / autocorrect / Grammarly word swap. Stash a
                  // hint so the resulting transaction is tagged origin="edited"
                  // (a `replace` event) rather than a plain human insert.
                  // Deliberately kept distinct from paste.
                  view.dispatch(
                    view.state.tr.setMeta(pluginKey, {
                      origin: "edited" as const,
                      kind: "replace" as const,
                    }),
                  );
                }
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
                events.push({
                  kind: "delete",
                  offset: step.from,
                  length: removedLen,
                  text: "",
                });
              }

              if (sliceSize > 0) {
                let kind: TrackedEventKind =
                  hint?.kind === "paste"
                    ? "paste"
                    : hint?.kind === "llm_insert"
                    ? "llm_insert"
                    : hint?.kind === "replace"
                    ? "replace"
                    : "insert";
                let origin: Origin =
                  kind === "paste"
                    ? "pasted"
                    : kind === "llm_insert"
                    ? "llm"
                    : kind === "replace"
                    ? "edited"
                    : "human";
                let sourceMessageId =
                  kind === "llm_insert" ? hint?.sourceMessageId ?? null : null;

                // Reversion: a plain human insert that exactly re-types a
                // remembered LLM contribution is re-stamped origin="llm" (and
                // logged as llm_insert) so suggested wording stays attributed.
                if (kind === "insert" && isLlmReversion(insertedText)) {
                  kind = "llm_insert";
                  origin = "llm";
                  sourceMessageId = null;
                }

                if (originMarkType) {
                  markTr = markTr.addMark(
                    insertedFrom,
                    insertedTo,
                    originMarkType.create({ origin, sourceMessageId }),
                  );
                  didMark = true;
                }

                const event: TrackedEvent = {
                  kind,
                  offset: insertedFrom,
                  length: sliceSize,
                  text: insertedText,
                  origin,
                };
                if (sourceMessageId) event.sourceMessageId = sourceMessageId;
                if (kind === "insert" && keystroke && keystroke.gaps.length > 0) {
                  event.timingGapsMs = keystroke.gaps.slice();
                }
                events.push(event);
              }
            }
          }

          // Reset the keystroke window once we've consumed it.
          keystroke = null;

          if (events.length > 0) onEvents(events);

          if (didMark) {
            // Clear the hint as part of our appended transaction so it
            // doesn't bleed into the next user transaction.
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

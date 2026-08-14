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
//   7. (slice 8) Records what a delete removed — the text and the origins it
//      carried — so the server can replay the log losslessly.
//   8. (slice 8) Recognises a paste of text recently cut or copied from this
//      same document as a `move`, restoring the origins it already had.
//      Rearranging your own paragraphs is writing, not importing.
//
// Note the division of labour with the server: this file assigns origins as a
// *live* best guess so the editor can repaint immediately, but the frozen
// render an instructor sees is recomputed from the event log at mint time
// (worker render.ts). Anything that must not be forgeable — retype detection,
// move verification — is derived there, not here.
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
import type { Node as PMNode, MarkType } from "@tiptap/pm/model";
import type { Origin } from "./OriginMark.js";

export type TrackedEventKind =
  | "insert"
  | "delete"
  | "paste"
  | "llm_insert"
  | "replace"
  // slice 8: a paste of text taken from this same document (cut+paste or
  // copy+paste). Carries the origins the text had at its source, so moving a
  // paragraph doesn't relabel it as imported.
  | "move";

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
  /**
   * Run-length-encoded origins of the removed range (delete only). Lets the
   * server replay losslessly and lets a later paste of this text restore the
   * origins it carried (slice 8 Part 3, "move"). Deleted text is retained
   * server-side but is never rendered to an instructor — see the module README.
   */
  removedOrigins?: OriginRun[];
  /**
   * Origins to restore for a `move` — the runs the text carried where it was
   * cut or copied from. The server re-derives this independently rather than
   * trusting it (see handlers `verifyMove`); we send it so the editor can
   * repaint immediately without waiting for a round trip.
   */
  restoredOrigins?: OriginRun[];
}

/** One run of identical origins, for compact transport of a removed range. */
export interface OriginRun {
  origin: Origin;
  length: number;
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

// ── Internal clipboard (slice 8 Part 3) ──────────────────────────────────
//
// Moving a paragraph is ordinary writing and must not read as importing one.
// We remember text recently cut or copied *from this document*, with the
// origins it carried, and restore those origins if it is pasted back.
//
// The window is deliberately short: it covers the real interaction (cut,
// scroll, paste) and little else. A longer window would start absorbing
// genuine outside pastes that happen to resemble deleted text.
const CLIP_TTL_MS = 30_000;
const CLIP_MAX = 8;
/** Below this length, matching is coincidence-prone and not worth it. */
const MIN_MOVE_LENGTH = 12;

interface ClipEntry {
  /** Whitespace-normalized, for tolerant matching. */
  norm: string;
  origins: OriginRun[];
  at: number;
}

/** Module-scoped so cut/copy handlers and appendTransaction share one buffer. */
const clipboard: ClipEntry[] = [];

function rememberCut(text: string, origins: OriginRun[]): void {
  const norm = normalizeForMatch(text).trim();
  if (norm.length < MIN_MOVE_LENGTH) return;
  const now = performance.now();
  // Replace any existing entry for the same text, then bound the buffer.
  const dupe = clipboard.findIndex((c) => c.norm === norm);
  if (dupe >= 0) clipboard.splice(dupe, 1);
  clipboard.push({ norm, origins, at: now });
  while (clipboard.length > CLIP_MAX) clipboard.shift();
}

/** Origins for `text` if it was recently cut/copied from this document. */
function lookupCut(text: string): OriginRun[] | null {
  const norm = normalizeForMatch(text).trim();
  if (norm.length < MIN_MOVE_LENGTH) return null;
  const now = performance.now();
  for (let i = clipboard.length - 1; i >= 0; i--) {
    const c = clipboard[i]!;
    if (now - c.at > CLIP_TTL_MS) continue;
    if (c.norm === norm) return c.origins;
  }
  return null;
}

/**
 * Read the per-character origins of [from, to) in `doc` as compact runs.
 * Used to record what a delete removed, so that (a) the server can replay
 * losslessly and (b) re-pasting the text can restore its original origins
 * instead of flattening it to "pasted".
 *
 * Walks text nodes only; the run lengths therefore line up with the same
 * `textBetween` projection used for the event's `text`.
 */
function originRunsIn(
  doc: PMNode,
  from: number,
  to: number,
  originMarkType: MarkType | undefined,
): OriginRun[] {
  const runs: OriginRun[] = [];
  const push = (origin: Origin, length: number) => {
    if (length <= 0) return;
    const last = runs[runs.length - 1];
    if (last && last.origin === origin) last.length += length;
    else runs.push({ origin, length });
  };
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    // Clip to the requested range — the first/last node may straddle it.
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.nodeSize, to);
    if (end <= start) return true;
    const mark = originMarkType
      ? node.marks.find((m) => m.type === originMarkType)
      : undefined;
    push((mark?.attrs.origin as Origin) ?? "human", end - start);
    return true;
  });
  return runs;
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

    // Rolling window for slow-retype laundering detection. Accumulates the text
    // and doc range of consecutive *human* inserts (typically one char each) so
    // that typing out remembered LLM wording by hand — which never triggers the
    // per-event reversion check, since each keystroke is under the min length —
    // is still caught once enough matching characters have accrued. Reset on any
    // non-adjacent or non-human edit.
    let humanRun: { text: string; from: number; to: number } | null = null;
    // Caret position at the end of the current "rewriting LLM text" run. While
    // an insert is contiguous with this (insertedFrom === llmEditRun), keep
    // stamping it as the yellow/laundering origin so a multi-keystroke rewrite
    // of LLM wording doesn't decay to "human" after the first character. Reset
    // by any non-contiguous or non-typing change.
    let llmEditRun: number | null = null;
    // Keep the buffer bounded: no remembered contribution is longer than the
    // longest LLM run, so once we exceed that we can drop the oldest chars.
    const maxRunLen = () =>
      llmContributions.reduce((n, c) => Math.max(n, c.length), 0);

    // Is this typed text an exact retype of a remembered LLM contribution?
    // Match on normalized whitespace; require MIN_REVERSION_LENGTH so short
    // common words ("the model") don't get swept up.
    //
    // This matches at event granularity, catching bulk re-insertion
    // (paste→edit, IME, autocomplete). Slow character-by-character retyping is
    // handled separately by the rolling `humanRun` window below.
    const isLlmReversion = (text: string): boolean => {
      const norm = normalizeForMatch(text);
      if (norm.trim().length < MIN_REVERSION_LENGTH) return false;
      return llmContributions.some((c) => c.includes(norm.trim()));
    };

    // Slow-retype detection: does the trailing end of the accumulated human run
    // reproduce a remembered LLM contribution? If so, return how many trailing
    // characters of the run to re-stamp as origin="llm". We match the longest
    // suffix (contributions are sorted longest-first) so a fully-retyped
    // sentence re-marks in full, and require MIN_REVERSION_LENGTH so incidental
    // short overlaps ("the model") don't trip it.
    const trailingLlmMatchLen = (runText: string): number => {
      const norm = normalizeForMatch(runText).trim();
      if (norm.length < MIN_REVERSION_LENGTH) return 0;
      for (const c of llmContributions) {
        // c is already normalized+trimmed. A retype "launders" when the run
        // ends with an LLM contribution (they typed up through the end of it).
        if (norm.endsWith(c) && c.length >= MIN_REVERSION_LENGTH) {
          return c.length;
        }
      }
      return 0;
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
            // Copy (not cut) removes nothing, so no delete event fires and the
            // buffer would never learn about it. Record the selection here so
            // duplicating your own sentence elsewhere in your own document is
            // recognised as internal too. A cut also fires this, harmlessly:
            // it records the same text the delete branch will record.
            copy: (view) => {
              const { from, to } = view.state.selection;
              if (to > from) {
                rememberCut(
                  view.state.doc.textBetween(from, to, "\n", "\n"),
                  originRunsIn(
                    view.state.doc,
                    from,
                    to,
                    view.state.schema.marks.origin,
                  ),
                );
              }
              return false;
            },
            cut: (view) => {
              const { from, to } = view.state.selection;
              if (to > from) {
                rememberCut(
                  view.state.doc.textBetween(from, to, "\n", "\n"),
                  originRunsIn(
                    view.state.doc,
                    from,
                    to,
                    view.state.schema.marks.origin,
                  ),
                );
              }
              return false;
            },
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
        appendTransaction: (transactions, oldState, newState) => {
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

              // Is this edit touching LLM-authored text? tr.docs[i] is the
              // document *before* step i, so step.from/step.to are valid coords
              // in it. Editing LLM wording — whether by (a) replacing a range
              // that contains LLM text, or (b) typing at a caret that sits
              // inside/against an LLM run — should read as "edited" (derived
              // from the model), never as fresh "human". This guards the direct
              // laundering path: select an LLM run and retype it in your own
              // words, one keystroke at a time.
              const preStepDoc = tr.docs[i] ?? oldState.doc;
              const hasLlmMark = (marks: readonly { type: unknown; attrs: { origin?: string } }[]) =>
                marks.some(
                  (m) => m.type === originMarkType && m.attrs.origin === "llm",
                );
              let editingLlm = false;
              if (originMarkType) {
                if (removedLen > 0) {
                  // (a) Replaced a range — does any of it carry the llm mark?
                  preStepDoc.nodesBetween(step.from, step.to, (node) => {
                    if (node.isText && hasLlmMark(node.marks)) editingLlm = true;
                    return !editingLlm;
                  });
                } else {
                  // (b) Pure insertion at a caret. Treat it as editing LLM only
                  // when the caret is *inside* an LLM run — i.e. the character
                  // right after it is llm (you're inserting into the middle or
                  // front of LLM text). Appending immediately AFTER an LLM run
                  // (only the char before is llm) is deliberately NOT treated as
                  // editing: writing a fresh sentence after LLM prose is your
                  // own. The llmEditRun continuation below handles keeping a
                  // multi-keystroke rewrite "edited" once one has started.
                  const $pos = preStepDoc.resolve(step.from);
                  const na = $pos.nodeAfter;
                  if (na && na.isText && hasLlmMark(na.marks)) editingLlm = true;
                }
              }

              if (removedLen > 0) {
                // Capture what was removed, and the origins it carried, from
                // the pre-step doc. The schema has always specified this
                // (migration 0010: "deleted text for delete"); until slice 8
                // the client sent "" and replay was lossy.
                const removedText = preStepDoc.textBetween(
                  step.from,
                  step.to,
                  "\n",
                  "\n",
                );
                const removedOrigins = originRunsIn(
                  preStepDoc,
                  step.from,
                  step.to,
                  originMarkType,
                );
                // Remember it briefly so an immediately-following paste of the
                // same text is recognised as a move rather than an import.
                rememberCut(removedText, removedOrigins);
                events.push({
                  kind: "delete",
                  offset: step.from,
                  length: removedLen,
                  text: removedText,
                  removedOrigins,
                });
                // A pure deletion breaks the contiguous typed/edited runs. (A
                // replace — removedLen>0 AND sliceSize>0 — is handled in the
                // insert branch below, which rebuilds the run.)
                if (sliceSize === 0) {
                  humanRun = null;
                  llmEditRun = null;
                }
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
                // True only for the "rewriting LLM text" path, so the run
                // tracker below can distinguish it from a genuine clipboard
                // paste (which also ends up origin="pasted").
                let isLlmEdit = false;
                // Set when this paste is text moved within this document; the
                // marking step below repaints it run-by-run instead of flat.
                let restoredOrigins: OriginRun[] | null = null;

                // Move: a paste of text recently cut or copied *from this
                // document*. Rearranging your own paragraphs is ordinary
                // writing, so the text keeps the origins it already had rather
                // than being relabelled as imported. Checked before the LLM
                // branches below so moving an LLM block preserves its "llm"
                // marks instead of being re-derived as a rewrite.
                if (kind === "paste") {
                  const restored = lookupCut(insertedText);
                  if (restored) {
                    kind = "move";
                    restoredOrigins = restored;
                    // Flat fallback for the event's own `origin` column; the
                    // per-run detail rides along in restoredOrigins.
                    origin = restored.length === 1 ? restored[0]!.origin : "human";
                  }
                }

                // Reversion: a plain insert that reproduces remembered LLM
                // wording verbatim (e.g. copy the reply out of chat and paste
                // it, bypassing "Insert at cursor"). It's still LLM-sourced
                // text, just unattributed — so it stays BLUE ("llm" = LLM
                // origin, known-or-unknown). Blue is the "this came from the
                // model" colour; only genuine *rewriting* (below) is treated as
                // the fishier yellow.
                if (kind === "insert" && isLlmReversion(insertedText)) {
                  kind = "llm_insert";
                  origin = "llm";
                  sourceMessageId = null;
                } else if (
                  kind === "insert" &&
                  (editingLlm ||
                    (llmEditRun !== null && insertedFrom === llmEditRun))
                ) {
                  // Typed over / into LLM-authored text, producing something
                  // that is NOT a verbatim reproduction (that's the blue
                  // reversion branch above). Rewriting model prose by hand is
                  // inherently fishy — the writer is reworking AI output while
                  // making it look typed — so it's YELLOW ("suspected"), not
                  // green "edited" (reserved for benign autocorrect/spellcheck)
                  // and not blue "llm" (a faithful reproduction). llmEditRun
                  // tracks the caret so the 2nd, 3rd, … keystrokes of a
                  // multi-char rewrite stay yellow instead of decaying to a
                  // fresh "human" run after the first character.
                  kind = "paste";
                  origin = "pasted";
                  isLlmEdit = true;
                }

                if (originMarkType) {
                  if (restoredOrigins) {
                    // Repaint the moved text run by run so a paragraph that
                    // mixed typed and LLM prose keeps that structure. Runs were
                    // measured on the source text; clamp to the inserted range
                    // in case the paste normalized whitespace slightly.
                    let at = insertedFrom;
                    for (const run of restoredOrigins) {
                      const end = Math.min(at + run.length, insertedTo);
                      if (end <= at) break;
                      markTr = markTr.addMark(
                        at,
                        end,
                        originMarkType.create({
                          origin: run.origin,
                          sourceMessageId: null,
                        }),
                      );
                      at = end;
                    }
                    // Any tail left over by a length mismatch keeps the
                    // conservative flat origin rather than going unmarked.
                    if (at < insertedTo) {
                      markTr = markTr.addMark(
                        at,
                        insertedTo,
                        originMarkType.create({ origin, sourceMessageId: null }),
                      );
                    }
                  } else {
                    markTr = markTr.addMark(
                      insertedFrom,
                      insertedTo,
                      originMarkType.create({ origin, sourceMessageId }),
                    );
                  }
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
                if (restoredOrigins) event.restoredOrigins = restoredOrigins;
                if (kind === "insert" && keystroke && keystroke.gaps.length > 0) {
                  event.timingGapsMs = keystroke.gaps.slice();
                }
                events.push(event);

                // Maintain the "rewriting LLM" continuation caret. Extend it
                // when this insert was part of an LLM rewrite so the next
                // contiguous keystroke stays yellow; clear it otherwise (a
                // genuine paste does NOT start a continuation run).
                llmEditRun = isLlmEdit ? insertedTo : null;

                // ── Slow-retype laundering detection ──────────────────────
                // Only plain human inserts feed the rolling buffer. Anything
                // else (paste, llm, edited, a reversion we already caught)
                // breaks the run.
                if (kind === "insert" && origin === "human") {
                  const contiguous =
                    humanRun !== null && insertedFrom === humanRun.to;
                  humanRun = contiguous
                    ? {
                        text: humanRun!.text + insertedText,
                        from: humanRun!.from,
                        to: insertedTo,
                      }
                    : { text: insertedText, from: insertedFrom, to: insertedTo };

                  // Bound the buffer so it can't grow without limit.
                  const cap = maxRunLen();
                  if (cap > 0 && humanRun.text.length > cap) {
                    const drop = humanRun.text.length - cap;
                    humanRun = {
                      text: humanRun.text.slice(drop),
                      from: humanRun.from + drop,
                      to: humanRun.to,
                    };
                  }

                  const matchLen = trailingLlmMatchLen(humanRun.text);
                  if (matchLen > 0 && originMarkType) {
                    // The student hand-retyped remembered LLM wording verbatim
                    // (char-by-char, under the per-event threshold). It's a
                    // faithful reproduction of model text, so it's BLUE ("llm" =
                    // LLM-sourced) — same as re-pasting it. (Genuine *rewriting*
                    // into different words is the yellow path above; this branch
                    // only fires on an exact match.) Re-mark by document
                    // position (exact); the match is a suffix of the raw run.
                    const reFrom = Math.max(humanRun.from, humanRun.to - matchLen);
                    markTr = markTr.addMark(
                      reFrom,
                      humanRun.to,
                      originMarkType.create({ origin: "llm", sourceMessageId: null }),
                    );
                    didMark = true;
                    events.push({
                      kind: "llm_insert",
                      offset: reFrom,
                      length: humanRun.to - reFrom,
                      text: newState.doc.textBetween(reFrom, humanRun.to, "\n", "\n"),
                      origin: "llm",
                    });
                    humanRun = null; // consumed; start fresh
                  }
                } else {
                  // Non-human insert breaks the contiguous human run.
                  humanRun = null;
                }
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

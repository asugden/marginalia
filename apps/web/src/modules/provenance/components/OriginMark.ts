// Tiptap mark that records the origin of each character: human, llm, pasted,
// or edited. Slice 2 used three origins; slice 7 adds "edited" for
// spellcheck/autocorrect/Grammarly word replacements (the browser's
// insertReplacementText path) and re-stamps "llm" on exact reversion.
//
// The mark renders as <span data-origin="..."> so coloring is pure CSS
// (see styles.css `.provenance-editor-surface [data-origin=...]`).

import { Mark, mergeAttributes } from "@tiptap/core";

export type Origin = "human" | "llm" | "pasted" | "edited";

export interface OriginAttrs {
  origin: Origin;
  /** Slice 4 (LLM insert) populates this; slice 2 leaves it null. */
  sourceMessageId: string | null;
}

export const OriginMark = Mark.create({
  name: "origin",

  // Allow the mark to apply to typed text without being merged away when an
  // adjacent character has no mark. inclusive=false means typing at the
  // boundary of a marked range starts fresh — exactly what we want when
  // a student types right after an LLM block.
  inclusive: false,

  // Tiptap treats marks with identical attrs as joinable; we want runs of the
  // same origin to merge into a single mark so the rendered DOM stays small.
  spanning: true,

  addAttributes() {
    return {
      origin: {
        default: "human" as Origin,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-origin") ?? "human",
        renderHTML: (attrs) => ({ "data-origin": attrs.origin }),
      },
      sourceMessageId: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-source-message-id") ?? null,
        renderHTML: (attrs) =>
          attrs.sourceMessageId
            ? { "data-source-message-id": attrs.sourceMessageId }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-origin]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

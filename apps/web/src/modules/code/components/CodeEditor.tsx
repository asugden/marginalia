// One cell's code editor: CodeMirror 6 with Python highlighting and nothing
// that writes code for the student.
//
// Deliberately absent: autocompletion (@codemirror/autocomplete is not
// installed, so the completion data lang-python registers stays inert),
// inline suggestions, auto-closing brackets, and the browser's own
// spellcheck/autocorrect. What's left is what a plain code editor does —
// highlighting, indentation, undo, bracket matching. Students type the code.
//
// The one thing that does appear is documentation: opening a library call's
// parentheses shows the parameters that library documents for itself (see
// docsPopup.ts). That's a reference the student reads, the same as running
// help() — it proposes nothing and can't write to the cell — so it doesn't
// cross the line the paragraph above draws.
//
// Colours come from the design tokens, so a branded deploy re-tints it.

import { useEffect, useRef } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState, Prec, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { OriginRun } from "@marginalia/provenance";

/** Mark every non-human run with its origin class (`code-origin--llm` …). The
 *  colours are the writing tool's status tokens, set in code.css. */
function originMarks(runs: OriginRun[], docLength: number): Extension {
  const builder = new RangeSetBuilder<Decoration>();
  let pos = 0;
  for (const r of runs) {
    const end = Math.min(pos + r.length, docLength);
    if (r.origin !== "human" && end > pos) {
      builder.add(pos, end, Decoration.mark({ class: `code-origin code-origin--${r.origin}` }));
    }
    pos += r.length;
    if (pos >= docLength) break;
  }
  return EditorView.decorations.of(builder.finish());
}

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--purple-ink)" },
  { tag: [t.string, t.special(t.string)], color: "var(--green-ink)" },
  { tag: [t.number, t.bool, t.null], color: "var(--amber-ink)" },
  { tag: t.comment, color: "var(--text-muted)", fontStyle: "italic" },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], color: "var(--blue-ink)" },
  { tag: t.self, color: "var(--salmon-ink)" },
]);

const theme = EditorView.theme({
  "&": { backgroundColor: "transparent", fontSize: "0.9rem" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.55" },
  ".cm-content": { padding: "0.55rem 0", caretColor: "var(--ink)" },
  ".cm-line": { padding: "0 0.75rem" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--accent-wash-2)",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--accent-wash)", outline: "none" },
  ".cm-placeholder": { color: "var(--text-faint)" },
});

export interface CodeEditorProps {
  initialValue: string;
  language?: "python" | "markdown";
  readOnly?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  onChange?: (value: string) => void;
  /** Shift+Enter. */
  onRunAdvance?: () => void;
  /** Ctrl/Cmd+Enter. */
  onRunInPlace?: () => void;
  onFocus?: () => void;
  onEscape?: () => void;
  /** Receives the view on mount and null on unmount, so the notebook can
   *  move focus between cells. */
  onView?: (view: EditorView | null) => void;
  /** Extra behaviour, e.g. origin tracking. Read once, at mount. */
  extensions?: Extension[];
  /** Origin runs to paint (review views). Read once, at mount. */
  marks?: OriginRun[];
}

export function CodeEditor({
  initialValue,
  language = "python",
  readOnly = false,
  placeholder,
  autoFocus = false,
  onChange,
  onRunAdvance,
  onRunInPlace,
  onFocus,
  onEscape,
  onView,
  extensions,
  marks,
}: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  // Handlers change every render; the editor is built once. Read through refs.
  const handlers = useRef({ onChange, onRunAdvance, onRunInPlace, onFocus, onEscape });
  handlers.current = { onChange, onRunAdvance, onRunInPlace, onFocus, onEscape };
  const viewCb = useRef(onView);
  viewCb.current = onView;

  useEffect(() => {
    if (!host.current) return;
    const runKeys = Prec.highest(
      keymap.of([
        { key: "Shift-Enter", run: () => (handlers.current.onRunAdvance?.(), true) },
        { key: "Mod-Enter", run: () => (handlers.current.onRunInPlace?.(), true) },
        { key: "Escape", run: () => (handlers.current.onEscape?.(), !!handlers.current.onEscape) },
      ]),
    );
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          runKeys,
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          syntaxHighlighting(highlight),
          ...(language === "python" ? [python()] : []),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            spellcheck: "false",
            autocorrect: "off",
            autocapitalize: "off",
            "aria-label": language === "python" ? "Code cell" : "Text cell",
          }),
          ...(placeholder ? [cmPlaceholder(placeholder)] : []),
          ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
          ...(extensions ?? []),
          ...(marks ? [originMarks(marks, initialValue.length)] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange?.(u.state.doc.toString());
            if (u.focusChanged && u.view.hasFocus) handlers.current.onFocus?.();
          }),
          theme,
        ],
      }),
    });
    if (autoFocus) view.focus();
    viewCb.current?.(view);
    return () => {
      viewCb.current?.(null);
      view.destroy();
    };
    // Built once per mount; the parent remounts (via key) to replace content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="code-editor" ref={host} />;
}

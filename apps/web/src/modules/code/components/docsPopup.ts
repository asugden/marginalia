// Automatic documentation lookup: type `(` after a library call and the
// parameters it accepts appear above the cursor, with the one you're currently
// filling in highlighted.
//
// This is a reference popup, not autocompletion. It never proposes, inserts,
// or completes anything — the student types every character, and nothing here
// can reach the document. What it shows is what an imported library already
// says about itself: the same `inspect.signature` a student would get from
// `help()`, surfaced at the moment the question arises.
//
// Shaped for beginners, which drives three choices:
//   - No type annotations. A pandas signature's real hints are unions that run
//     for lines; the names and defaults carry the useful information.
//   - Required parameters read differently from optional ones, because that is
//     the distinction a student actually needs at the call site.
//   - The list is windowed (see windowParams) rather than dumping forty
//     keyword arguments. What's dropped is counted, never silently hidden.
//
// Two limits, both cheap in practice:
//   - Only libraries *already imported by a run cell* resolve. The lookup
//     evaluates the name in the live namespace, so `np.linspace` is unknown
//     until a cell has run `import numpy as np`.
//   - Nothing resolves while Python is busy, because Pyodide is
//     single-threaded and a popup must never make a student wait.
// In both cases the popup simply doesn't appear. It is never an error.

import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, showTooltip, type Tooltip } from "@codemirror/view";
import type { ParamInfo, SignatureInfo } from "../kernel/protocol.js";

/** Resolves a dotted name against the running kernel. */
export type SignatureLookup = (name: string) => Promise<SignatureInfo | null>;

interface OpenCall {
  info: SignatureInfo;
  /** Document position just after the `(` that opened this call. */
  pos: number;
}

const setSignature = StateEffect.define<OpenCall | null>();

/** The dotted name immediately left of `pos`, e.g. `np.linspace` in
 *  `x = np.linspace(`. Returns null for anything that isn't a plain name,
 *  which is what keeps `df.groupby("a").mean(` out — an expression's type
 *  isn't knowable without running it. */
function nameBefore(text: string, pos: number): string | null {
  let i = pos;
  while (i > 0 && /[A-Za-z0-9_.]/.test(text[i - 1] ?? "")) i--;
  const name = text.slice(i, pos);
  if (!name || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name)) return null;
  // A name directly preceded by `.`, `)` or `]` hangs off an expression we
  // can't resolve; and `def foo(` is the student's own function, not a
  // library's.
  const prev = text.slice(0, i).trimEnd();
  if (/[.)\]]$/.test(prev)) return null;
  if (/\b(def|class)\s*$/.test(prev)) return null;
  return name;
}

/** True once the cursor has left the argument list the popup was opened for. */
function stillInsideCall(text: string, open: number, cursor: number): boolean {
  if (cursor <= open) return false;
  let depth = 1;
  for (let i = open; i < cursor && i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return false;
    }
  }
  return depth > 0;
}

/** Which argument the cursor sits in: commas at the call's own depth, ignoring
 *  those nested inside brackets or string literals. */
function activeIndex(text: string, open: number, cursor: number): number {
  let depth = 0;
  let index = 0;
  let quote: string | null = null;
  for (let i = open; i < cursor && i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) index++;
  }
  return index;
}

/** A keyword argument pins the active parameter by NAME, which is what a
 *  student typing `read_csv(sep=` expects to see highlighted. */
function activeName(text: string, open: number, cursor: number): string | null {
  const seg = text.slice(open, Math.max(open, cursor));
  const lastComma = seg.lastIndexOf(",") + 1;
  const m = /([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/.exec(seg.slice(lastComma));
  return m ? m[1]! : null;
}

/**
 * Which parameters to show. Beginners drown in pandas' forty-odd keyword
 * arguments, so the list is windowed: always every required parameter, always
 * a few past wherever the cursor is, and never fewer than six. Whatever that
 * leaves out is reported as a count, never silently dropped.
 */
function windowParams(
  params: ParamInfo[],
  active: number,
): { shown: ParamInfo[]; hidden: number } {
  const required = params.filter((p) => p.required).length;
  const limit = Math.max(required, active + 3, 6);
  if (params.length <= limit) return { shown: params, hidden: 0 };
  return { shown: params.slice(0, limit), hidden: params.length - limit };
}

function render(info: SignatureInfo, active: number, activeKw: string | null): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "code-docs";

  const sig = document.createElement("div");
  sig.className = "code-docs__sig";
  const name = document.createElement("span");
  name.className = "code-docs__name";
  name.textContent = info.name;
  sig.append(name, document.createTextNode("("));

  const { shown, hidden } = windowParams(info.params, active);
  // A keyword argument names its target outright; otherwise position decides.
  const activeIdx = activeKw
    ? info.params.findIndex((p) => p.name === activeKw)
    : active;

  shown.forEach((p, i) => {
    if (i > 0) sig.append(document.createTextNode(", "));
    const el = document.createElement("span");
    el.className =
      "code-docs__param" +
      (p.required ? " code-docs__param--required" : " code-docs__param--optional") +
      (i === activeIdx ? " code-docs__param--active" : "");
    el.textContent = p.name;
    sig.append(el);
    // `== null` on purpose: Python's None arrives as undefined through
    // Pyodide's dict conversion, and a required parameter must never render
    // "=undefined".
    if (!p.required && p.default != null) {
      const def = document.createElement("span");
      def.className = "code-docs__default";
      def.textContent = "=" + p.default;
      sig.append(def);
    }
  });
  if (hidden > 0) {
    const more = document.createElement("span");
    more.className = "code-docs__more";
    more.textContent = `, +${hidden} more`;
    sig.append(more);
  }
  sig.append(document.createTextNode(")"));
  dom.append(sig);

  if (info.summary) {
    const doc = document.createElement("div");
    doc.className = "code-docs__summary";
    doc.textContent = info.summary;
    dom.append(doc);
  }
  if (info.module) {
    const mod = document.createElement("div");
    mod.className = "code-docs__module";
    mod.textContent = info.module;
    dom.append(mod);
  }
  return dom;
}

/** Build the tooltip for a call, reading the cursor to pick the active param. */
function tooltipFor(call: OpenCall, text: string, cursor: number): Tooltip {
  const active = activeIndex(text, call.pos, cursor);
  const kw = activeName(text, call.pos, cursor);
  return {
    pos: call.pos,
    above: true,
    arrow: false,
    create: () => ({ dom: render(call.info, active, kw) }),
  };
}

const signatureField = StateField.define<{ call: OpenCall; tip: Tooltip } | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSignature)) {
        if (!e.value) return null;
        const text = tr.state.doc.toString();
        const cursor = tr.state.selection.main.head;
        return { call: e.value, tip: tooltipFor(e.value, text, cursor) };
      }
    }
    if (!value) return null;
    // Follow the edit, then close once the cursor leaves the call.
    const pos = tr.changes.mapPos(value.call.pos);
    const text = tr.state.doc.toString();
    const cursor = tr.state.selection.main.head;
    if (!stillInsideCall(text, pos, cursor)) return null;
    // Re-render on any doc or selection change so the highlight tracks the
    // argument the cursor is actually in.
    if (!tr.docChanged && !tr.selection && pos === value.call.pos) return value;
    const call = { info: value.call.info, pos };
    return { call, tip: tooltipFor(call, text, cursor) };
  },
  provide: (f) => showTooltip.from(f, (v) => v?.tip ?? null),
});

/** Show library parameters when the student opens a call's parentheses. */
export function docsPopup(lookup: SignatureLookup): Extension {
  let seq = 0;
  return [
    signatureField,
    EditorView.updateListener.of((u) => {
      if (!u.docChanged) return;
      let opened: number | null = null;
      u.changes.iterChanges((_fa, _ta, _fb, tb, ins) => {
        if (ins.toString() === "(") opened = tb;
      });
      if (opened === null) return;
      const at = opened;
      const text = u.state.doc.toString();
      const name = nameBefore(text, at - 1);
      if (!name) return;
      const token = ++seq;
      void lookup(name).then((info) => {
        // A later keystroke already superseded this lookup.
        if (!info || token !== seq) return;
        u.view.dispatch({ effects: setSignature.of({ info, pos: at }) });
      });
    }),
    EditorView.domEventHandlers({
      keydown: (e, view) => {
        if (e.key === "Escape" && view.state.field(signatureField, false)) {
          view.dispatch({ effects: setSignature.of(null) });
          // Swallow it, so Escape closes the popup before leaving the cell.
          return true;
        }
        return false;
      },
      blur: (_e, view) => {
        // Leaving the cell entirely closes it — the call being documented is
        // no longer what the student is working on.
        if (view.state.field(signatureField, false)) {
          view.dispatch({ effects: setSignature.of(null) });
        }
        return false;
      },
    }),
    // Click-anywhere-else dismissal. This has to be a document listener:
    // domEventHandlers only sees events inside the editor, and the tooltip is
    // rendered outside it, so neither a click on the page nor a click on the
    // popup itself would otherwise reach us.
    ViewPlugin.define((view) => {
      const onPointerDown = (e: MouseEvent) => {
        if (!view.state.field(signatureField, false)) return;
        const target = e.target as Node | null;
        const inEditor = target ? view.dom.contains(target) : false;
        const inPopup = target instanceof Element ? !!target.closest(".code-docs") : false;
        if (!inEditor && !inPopup) {
          view.dispatch({ effects: setSignature.of(null) });
        }
      };
      document.addEventListener("pointerdown", onPointerDown, true);
      return {
        destroy() {
          document.removeEventListener("pointerdown", onPointerDown, true);
        },
      };
    }),
  ];
}

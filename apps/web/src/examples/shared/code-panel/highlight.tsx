// A small Python highlighter for the code boxes: comments, strings, numbers,
// keywords, and dotted calls (`tf.matmul`). Enough to make a few lines
// readable; it is not a parser and makes no claim to be one.

import type { ReactNode } from "react";

const KEYWORDS = new Set([
  "import", "from", "as", "def", "return", "for", "in", "with", "if",
  "else", "elif", "while", "lambda", "None", "True", "False", "class",
]);

const TOKEN =
  /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|([A-Za-z_][\w.]*)(?=\s*\()|([A-Za-z_]\w*)/g;

export function highlightPython(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const [text, comment, str, num, call, word] = m;
    let cls: string | null = null;
    if (comment) cls = "ex-tok-comment";
    else if (str) cls = "ex-tok-string";
    else if (num) cls = "ex-tok-num";
    else if (call) cls = KEYWORDS.has(call) ? "ex-tok-kw" : "ex-tok-call";
    else if (word && KEYWORDS.has(word)) cls = "ex-tok-kw";
    out.push(
      cls ? (
        <span key={k++} className={cls}>
          {text}
        </span>
      ) : (
        text
      ),
    );
    last = m.index + text.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

/** `backticks` → code, *asterisks* → emphasis, within one block of prose. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*[^*\s][^*]*\*)/).map((part, j) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={j}>{part.slice(1, -1)}</code>
    ) : part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
      <em key={j}>{part.slice(1, -1)}</em>
    ) : (
      part
    ),
  );
}

const OL_ITEM = /^\s*(\d+)[.)]\s+/;
const UL_ITEM = /^\s*[-*]\s+/;

/**
 * Prose with `backticks` for inline code and *asterisks* for a term being
 * introduced. A blank line starts a new paragraph; within a paragraph,
 * single line breaks are just spaces.
 *
 * Lines starting `1.` / `1)` or `-` are list items. Consecutive items make
 * one tight list, whether or not blank lines sit between them, so a list
 * reads as a list rather than as one paragraph per item. A line that
 * follows an item without a marker continues that item.
 */
export function renderProse(text: string): ReactNode[] {
  type Block =
    | { kind: "p"; text: string }
    | { kind: "ol" | "ul"; start: number; items: string[] };
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Extract<Block, { kind: "ol" | "ul" }> | null = null;
  let blankSinceItem = false;
  const endPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };

  for (const raw of text.trim().split("\n")) {
    const line = raw.trim();
    const ol = OL_ITEM.exec(raw);
    const ul = !ol && UL_ITEM.exec(raw);
    if (ol || ul) {
      endPara();
      const kind = ol ? "ol" : "ul";
      if (!list || list.kind !== kind) {
        list = { kind, start: ol ? parseInt(ol[1]!, 10) : 1, items: [] };
        blocks.push(list);
      }
      list.items.push(raw.replace(ol ? OL_ITEM : UL_ITEM, "").trim());
      blankSinceItem = false;
    } else if (!line) {
      endPara();
      if (list) blankSinceItem = true;
    } else if (list && !blankSinceItem) {
      list.items[list.items.length - 1] += ` ${line}`;
    } else {
      list = null;
      para.push(line);
    }
  }
  endPara();

  return blocks.map((b, i) =>
    b.kind === "p" ? (
      <p key={i}>{inline(b.text)}</p>
    ) : b.kind === "ol" ? (
      <ol key={i} start={b.start}>
        {b.items.map((it, j) => (
          <li key={j}>{inline(it)}</li>
        ))}
      </ol>
    ) : (
      <ul key={i}>
        {b.items.map((it, j) => (
          <li key={j}>{inline(it)}</li>
        ))}
      </ul>
    ),
  );
}

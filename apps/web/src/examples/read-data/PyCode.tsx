// Python on the page: code lines with hover explanations on their words, and
// values printed the way Python prints them.
//
// One colour rule runs through the whole example: a string is salmon and a
// number is blue, in the code, in what comes back, and in the type badges.
// They are the general data-mark hues (docs/style.md §11), never the brand
// accent, so the distinction the page teaches is always the same colour.

import type { ReactNode } from "react";
import { Tooltip } from "../../components/index.js";
import type { PyKind, PyValue } from "./py.js";
import { TOOLTIPS } from "./content.js";

const KEYWORDS = new Set([
  "import", "from", "as", "def", "return", "for", "in", "if", "else",
  "None", "True", "False",
]);

const TOKEN =
  /(#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([().=,[\]:])/g;

/** Tokenize a line of Python; with `tips`, words in TOOLTIPS get one. */
export function tokens(src: string, tips: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const [text, comment, string, number, word, punct] = m;
    const cls = comment
      ? "rd-tok-comment"
      : string
        ? "rd-str"
        : number
          ? "rd-num"
          : word && KEYWORDS.has(word)
            ? "rd-tok-kw"
            : punct
              ? "rd-tok-punct"
              : null;
    const node = cls ? (
      <span key={k++} className={cls}>
        {text}
      </span>
    ) : (
      <span key={k++}>{text}</span>
    );
    const tip = tips && (word || punct) ? TOOLTIPS[text] : undefined;
    out.push(
      tip ? (
        <Tooltip key={k++} label={tip} placement="top" className="rd-tip">
          {node}
        </Tooltip>
      ) : (
        node
      ),
    );
    last = m.index + text.length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export interface CodeBlockProps {
  code: string;
  /** 0-based line to mark as the one running, or null. */
  current?: number | null;
  /** Lines after this index are drawn faded (not reached yet). */
  reached?: number;
}

/** A block of code, one row per line, words explained on hover. */
export function CodeBlock({ code, current = null, reached }: CodeBlockProps) {
  const lines = code.split("\n");
  return (
    <pre className="rd-code">
      {lines.map((line, i) => (
        <div
          key={i}
          className={[
            "rd-code__line",
            i === current ? "is-current" : "",
            reached != null && i > reached ? "is-ahead" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {line ? tokens(line, true) : " "}
        </div>
      ))}
    </pre>
  );
}

const BADGE: Record<PyKind, string> = {
  str: "str",
  int: "int",
  list: "list",
  file: "file",
  function: "function",
  none: "None",
  error: "error",
  DataFrame: "DataFrame",
};

/** A type badge: salmon for a string, blue for a number, sand otherwise. */
export function TypeBadge({ kind, label }: { kind: PyKind | "object" | "int64"; label?: string }) {
  const tone =
    kind === "str" || kind === "object" ? "str" : kind === "int" || kind === "int64" ? "num" : "other";
  return (
    <span className={`rd-badge rd-badge--${tone}`}>
      {label ?? (kind in BADGE ? BADGE[kind as PyKind] : kind)}
    </span>
  );
}

/** What Python gives back: the value as Python prints it, plus its type. */
export function ValueView({ value }: { value: PyValue }) {
  if (value.kind === "error") {
    const [name, ...rest] = value.repr.split(": ");
    return (
      <div className="rd-value rd-value--error">
        <code>
          <b>{name}</b>: {rest.join(": ")}
        </code>
      </div>
    );
  }
  return (
    <div className="rd-value">
      <TypeBadge kind={value.kind} />
      <code className="rd-value__repr">
        {/* Only data is coloured: a function's or file's description is not. */}
        {value.kind === "str" || value.kind === "int" || value.kind === "list"
          ? tokens(value.repr, false)
          : value.repr}
      </code>
    </div>
  );
}

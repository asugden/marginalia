// The sketch, annotated as it runs.
//
// Each line carries its job (a coloured bar and a glyph: setup, output,
// input, control, time, serial), the value it last produced, and — when the
// plain-English column is on — what it means. The running line is lit;
// setup() greys out once it has run; a delay fills while it waits and flags
// any button change it missed. Numbers, HIGH/LOW and true/false can be
// dragged or clicked to change them while the sketch runs.

import { useRef, type PointerEvent as RPointerEvent } from "react";
import { Tooltip } from "../../components/index.js";
import type { Literal, Program, Role } from "./lang.js";
import { TOOLTIPS } from "./tooltips.js";

export const ROLE_ORDER: Role[] = [
  "control",
  "input",
  "output",
  "time",
  "setup",
  "serial",
];
export const ROLE_INFO: Record<
  Role,
  { glyph: string; name: string; hint: string }
> = {
  setup: { glyph: "⚙", name: "Setup", hint: "Control pins, input, and output" },
  output: { glyph: "→", name: "Output", hint: "control actuators" },
  input: { glyph: "←", name: "Input", hint: "read from sensors" },
  control: { glyph: "?", name: "Control", hint: "decisions in code" },
  time: { glyph: "◷", name: "Time", hint: "wait or check clock" },
  serial: { glyph: "✉", name: "Serial", hint: "Print to the computer" },
};

const KEYWORDS =
  /^(if|else|while|for|do|return|break|continue|void|const|static|unsigned)\b/;
const TYPES =
  /^(int|float|double|bool|boolean|long|short|byte|char|word|String|u?int\d+_t|size_t)\b/;
const CALLS: Record<string, Role> = {
  pinMode: "setup",
  digitalWrite: "output",
  analogWrite: "output",
  digitalRead: "input",
  analogRead: "input",
  delay: "time",
  millis: "time",
  "Serial.begin": "setup",
  "Serial.print": "serial",
  "Serial.println": "serial",
};

export interface CodeViewProps {
  source: string;
  prog: Program;
  current: number | null;
  setupDone: boolean;
  notes: Map<number, { text: string; at: number }>;
  now: number;
  delayLine: number | null;
  delayProgress: number | null;
  missed: Array<{ line: number; label: string }>;
  english: Map<number, string> | null;
  hoverLine: number | null;
  litText: Map<number, string>;
  onHoverLine: (line: number | null) => void;
  onLitChange: (i: number, value: number, text: string) => void;
  onLitCommit: (i: number) => void;
}

export function CodeView(p: CodeViewProps) {
  const lines = p.source.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const lineStarts: number[] = [0];
  for (let i = 0; i < p.source.length; i++)
    if (p.source[i] === "\n") lineStarts.push(i + 1);

  const setup = p.prog.funcs.get("setup");
  const inSetup = (n: number) =>
    !!setup && n > setup.line && n < setup.body.endLine;

  // Literals by line, draggable only where the source text is the literal
  // itself (not a #define standing in for it).
  const litsByLine = new Map<number, Array<{ i: number; lit: Literal }>>();
  p.prog.lits.forEach((lit, i) => {
    if (p.source.slice(lit.start, lit.end) !== lit.text) return;
    const list = litsByLine.get(lit.line) ?? [];
    list.push({ i, lit });
    litsByLine.set(lit.line, list);
  });

  return (
    <div className="cd-code" onPointerLeave={() => p.onHoverLine(null)}>
      {lines.map((text, idx) => {
        const n = idx + 1;
        const roles = p.prog.roles.get(n);
        const primary = roles
          ? ROLE_ORDER.find((r) => roles.has(r))
          : undefined;
        const note = p.notes.get(n);
        const fresh = note && p.now - note.at < 250;
        const isCur = p.current === n;
        const miss = p.missed.filter((m) => m.line === n);
        const cls = [
          "cd-line",
          isCur ? "cd-line--current" : "",
          p.setupDone && inSetup(n) ? "cd-line--done" : "",
          p.hoverLine === n ? "cd-line--hover" : "",
          primary ? `cd-role--${primary}` : "",
        ].join(" ");
        const eng = p.english?.get(n);
        return (
          <div
            key={n}
            className={cls}
            data-line={n}
            onPointerEnter={() => p.onHoverLine(n)}
          >
            <span className="cd-num">{n}</span>
            <span
              className="cd-glyphs"
              title={
                roles
                  ? [...roles].map((r) => ROLE_INFO[r].name).join(" · ")
                  : undefined
              }
            >
              {roles &&
                ROLE_ORDER.filter((r) => roles.has(r)).map((r) => (
                  <span key={r} className={`cd-glyph cd-glyph--${r}`}>
                    {ROLE_INFO[r].glyph}
                  </span>
                ))}
            </span>
            <span className="cd-text">
              {p.delayLine === n && p.delayProgress !== null && (
                <span
                  className="cd-delaybar"
                  style={{ width: `${p.delayProgress * 100}%` }}
                />
              )}
              <Highlighted
                text={text}
                offset={lineStarts[idx]!}
                lits={litsByLine.get(n) ?? []}
                litText={p.litText}
                onLitChange={p.onLitChange}
                onLitCommit={p.onLitCommit}
              />
              {eng && <span className="cd-english">{eng}</span>}
            </span>
            <span className={`cd-note${fresh ? " cd-note--fresh" : ""}`}>
              {miss.length > 0 && (
                <span className="cd-missed">
                  missed {miss[miss.length - 1]!.label}
                </span>
              )}
              {note?.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Highlighted({
  text,
  offset,
  lits,
  litText,
  onLitChange,
  onLitCommit,
}: {
  text: string;
  offset: number;
  lits: Array<{ i: number; lit: Literal }>;
  litText: Map<number, string>;
  onLitChange: (i: number, value: number, text: string) => void;
  onLitCommit: (i: number) => void;
}) {
  const out: React.ReactNode[] = [];
  let pos = 0;
  const sorted = [...lits].sort((a, b) => a.lit.start - b.lit.start);
  for (const { i, lit } of sorted) {
    const s = lit.start - offset;
    const e = lit.end - offset;
    if (s < pos) continue;
    out.push(...highlight(text.slice(pos, s), `${pos}`));
    out.push(
      <DragLit
        key={`lit${i}`}
        index={i}
        lit={lit}
        shown={litText.get(i) ?? lit.text}
        onChange={onLitChange}
        onCommit={onLitCommit}
      />,
    );
    pos = e;
  }
  out.push(...highlight(text.slice(pos), `${pos}`));
  return <>{out}</>;
}

/** Syntax colouring for the plain parts of a line. */
function highlight(s: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) (out.push(plain), (plain = ""));
  };
  while (i < s.length) {
    const rest = s.slice(i);
    if (rest.startsWith("//")) {
      flush();
      out.push(
        <span key={`${key}c${i}`} className="cd-tok-comment">
          {rest}
        </span>,
      );
      break;
    }
    if (rest[0] === '"' || rest[0] === "'" || rest[0] === "“") {
      const q = rest[0] === "“" ? "”" : rest[0]!;
      const end = rest.indexOf(q, 1);
      const len = end < 0 ? rest.length : end + 1;
      flush();
      out.push(
        <span key={`${key}s${i}`} className="cd-tok-string">
          {rest.slice(0, len)}
        </span>,
      );
      i += len;
      continue;
    }
    const word = /^[A-Za-z_][\w.]*/.exec(rest)?.[0];
    if (word && (i === 0 || !/\w/.test(s[i - 1]!))) {
      flush();
      const role = CALLS[word];
      const cls = role
        ? `cd-tok-call cd-tok-call--${role}`
        : KEYWORDS.test(word)
          ? "cd-tok-kw"
          : TYPES.test(word)
            ? "cd-tok-type"
            : /^[A-Z][A-Z0-9_]+$/.test(word)
              ? "cd-tok-const"
              : "";
      const token = cls ? (
        <span key={`${key}w${i}`} className={cls}>
          {word}
        </span>
      ) : (
        word
      );
      // A function's name, followed by "(", gets its tooltip (tooltips.ts).
      const tip = TOOLTIPS[word];
      const isCall = /^\s*\(/.test(s.slice(i + word.length));
      out.push(
        tip && isCall ? (
          <Tooltip
            key={`${key}t${i}`}
            label={tip}
            placement="top"
            className="cd-tip"
          >
            {token}
          </Tooltip>
        ) : (
          token
        ),
      );
      i += word.length;
      continue;
    }
    plain += rest[0];
    i++;
  }
  flush();
  return out;
}

/** Pixels of drag per power of ten. */
const PX_PER_DECADE = 60;

/** A whole number dragged `dx` pixels from `v0`, on a scale where each
 *  PX_PER_DECADE pixels multiplies or divides by ten, so 1000 → 100 and
 *  5 → 40 are both a short drag. Near zero the scale turns linear, so it
 *  passes through 0 and 1 cleanly. It lands on a ladder of round values:
 *  every whole number under 20, then steps of 5 to 100, 10 to 200, 50 to
 *  1000, and so on. The rungs are far enough apart that a pixel of drag
 *  never skips one. */
function dragWhole(v0: number, dx: number): number {
  const to = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v));
  const from = (u: number) => Math.sign(u) * (10 ** Math.abs(u) - 1);
  const v = from(to(v0) + dx / PX_PER_DECADE);
  const mag = Math.abs(v);
  if (mag < 20) return Math.round(v);
  const base = 10 ** Math.floor(Math.log10(mag));
  const step = mag < 2 * base ? base / 10 : base / 2;
  return Math.round(v / step) * step;
}

/** A literal you can drag (numbers) or click (HIGH/LOW, true/false). */
function DragLit({
  index,
  lit,
  shown,
  onChange,
  onCommit,
}: {
  index: number;
  lit: Literal;
  shown: string;
  onChange: (i: number, value: number, text: string) => void;
  onCommit: (i: number) => void;
}) {
  const start = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const toggle = lit.kind !== "num";

  const down = (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    start.current = { x: e.clientX, v: lit.value, moved: false };
  };
  const move = (e: RPointerEvent<HTMLSpanElement>) => {
    const s = start.current;
    if (!s || toggle) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 3 && !s.moved) return;
    s.moved = true;
    let v = lit.isFloat ? s.v + Math.round(dx / 6) * 0.1 : dragWhole(s.v, dx);
    if (s.v >= 0) v = Math.max(0, v);
    v = lit.isFloat ? Math.round(v * 10) / 10 : Math.round(v);
    onChange(index, v, lit.isFloat ? v.toFixed(1) : String(v));
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (toggle) {
      const v = lit.value ? 0 : 1;
      onChange(
        index,
        v,
        lit.kind === "level" ? (v ? "HIGH" : "LOW") : v ? "true" : "false",
      );
    }
    onCommit(index);
  };
  return (
    <span
      className={toggle ? "cd-lit cd-lit--toggle" : "cd-lit"}
      title={toggle ? "Click to toggle" : "Drag left or right"}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (start.current = null)}
    >
      {shown}
    </span>
  );
}

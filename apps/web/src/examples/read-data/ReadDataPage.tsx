// The Reading data example (/examples/reading-data).
//
// One small CSV followed from disk into Python, in six panels: the file as
// text, parentheses, plain-Python reading, strings against numbers,
// functions, and libraries (pandas). Static and unauthenticated, like every
// example. All of the words live in ./content.ts; every value shown is
// computed from the CSV there (./py.ts), so nothing on the page is a
// screenshot of Python, and changing the data changes the results.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Switch, Wordmark } from "../../components/index.js";
import { renderProse } from "../shared/code-panel/highlight.js";
import "../mnist-mlp/digit-recognizer.css";
import "./read-data.css";
import {
  CSV,
  FILE_NAME,
  FILE_PANEL,
  FUNCTION_CHOICES,
  FUNCTION_CODE,
  FUNCTION_PANEL,
  LEDE,
  LIBRARY_PANEL,
  PARENS_PAIRS,
  PARENS_PANEL,
  STEPS,
  STEPS_PANEL,
  TRY_CELLS,
  TYPES_PANEL,
} from "./content.js";
import {
  err,
  list,
  num,
  pandasCell,
  pandasType,
  parse,
  pyBinary,
  pyInt,
  pyList,
  str,
  type Operand,
  type PyValue,
} from "./py.js";
import { CodeBlock, TypeBadge, ValueView } from "./PyCode.js";

// Reprs Python prints for things that are not data. The addresses vary from
// run to run in real Python; these are fixed so the page never changes.
const FILE_REPR = `<_io.TextIOWrapper name='${FILE_NAME}' mode='r' encoding='UTF-8'>`;
const fn = (repr: string): PyValue => ({ kind: "function", repr });

export function ReadDataPage() {
  const data = useMemo(() => parse(CSV), []);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Reading data</h1>
            <div className="mnist-lede">{renderProse(LEDE)}</div>
          </div>

          <FilePanel data={data} />
          <ParensPanel data={data} />
          <StepsPanel data={data} />
          <TypesPanel data={data} />
          <FunctionPanel data={data} />
          <LibraryPanel data={data} />
        </div>
      </div>
    </div>
  );
}

type Data = ReturnType<typeof parse>;

/** Panel scaffolding per docs/style.md §14: title, standfirst, body, note. */
function Panel({
  title,
  standfirst,
  note,
  children,
}: {
  title: string;
  standfirst: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rd-panel" padding="md">
      <h2 className="rd-h2">{title}</h2>
      <div className="rd-sub">{renderProse(standfirst)}</div>
      {children}
      {note && <div className="rd-note">{renderProse(note)}</div>}
    </Card>
  );
}

/** A readout box: kicker over its content. */
function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rd-readout">
      <span className="rd-kicker">{label}</span>
      {children}
    </div>
  );
}

// ── 1. A file is just text ────────────────────────────────────────────
function FilePanel({ data }: { data: Data }) {
  const [breaks, setBreaks] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const grid = data.lines.map((l) => l.split(","));
  const on = (r: number, c: number) => hover?.r === r && hover.c === c;
  const cellProps = (r: number, c: number) => ({
    className: on(r, c) ? "is-on" : undefined,
    onPointerEnter: () => setHover({ r, c }),
    onPointerLeave: () => setHover(null),
  });

  return (
    <Panel title={FILE_PANEL.title} standfirst={FILE_PANEL.standfirst} note={FILE_PANEL.note}>
      <div className="rd-controls">
        <Switch
          label={FILE_PANEL.hiddenSwitch}
          checked={breaks}
          onChange={(e) => setBreaks(e.target.checked)}
        />
      </div>
      <div className="rd-file-pair">
        <div className="rd-file-pair__side">
          <span className="rd-kicker">
            {FILE_PANEL.fileLabel} · <span className="rd-filename">{FILE_NAME}</span>
          </span>
          <pre className="rd-file">
            {grid.map((cells, r) => (
              <div key={r}>
                {cells.map((cell, c) => (
                  <span key={c}>
                    {c > 0 && <span className="rd-file__comma">,</span>}
                    <span {...cellProps(r, c)}>{cell || "​"}</span>
                  </span>
                ))}
                {breaks && <span className="rd-file__nl">\n</span>}
              </div>
            ))}
          </pre>
        </div>
        <div className="rd-file-pair__side">
          <span className="rd-kicker">{FILE_PANEL.sheetLabel}</span>
          <div className="rd-scroll">
            <table className="rd-sheet">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  {grid[0]!.map((_, c) => (
                    <th key={c} className="rd-sheet__colname">
                      {String.fromCharCode(65 + c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((cells, r) => (
                  <tr key={r} className={r === 0 ? "rd-sheet__header" : undefined}>
                    <th className="rd-sheet__rownum">{r + 1}</th>
                    {cells.map((cell, c) => (
                      <td key={c} {...cellProps(r, c)}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ── 2. Parentheses mean go ────────────────────────────────────────────
function ParensPanel({ data }: { data: Data }) {
  const [pick, setPick] = useState<{ pair: number; called: boolean }>({ pair: 0, called: false });
  const values: Record<string, PyValue> = {
    "f.read": fn("<built-in method read of _io.TextIOWrapper object at 0x7f3a2c1d5e40>"),
    "f.read()": str(data.text),
    len: fn("<built-in function len>"),
    "len(text)": num(data.text.length),
    "text.splitlines": fn("<built-in method splitlines of str object at 0x7f3a2c0b9a30>"),
    "text.splitlines()": list(data.lines),
  };
  const pair = PARENS_PAIRS[pick.pair]!;
  const code = pick.called ? pair.called : pair.name;
  const value = values[code];

  return (
    <Panel title={PARENS_PANEL.title} standfirst={PARENS_PANEL.standfirst} note={PARENS_PANEL.note}>
      <div className="rd-pairs">
        {PARENS_PAIRS.map((p, i) => (
          <div key={i} className="rd-pairs__row">
            {[false, true].map((called) => {
              const chosen = pick.pair === i && pick.called === called;
              return (
                <Button
                  key={String(called)}
                  size="sm"
                  variant={chosen ? "primary" : "subtle"}
                  className="rd-mono-btn"
                  aria-pressed={chosen}
                  onClick={() => setPick({ pair: i, called })}
                >
                  {called ? p.called : p.name}
                </Button>
              );
            })}
          </div>
        ))}
      </div>
      <CodeBlock code={code} />
      <Readout label={PARENS_PANEL.resultLabel}>
        {value && <ValueView value={value} />}
        <div className="rd-explain">
          {renderProse(pick.called ? pair.calledNote : pair.nameNote)}
        </div>
      </Readout>
    </Panel>
  );
}

// ── 3. Reading it with plain Python ───────────────────────────────────
function StepsPanel({ data }: { data: Data }) {
  const [step, setStep] = useState(0);
  // Each line's value, keyed by its exact code (see content.ts).
  const firstRow = data.lines[1]!.split(",");
  const results: Record<string, { name: string; value: PyValue }> = {
    'f = open("visitors.csv")': { name: "f", value: { kind: "file", repr: FILE_REPR } },
    "text = f.read()": { name: "text", value: str(data.text) },
    "f.close()": { name: "f.close()", value: { kind: "none", repr: "None" } },
    "lines = text.splitlines()": { name: "lines", value: list(data.lines) },
    'header = lines[0].split(",")': { name: "header", value: list(data.header) },
    'row = lines[1].split(",")': { name: "row", value: list(firstRow) },
    "clicks = int(row[2])": { name: "clicks", value: pyInt(firstRow[2] ?? "") },
  };
  const s = STEPS[step]!;
  const here = results[s.code];
  // Every name assigned so far, latest value wins.
  const vars = STEPS.slice(0, step + 1)
    .map((x) => results[x.code])
    .filter((x): x is { name: string; value: PyValue } => !!x && !x.name.includes("("));

  return (
    <Panel title={STEPS_PANEL.title} standfirst={STEPS_PANEL.standfirst} note={STEPS_PANEL.note}>
      <div className="rd-controls">
        <Button size="sm" variant="subtle" disabled={step === 0} onClick={() => setStep(step - 1)}>
          {STEPS_PANEL.back}
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={step === STEPS.length - 1}
          onClick={() => setStep(step + 1)}
        >
          {STEPS_PANEL.next}
        </Button>
        <span className="rd-kicker rd-controls__count">
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <div className="rd-steps">
        <div className="rd-steps__code">
          <CodeBlock code={STEPS.map((x) => x.code).join("\n")} current={step} reached={step} />
          <Readout label={here ? here.name : s.code}>
            {here && <ValueView value={here.value} />}
            <div className="rd-explain">{renderProse(s.explain)}</div>
          </Readout>
        </div>
        <div className="rd-vars">
          <span className="rd-kicker">{STEPS_PANEL.varsLabel}</span>
          <table className="rd-vars__table">
            <tbody>
              {vars.map((v) => (
                <tr key={v.name}>
                  <th>
                    <code>{v.name}</code>
                  </th>
                  <td>
                    <TypeBadge kind={v.value.kind} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

// ── 4. Strings and numbers ────────────────────────────────────────────
function TypesPanel({ data }: { data: Data }) {
  const first = data.rows[0]!;
  const a = first[2] ?? "3";
  const b = first[3] ?? "21";
  const [left, setLeft] = useState<"str" | "int">("str");
  const [right, setRight] = useState<"str" | "int">("str");
  const [op, setOp] = useState<"+" | "*">("+");
  const [tryCell, setTryCell] = useState(TRY_CELLS[0]!);

  const L: Operand = left === "str" ? { kind: "str", s: a } : { kind: "int", n: parseInt(a, 10) };
  const R: Operand = right === "str" ? { kind: "str", s: b } : { kind: "int", n: parseInt(b, 10) };
  const result = pyBinary(L, op, R);
  // Written the way a person types it (double quotes); the result keeps
  // Python's own printing (single quotes).
  const typed = (o: Operand) => (o.kind === "str" ? JSON.stringify(o.s) : String(o.n));
  const expr = `${typed(L)} ${op} ${typed(R)}`;

  const choice = <T extends string>(
    label: string,
    options: { value: T; text: string }[],
    value: T,
    set: (v: T) => void,
  ) => (
    <div className="rd-choice">
      <span className="rd-kicker">{label}</span>
      <div className="rd-choice__buttons">
        {options.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={o.value === value ? "primary" : "subtle"}
            className="rd-mono-btn"
            aria-pressed={o.value === value}
            onClick={() => set(o.value)}
          >
            {o.text}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <Panel title={TYPES_PANEL.title} standfirst={TYPES_PANEL.standfirst} note={TYPES_PANEL.note}>
      <div className="rd-choices">
        {choice(TYPES_PANEL.leftLabel, [
          { value: "str", text: JSON.stringify(a) },
          { value: "int", text: String(parseInt(a, 10)) },
        ], left, setLeft)}
        {choice(TYPES_PANEL.opLabel, [
          { value: "+", text: "+" },
          { value: "*", text: "*" },
        ], op, setOp)}
        {choice(TYPES_PANEL.rightLabel, [
          { value: "str", text: JSON.stringify(b) },
          { value: "int", text: String(parseInt(b, 10)) },
        ], right, setRight)}
      </div>
      <CodeBlock code={expr} />
      <Readout label={TYPES_PANEL.resultLabel}>
        <ValueView value={result} />
      </Readout>

      <h3 className="rd-h3">{TYPES_PANEL.tryTitle}</h3>
      <div className="rd-sub">{renderProse(TYPES_PANEL.tryStandfirst)}</div>
      <div className="rd-choice__buttons">
        {TRY_CELLS.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={c === tryCell ? "primary" : "subtle"}
            className="rd-mono-btn"
            aria-pressed={c === tryCell}
            onClick={() => setTryCell(c)}
          >
            {JSON.stringify(c)}
          </Button>
        ))}
      </div>
      <CodeBlock code={`int(${JSON.stringify(tryCell)})`} />
      <Readout label={TYPES_PANEL.resultLabel}>
        <ValueView value={pyInt(tryCell)} />
      </Readout>
    </Panel>
  );
}

// ── 5. A function collects the steps ──────────────────────────────────
function FunctionPanel({ data }: { data: Data }) {
  const [pick, setPick] = useState(0);
  const choice = FUNCTION_CHOICES[pick]!;
  const value: PyValue | null =
    choice.code === null
      ? null
      : choice.code.includes("(")
        ? { kind: "list", repr: `[${data.rows.map(pyList).join(", ")}]` }
        : fn("<function read_rows at 0x7f3a2bf41b80>");
  const code = choice.code ? `${FUNCTION_CODE}\n\n${choice.code}` : FUNCTION_CODE;

  return (
    <Panel title={FUNCTION_PANEL.title} standfirst={FUNCTION_PANEL.standfirst} note={FUNCTION_PANEL.note}>
      <div className="rd-choice__buttons rd-controls">
        {FUNCTION_CHOICES.map((c, i) => (
          <Button
            key={i}
            size="sm"
            variant={i === pick ? "primary" : "subtle"}
            className="rd-mono-btn"
            aria-pressed={i === pick}
            onClick={() => setPick(i)}
          >
            {c.label}
          </Button>
        ))}
      </div>
      <CodeBlock code={code} current={choice.code ? code.split("\n").length - 1 : null} />
      <Readout label={FUNCTION_PANEL.resultLabel}>
        {value && <ValueView value={value} />}
        <div className="rd-explain">{renderProse(choice.note)}</div>
      </Readout>
    </Panel>
  );
}

// ── 6. A library is functions someone else wrote ──────────────────────
function LibraryPanel({ data }: { data: Data }) {
  const [imported, setImported] = useState(true);
  const types = data.header.map((_, c) => pandasType(data.rows.map((r) => r[c] ?? "")));
  const code = [
    imported ? "import pandas as pd" : null,
    `df = pd.read_csv("${FILE_NAME}")`,
    "df",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <Panel title={LIBRARY_PANEL.title} standfirst={LIBRARY_PANEL.standfirst} note={LIBRARY_PANEL.note}>
      <div className="rd-choice__buttons rd-controls">
        {[true, false].map((w) => (
          <Button
            key={String(w)}
            size="sm"
            variant={w === imported ? "primary" : "subtle"}
            aria-pressed={w === imported}
            onClick={() => setImported(w)}
          >
            {w ? LIBRARY_PANEL.with : LIBRARY_PANEL.without}
          </Button>
        ))}
      </div>
      <CodeBlock code={code} />
      <Readout label={LIBRARY_PANEL.resultLabel}>
        {!imported ? (
          <ValueView value={err("NameError", "name 'pd' is not defined")} />
        ) : (
          <div className="rd-scroll">
            <table className="rd-df">
              <thead>
                <tr>
                  <th aria-hidden="true" />
                  {data.header.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <th>{i}</th>
                    {r.map((v, c) => (
                      <td key={c} className={types[c] === "object" ? "rd-str" : "rd-num"}>
                        {pandasCell(v, types[c]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th className="rd-kicker">{LIBRARY_PANEL.typesLabel}</th>
                  {types.map((t, c) => (
                    <td key={c}>
                      <TypeBadge kind={t === "object" ? "object" : "int64"} label={t} />
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Readout>
    </Panel>
  );
}

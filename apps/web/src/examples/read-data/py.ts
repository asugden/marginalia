// A sliver of Python, enough to show honestly what each line on the page
// gives back. Every value is computed from the CSV text in ./content.ts, and
// printed the way Python itself would print it (its repr): strings in single
// quotes with \n escaped, lists in square brackets.

/** A Python value as the page shows it. */
export type PyKind = "str" | "int" | "list" | "file" | "function" | "none" | "error" | "DataFrame";
export interface PyValue {
  kind: PyKind;
  /** What Python would show for it. */
  repr: string;
}

export function pyStr(s: string): string {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  const body = s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(new RegExp(q, "g"), `\\${q}`);
  return `${q}${body}${q}`;
}

export function pyList(items: string[]): string {
  return `[${items.map(pyStr).join(", ")}]`;
}

export const str = (s: string): PyValue => ({ kind: "str", repr: pyStr(s) });
export const num = (n: number): PyValue => ({ kind: "int", repr: String(n) });
export const list = (xs: string[]): PyValue => ({ kind: "list", repr: pyList(xs) });
export const err = (name: string, msg: string): PyValue => ({ kind: "error", repr: `${name}: ${msg}` });

/** Python's int() on a string: digits only (an optional sign and spaces). */
export function pyInt(s: string): PyValue {
  if (/^\s*[+-]?\d+\s*$/.test(s)) return num(parseInt(s, 10));
  return err("ValueError", `invalid literal for int() with base 10: ${pyStr(s)}`);
}

/** One operand in the strings-and-numbers panel. */
export type Operand = { kind: "str"; s: string } | { kind: "int"; n: number };

export function operandRepr(o: Operand): string {
  return o.kind === "str" ? pyStr(o.s) : String(o.n);
}

/** `a op b` with Python's rules and its exact error messages. */
export function pyBinary(a: Operand, op: "+" | "*", b: Operand): PyValue {
  if (op === "+") {
    if (a.kind === "str" && b.kind === "str") return str(a.s + b.s);
    if (a.kind === "int" && b.kind === "int") return num(a.n + b.n);
    if (a.kind === "str")
      return err("TypeError", 'can only concatenate str (not "int") to str');
    return err("TypeError", "unsupported operand type(s) for +: 'int' and 'str'");
  }
  if (a.kind === "int" && b.kind === "int") return num(a.n * b.n);
  if (a.kind === "str" && b.kind === "str")
    return err("TypeError", "can't multiply sequence by non-int of type 'str'");
  const s = a.kind === "str" ? a.s : (b as { s: string }).s;
  const n = a.kind === "int" ? a.n : (b as { n: number }).n;
  return str(s.repeat(Math.max(0, n)));
}

/** The CSV, parsed the plain-Python way: lines, then commas. */
export function parse(csv: string) {
  const text = csv;
  const lines = text.split("\n");
  // str.splitlines() drops the final empty piece a trailing newline leaves.
  if (lines[lines.length - 1] === "") lines.pop();
  const header = lines[0]!.split(",");
  const rows = lines.slice(1).map((l) => l.split(","));
  return { text, lines, header, rows };
}

/** A pandas column type, guessed the way read_csv does for this data: all
 *  whole numbers → int64, all numbers → float64, otherwise text (object). */
export function pandasType(values: string[]): "int64" | "float64" | "object" {
  if (values.every((v) => /^\s*[+-]?\d+\s*$/.test(v))) return "int64";
  if (values.every((v) => /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v))) return "float64";
  return "object";
}

/** How pandas shows a cell of a column of that type. */
export function pandasCell(v: string, t: ReturnType<typeof pandasType>): string {
  if (t === "int64") return String(parseInt(v, 10));
  if (t === "float64") return String(parseFloat(v));
  return v;
}

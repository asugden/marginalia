// A parser for the slice of Arduino C++ that beginner sketches use.
//
// Not a compiler. It reads what the example's sketches (and code a student
// pastes from them, or from a chat assistant) actually contain: global and
// local variables, arrays, functions, if / else, while, for, the usual
// operators, #define and #include. Anything else stops with a plain-words
// message naming what it met, rather than a guess.
//
// Two things beyond an ordinary parser, both for the page:
//   · every number, HIGH/LOW and true/false is recorded as a *literal* with
//     its place in the source, so the page can make it draggable and the
//     interpreter can read its live value;
//   · every line gets the *roles* it plays (setup, input, output, control,
//     time), which the page colours.

export class LangError extends Error {
  constructor(
    message: string,
    public line: number,
  ) {
    super(message);
  }
}

// ── Tokens ─────────────────────────────────────────────────────────────

export type TokKind = "num" | "str" | "char" | "id" | "op" | "eof";
export interface Tok {
  k: TokKind;
  v: string;
  line: number;
  start: number;
  end: number;
}

const OPS = [
  "<<=", ">>=", "==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "::",
  "+", "-", "*", "/", "%", "=", "<", ">", "!", "~", "&", "|", "^", "?", ":", ";", ",", ".", "(", ")", "{", "}", "[", "]",
];

const CURLY: Record<string, string> = { "“": '"', "”": '"', "‘": "'", "’": "'" };

export interface Directive {
  line: number;
  text: string;
}

function lex(src: string): { toks: Tok[]; includes: Directive[] } {
  const toks: Tok[] = [];
  const includes: Directive[] = [];
  const defines = new Map<string, Tok[]>();
  let i = 0;
  let line = 1;
  let lineStart = true;
  const push = (t: Tok) => {
    // #define substitution, one level deep.
    const sub = t.k === "id" ? defines.get(t.v) : undefined;
    if (sub) for (const s of sub) toks.push({ ...s, line: t.line, start: t.start, end: t.end });
    else toks.push(t);
  };

  while (i < src.length) {
    const c = src[i]!;
    if (c === "\n") {
      line++;
      i++;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (CURLY[c]) {
      throw new LangError(
        `Line ${line} has a curly quote (${c}). Code needs straight quotes (${CURLY[c]}). Word processors and some chat apps swap them in without asking.`,
        line,
      );
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === "#" && lineStart) {
      const s = i;
      while (i < src.length && src[i] !== "\n") i++;
      const text = src.slice(s, i).replace(/\/\/.*$/, "").trim();
      const m = /^#\s*define\s+([A-Za-z_]\w*)\s+(.*)$/.exec(text);
      if (m) {
        const inner = lex(m[2]!).toks.filter((t) => t.k !== "eof");
        defines.set(m[1]!, inner);
      } else if (/^#\s*include/.test(text)) includes.push({ line, text });
      continue;
    }
    lineStart = false;
    const start = i;
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      if (c === "0" && /[xX]/.test(src[i + 1] ?? "")) {
        i += 2;
        while (/[0-9a-fA-F]/.test(src[i] ?? "")) i++;
      } else {
        while (/[0-9.]/.test(src[i] ?? "")) i++;
        if (/[eE]/.test(src[i] ?? "")) {
          i++;
          if (/[+-]/.test(src[i] ?? "")) i++;
          while (/[0-9]/.test(src[i] ?? "")) i++;
        }
      }
      while (/[uUlLfF]/.test(src[i] ?? "")) i++;
      push({ k: "num", v: src.slice(start, i), line, start, end: i });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (/\w/.test(src[i] ?? "")) i++;
      push({ k: "id", v: src.slice(start, i), line, start, end: i });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      let v = "";
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\n") throw new LangError(`Line ${line} has a quote that never closes.`, line);
        if (src[i] === "\\") {
          const n = src[i + 1];
          v += n === "n" ? "\n" : n === "t" ? "\t" : (n ?? "");
          i += 2;
        } else v += src[i++];
      }
      i++;
      push({ k: c === '"' ? "str" : "char", v, line, start, end: i });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new LangError(`Line ${line} has a character this page doesn't understand: ${c}`, line);
    i += op.length;
    push({ k: "op", v: op, line, start, end: i });
  }
  toks.push({ k: "eof", v: "", line, start: src.length, end: src.length });
  return { toks, includes };
}

// ── Syntax tree ────────────────────────────────────────────────────────

export type Expr =
  | { k: "lit"; lit: number; line: number }
  | { k: "str"; v: string; line: number }
  | { k: "id"; name: string; line: number }
  | { k: "index"; arr: Expr; idx: Expr; line: number }
  | { k: "call"; name: string; args: Expr[]; line: number }
  | { k: "unary"; op: string; x: Expr; line: number }
  | { k: "cast"; type: string; x: Expr; line: number }
  | { k: "bin"; op: string; a: Expr; b: Expr; line: number }
  | { k: "assign"; op: string; target: Expr; value: Expr; line: number }
  | { k: "update"; op: "++" | "--"; prefix: boolean; target: Expr; line: number }
  | { k: "cond"; test: Expr; a: Expr; b: Expr; line: number };

export interface Declarator {
  name: string;
  dims: Array<Expr | null>;
  init?: Expr | Init[];
}
export type Init = Expr | Init[];

export type Stmt =
  | { k: "decl"; type: string; isConst: boolean; vars: Declarator[]; line: number }
  | { k: "expr"; e: Expr; line: number }
  | { k: "if"; test: Expr; then: Stmt; else?: Stmt; line: number; elseLine?: number }
  | { k: "while"; test: Expr; body: Stmt; line: number }
  | { k: "do"; test: Expr; body: Stmt; line: number }
  | { k: "for"; init?: Stmt; test?: Expr; update?: Expr; body: Stmt; line: number }
  | { k: "block"; body: Stmt[]; line: number; endLine: number }
  | { k: "return"; e?: Expr; line: number }
  | { k: "break"; line: number }
  | { k: "continue"; line: number }
  | { k: "empty"; line: number };

export interface Func {
  name: string;
  type: string;
  params: Array<{ name: string; type: string; dims: number }>;
  body: Stmt & { k: "block" };
  line: number;
}

export interface Literal {
  start: number;
  end: number;
  line: number;
  text: string;
  value: number;
  kind: "num" | "level" | "bool";
  isFloat: boolean;
  /** The function it sits in, or "" for a global. */
  scope: string;
}

export type Role = "setup" | "output" | "input" | "control" | "time" | "serial";

export interface Program {
  globals: Array<Stmt & { k: "decl" }>;
  funcs: Map<string, Func>;
  lits: Literal[];
  roles: Map<number, Set<Role>>;
  /** Every statement, by the line it starts on — for the plain-English column. */
  stmtAt: Map<number, Stmt>;
  funcAt: Map<number, Func>;
  includes: Directive[];
}

// ── Parser ─────────────────────────────────────────────────────────────

const TYPE_WORDS = new Set([
  "void", "int", "float", "double", "bool", "boolean", "long", "short", "unsigned", "signed", "byte", "char", "word",
  "String", "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int8_t", "int16_t", "int32_t", "int64_t", "size_t",
]);
const QUALIFIERS = new Set(["const", "static", "volatile"]);

const ROLE_OF: Record<string, Role> = {
  pinMode: "setup",
  "Serial.begin": "setup",
  digitalWrite: "output",
  analogWrite: "output",
  digitalRead: "input",
  analogRead: "input",
  delay: "time",
  delayMicroseconds: "time",
  millis: "time",
  micros: "time",
  "Serial.print": "serial",
  "Serial.println": "serial",
};

export function parse(src: string): Program {
  const { toks, includes } = lex(src);
  let p = 0;
  const lits: Literal[] = [];
  const roles = new Map<number, Set<Role>>();
  const stmtAt = new Map<number, Stmt>();
  const funcAt = new Map<number, Func>();
  let scope = "";

  const peek = (o = 0) => toks[p + o]!;
  const next = () => toks[p++]!;
  const is = (v: string, o = 0) => {
    const t = peek(o);
    return (t.k === "op" || t.k === "id") && t.v === v;
  };
  const eat = (v: string) => {
    if (is(v)) return next();
    const t = peek();
    throw new LangError(
      t.k === "eof"
        ? `The code ends before a "${v}" it needs. Check for a missing closing bracket.`
        : `Line ${t.line}: expected "${v}" but found "${t.v}".${v === ";" ? " Every statement ends with a semicolon." : ""}`,
      t.line,
    );
  };
  const role = (line: number, r: Role) => {
    const s = roles.get(line);
    if (s) s.add(r);
    else roles.set(line, new Set([r]));
  };

  const isTypeStart = () => {
    let o = 0;
    while (peek(o).k === "id" && QUALIFIERS.has(peek(o).v)) o++;
    return peek(o).k === "id" && TYPE_WORDS.has(peek(o).v);
  };
  const parseType = () => {
    let isConst = false;
    const words: string[] = [];
    while (peek().k === "id" && (QUALIFIERS.has(peek().v) || TYPE_WORDS.has(peek().v))) {
      const w = next().v;
      if (w === "const") isConst = true;
      else if (!QUALIFIERS.has(w)) words.push(w);
    }
    if (is("*") || is("&")) throw new LangError(`Line ${peek().line}: pointers and references are beyond this page.`, peek().line);
    return { type: words.join(" "), isConst };
  };

  // Expressions, by C precedence.
  const BIN: string[][] = [
    ["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", "<=", ">", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"],
  ];
  const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="]);

  const expr = (): Expr => assign();
  const assign = (): Expr => {
    const left = ternary();
    if (peek().k === "op" && ASSIGN.has(peek().v)) {
      const op = next().v;
      if (left.k !== "id" && left.k !== "index") throw new LangError(`Line ${left.line}: can only assign to a variable.`, left.line);
      return { k: "assign", op, target: left, value: assign(), line: left.line };
    }
    return left;
  };
  const ternary = (): Expr => {
    const test = binary(0);
    if (is("?")) {
      next();
      const a = assign();
      eat(":");
      return { k: "cond", test, a, b: assign(), line: test.line };
    }
    return test;
  };
  const binary = (lvl: number): Expr => {
    if (lvl >= BIN.length) return unary();
    let a = binary(lvl + 1);
    while (peek().k === "op" && BIN[lvl]!.includes(peek().v)) {
      const op = next().v;
      a = { k: "bin", op, a, b: binary(lvl + 1), line: a.line };
    }
    return a;
  };
  const unary = (): Expr => {
    const t = peek();
    if (t.k === "op" && ["!", "-", "+", "~"].includes(t.v)) {
      next();
      return { k: "unary", op: t.v, x: unary(), line: t.line };
    }
    if (t.k === "op" && (t.v === "++" || t.v === "--")) {
      next();
      return { k: "update", op: t.v, prefix: true, target: unary(), line: t.line };
    }
    if (is("(") && peek(1).k === "id" && TYPE_WORDS.has(peek(1).v)) {
      next();
      const { type } = parseType();
      eat(")");
      return { k: "cast", type, x: unary(), line: t.line };
    }
    return postfix();
  };
  const postfix = (): Expr => {
    let e = primary();
    for (;;) {
      if (is("[")) {
        next();
        const idx = expr();
        eat("]");
        e = { k: "index", arr: e, idx, line: e.line };
      } else if (is("++") || is("--")) {
        e = { k: "update", op: next().v as "++" | "--", prefix: false, target: e, line: e.line };
      } else break;
    }
    return e;
  };
  const primary = (): Expr => {
    const t = next();
    if (t.k === "num") {
      const clean = t.v.replace(/[uUlLfF]+$/, "");
      const value = /^0[xX]/.test(clean) ? parseInt(clean, 16) : Number(clean);
      lits.push({ start: t.start, end: t.end, line: t.line, text: t.v, value, kind: "num", isFloat: /[.eE]/.test(clean) || /[fF]$/.test(t.v), scope });
      return { k: "lit", lit: lits.length - 1, line: t.line };
    }
    if (t.k === "str") return { k: "str", v: t.v, line: t.line };
    if (t.k === "char") return { k: "lit", lit: pushLit(t, t.v.charCodeAt(0) || 0, "num"), line: t.line };
    if (t.k === "id") {
      if (t.v === "HIGH" || t.v === "LOW") return { k: "lit", lit: pushLit(t, t.v === "HIGH" ? 1 : 0, "level"), line: t.line };
      if (t.v === "true" || t.v === "false") return { k: "lit", lit: pushLit(t, t.v === "true" ? 1 : 0, "bool"), line: t.line };
      let name = t.v;
      while (is(".") || is("::")) {
        next();
        name += "." + next().v;
      }
      if (is("(")) {
        next();
        const args: Expr[] = [];
        if (!is(")")) {
          do args.push(assign());
          while (is(",") && next());
        }
        eat(")");
        const r = ROLE_OF[name];
        if (r) role(t.line, r);
        return { k: "call", name, args, line: t.line };
      }
      return { k: "id", name, line: t.line };
    }
    if (t.k === "op" && t.v === "(") {
      const e = expr();
      eat(")");
      return e;
    }
    throw new LangError(
      t.k === "eof" ? "The code ends in the middle of something." : `Line ${t.line}: didn't expect "${t.v}" here.`,
      t.line,
    );
  };
  const pushLit = (t: Tok, value: number, kind: Literal["kind"]) => {
    lits.push({ start: t.start, end: t.end, line: t.line, text: t.v, value, kind, isFloat: false, scope });
    return lits.length - 1;
  };

  const initList = (): Init[] => {
    eat("{");
    const items: Init[] = [];
    while (!is("}")) {
      items.push(is("{") ? initList() : assign());
      if (!is("}")) eat(",");
    }
    eat("}");
    return items;
  };

  const declRest = (type: string, isConst: boolean, line: number, first: string): Stmt & { k: "decl" } => {
    const vars: Declarator[] = [];
    let name = first;
    for (;;) {
      const dims: Array<Expr | null> = [];
      while (is("[")) {
        next();
        dims.push(is("]") ? null : expr());
        eat("]");
      }
      let init: Declarator["init"];
      if (is("=")) {
        next();
        init = is("{") ? initList() : assign();
      }
      vars.push({ name, dims, init });
      if (!is(",")) break;
      next();
      name = next().v;
    }
    eat(";");
    return { k: "decl", type, isConst, vars, line };
  };

  const stmt = (): Stmt => {
    const t = peek();
    const line = t.line;
    let s: Stmt;
    if (is("{")) s = block();
    else if (is(";")) {
      next();
      s = { k: "empty", line };
    } else if (is("if")) {
      next();
      role(line, "control");
      eat("(");
      const test = expr();
      eat(")");
      const then = stmt();
      let els: Stmt | undefined;
      let elseLine: number | undefined;
      if (is("else")) {
        elseLine = next().line;
        role(elseLine, "control");
        els = stmt();
      }
      s = { k: "if", test, then, else: els, line, elseLine };
    } else if (is("while")) {
      next();
      role(line, "control");
      eat("(");
      const test = expr();
      eat(")");
      s = { k: "while", test, body: stmt(), line };
    } else if (is("do")) {
      next();
      role(line, "control");
      const body = stmt();
      eat("while");
      eat("(");
      const test = expr();
      eat(")");
      eat(";");
      s = { k: "do", test, body, line };
    } else if (is("for")) {
      next();
      role(line, "control");
      eat("(");
      let init: Stmt | undefined;
      if (is(";")) next();
      else if (isTypeStart()) {
        const ty = parseType();
        init = declRest(ty.type, ty.isConst, line, next().v);
      } else {
        init = { k: "expr", e: expr(), line };
        eat(";");
      }
      const test = is(";") ? undefined : expr();
      eat(";");
      const update = is(")") ? undefined : expr();
      eat(")");
      s = { k: "for", init, test, update, body: stmt(), line };
    } else if (is("return")) {
      next();
      role(line, "control");
      const e = is(";") ? undefined : expr();
      eat(";");
      s = { k: "return", e, line };
    } else if (is("break") || is("continue")) {
      const w = next().v as "break" | "continue";
      eat(";");
      s = { k: w, line };
    } else if (isTypeStart()) {
      const ty = parseType();
      s = declRest(ty.type, ty.isConst, line, next().v);
    } else {
      const e = expr();
      eat(";");
      s = { k: "expr", e, line };
    }
    // A control statement owns its header line even when a statement shares
    // it ("if (x) y();"): the check is what the line is about.
    if (s.k === "if" || s.k === "while" || s.k === "for" || s.k === "do") stmtAt.set(line, s);
    else if (s.k !== "block" && !stmtAt.has(line)) stmtAt.set(line, s);
    return s;
  };

  const block = (): Stmt & { k: "block" } => {
    const line = eat("{").line;
    const body: Stmt[] = [];
    while (!is("}")) {
      if (peek().k === "eof") throw new LangError("A { is never closed with a matching }.", line);
      body.push(stmt());
    }
    const endLine = next().line;
    return { k: "block", body, line, endLine };
  };

  const globals: Array<Stmt & { k: "decl" }> = [];
  const funcs = new Map<string, Func>();
  while (peek().k !== "eof") {
    if (!isTypeStart()) {
      const t = peek();
      throw new LangError(
        `Line ${t.line}: "${t.v}" can't go here. Outside a function, only variables and functions are allowed.`,
        t.line,
      );
    }
    const line = peek().line;
    const ty = parseType();
    const name = next().v;
    if (is("(")) {
      next();
      const params: Func["params"] = [];
      if (!is(")") && !(is("void") && peek(1).v === ")")) {
        do {
          const pt = parseType();
          const pn = next().v;
          let dims = 0;
          while (is("[")) {
            next();
            if (!is("]")) expr();
            eat("]");
            dims++;
          }
          params.push({ name: pn, type: pt.type, dims });
        } while (is(",") && next());
      } else if (is("void")) next();
      eat(")");
      if (is(";")) {
        next(); // a prototype; the definition comes later
        continue;
      }
      scope = name;
      const body = block();
      scope = "";
      const fn: Func = { name, type: ty.type, params, body, line };
      funcs.set(name, fn);
      funcAt.set(line, fn);
    } else {
      const d = declRest(ty.type, ty.isConst, line, name);
      globals.push(d);
      stmtAt.set(line, d);
    }
  }
  if (!funcs.has("setup")) throw new LangError("There's no setup() function. Every sketch needs one, even if it's empty.", 1);
  if (!funcs.has("loop")) throw new LangError("There's no loop() function. Every sketch needs one, even if it's empty.", 1);
  return { globals, funcs, lits, roles, stmtAt, funcAt, includes };
}

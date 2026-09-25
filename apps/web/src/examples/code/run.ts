// Runs a parsed sketch one statement at a time.
//
// The interpreter is a generator: it yields before every statement (so the
// page can highlight the line and pace it) and at every delay (so the page
// can let simulated time pass). Everything the sketch does to the world
// goes through a Host — pins, time, the serial line — and everything the
// page shows about the sketch's own state (the value beside a line, which
// pin a line touched) goes through the same Host, as notes.

import { LangError, type Expr, type Func, type Init, type Program, type Stmt } from "./lang.js";

export type Step =
  | { k: "line"; line: number; fn: string }
  | { k: "delay"; ms: number; line: number };

export interface Host {
  lit(i: number): number;
  pinMode(gpio: number, mode: string, line: number): void;
  digitalWrite(gpio: number, level: number, line: number): void;
  analogWrite(gpio: number, duty: number, line: number): void;
  digitalRead(gpio: number, line: number): number;
  analogRead(gpio: number, line: number): number;
  millis(): number;
  print(text: string, newline: boolean, line: number): void;
  /** The value worth showing beside a line after it runs. */
  note(line: number, text: string): void;
}

type Val = number | string | Val[];

interface Var {
  type: string;
  value: Val;
}

class Scope {
  vars = new Map<string, Var>();
  constructor(public parent: Scope | null) {}
  find(name: string): Var | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return v;
    }
    return undefined;
  }
}

type Done = { k: "normal" } | { k: "break" } | { k: "continue" } | { k: "return"; value?: Val };
const NORMAL: Done = { k: "normal" };

const CONSTS: Record<string, number> = {
  INPUT: 1,
  OUTPUT: 3,
  INPUT_PULLUP: 5,
  INPUT_PULLDOWN: 9,
  LED_BUILTIN: 2,
  PI: Math.PI,
};
export const MODE_NAMES: Record<number, string> = { 1: "INPUT", 3: "OUTPUT", 5: "INPUT_PULLUP", 9: "INPUT_PULLDOWN" };

const INT_TYPES = /^(int|long|short|byte|char|word|bool|boolean|unsigned|signed|u?int\d+_t|size_t)/;
const isIntType = (t: string) => INT_TYPES.test(t);

export class Machine {
  global = new Scope(null);
  lap = 0;
  /** The line in setup() or loop() currently running, for the track. */
  topLine = 0;
  phase: "start" | "setup" | "loop" = "start";
  private depth = 0;

  constructor(
    public prog: Program,
    private host: Host,
  ) {}

  /** The whole life of the board: globals, setup once, loop forever. */
  *run(): Generator<Step, void, void> {
    for (const d of this.prog.globals) yield* this.decl(d, this.global);
    this.phase = "setup";
    yield* this.call(this.prog.funcs.get("setup")!, [], 0);
    this.phase = "loop";
    for (;;) {
      this.lap++;
      yield* this.call(this.prog.funcs.get("loop")!, [], 0);
    }
  }

  /** A global's current value, for panels that watch a sketch's state. */
  peek(name: string): Val | undefined {
    return this.global.find(name)?.value;
  }

  // ── Statements ───────────────────────────────────────────────────────

  private *exec(s: Stmt, env: Scope, fn: string): Generator<Step, Done, void> {
    if (s.k !== "block" && s.k !== "empty") {
      if (this.depth === 1) this.topLine = s.line;
      yield { k: "line", line: s.line, fn };
    }
    switch (s.k) {
      case "block": {
        const inner = new Scope(env);
        for (const b of s.body) {
          const r = yield* this.exec(b, inner, fn);
          if (r.k !== "normal") return r;
        }
        return NORMAL;
      }
      case "empty":
        return NORMAL;
      case "decl":
        yield* this.decl(s, env);
        return NORMAL;
      case "expr": {
        const v = yield* this.eval(s.e, env);
        if (s.e.k === "assign" || s.e.k === "update") this.host.note(s.line, `${exprName(s.e.target)} = ${show(this.read(s.e.target, env))}`);
        else if (s.e.k === "call" && s.e.name === "analogRead") this.host.note(s.line, show(v));
        return NORMAL;
      }
      case "if": {
        const c = yield* this.test(s.test, env, s.line);
        if (c) return yield* this.exec(s.then, env, fn);
        if (s.else) {
          if (s.elseLine) yield { k: "line", line: s.elseLine, fn };
          return yield* this.exec(s.else, env, fn);
        }
        return NORMAL;
      }
      case "while":
        for (;;) {
          if (!(yield* this.test(s.test, env, s.line))) return NORMAL;
          const r = yield* this.exec(s.body, env, fn);
          if (r.k === "break") return NORMAL;
          if (r.k === "return") return r;
          // Back to the top to check again: always a step, so even an empty
          // waiting loop can be watched and never freezes the page.
          yield { k: "line", line: s.line, fn };
        }
      case "do":
        for (;;) {
          const r = yield* this.exec(s.body, env, fn);
          if (r.k === "break") return NORMAL;
          if (r.k === "return") return r;
          yield { k: "line", line: s.line, fn };
          if (!(yield* this.test(s.test, env, s.line))) return NORMAL;
        }
      case "for": {
        const inner = new Scope(env);
        if (s.init) {
          if (s.init.k === "decl") yield* this.decl(s.init, inner);
          else yield* this.eval((s.init as Stmt & { k: "expr" }).e, inner);
        }
        for (;;) {
          if (s.test && !(yield* this.test(s.test, inner, s.line))) return NORMAL;
          const r = yield* this.exec(s.body, inner, fn);
          if (r.k === "break") return NORMAL;
          if (r.k === "return") return r;
          yield { k: "line", line: s.line, fn };
          if (s.update) {
            yield* this.eval(s.update, inner);
            const u = s.update;
            if (u.k === "update" || u.k === "assign") this.host.note(s.line, `${exprName(u.target)} = ${show(this.read(u.target, inner))}`);
          }
        }
      }
      case "return":
        return { k: "return", value: s.e ? yield* this.eval(s.e, env) : undefined };
      case "break":
        return { k: "break" };
      case "continue":
        return { k: "continue" };
    }
  }

  /** A condition, noted beside its line as the reader would check it. */
  private *test(e: Expr, env: Scope, line: number): Generator<Step, boolean, void> {
    if (e.k === "bin" && ["==", "!=", "<", "<=", ">", ">="].includes(e.op)) {
      const a = yield* this.eval(e.a, env);
      const b = yield* this.eval(e.b, env);
      const r = compare(e.op, a, b);
      this.host.note(line, `${this.showAs(e.a, a)} ${e.op} ${this.showAs(e.b, b)} → ${r}`);
      return r;
    }
    const v = yield* this.eval(e, env);
    const r = truthy(v);
    this.host.note(line, `${r}`);
    return r;
  }

  private *decl(s: Stmt & { k: "decl" }, env: Scope): Generator<Step, void, void> {
    for (const d of s.vars) {
      let value: Val;
      if (d.dims.length) {
        const dims: number[] = [];
        for (const de of d.dims) dims.push(de ? Number(yield* this.eval(de, env)) : -1);
        const init = Array.isArray(d.init) ? yield* this.initList(d.init, env) : [];
        value = shape(dims, init);
      } else if (d.init && !Array.isArray(d.init)) {
        value = coerce(s.type, yield* this.eval(d.init, env));
      } else value = s.type === "String" ? "" : 0;
      env.vars.set(d.name, { type: s.type, value });
      if (!d.dims.length && d.init) this.host.note(s.line, `${d.name} = ${show(value)}`);
    }
  }

  private *initList(items: Init[], env: Scope): Generator<Step, Val[], void> {
    const out: Val[] = [];
    for (const it of items) out.push(Array.isArray(it) ? yield* this.initList(it, env) : yield* this.eval(it, env));
    return out;
  }

  private *call(fn: Func, args: Val[], line: number): Generator<Step, Val | undefined, void> {
    if (this.depth > 60) throw new LangError(`${fn.name}() calls itself too deeply.`, line);
    const env = new Scope(this.global);
    fn.params.forEach((p, i) => env.vars.set(p.name, { type: p.type, value: args[i] ?? 0 }));
    this.depth++;
    try {
      const r = yield* this.exec(fn.body, env, fn.name);
      return r.k === "return" ? r.value : undefined;
    } finally {
      this.depth--;
    }
  }

  // ── Expressions ──────────────────────────────────────────────────────

  private *eval(e: Expr, env: Scope): Generator<Step, Val, void> {
    switch (e.k) {
      case "lit":
        return this.host.lit(e.lit);
      case "str":
        return e.v;
      case "id": {
        const v = env.find(e.name);
        if (v) return v.value;
        if (e.name in CONSTS) return CONSTS[e.name]!;
        throw new LangError(`Line ${e.line}: "${e.name}" hasn't been created. Check the spelling, or declare it first.`, e.line);
      }
      case "index": {
        const arr = yield* this.eval(e.arr, env);
        const i = Number(yield* this.eval(e.idx, env));
        if (!Array.isArray(arr)) throw new LangError(`Line ${e.line}: ${exprName(e.arr)} isn't a list.`, e.line);
        if (i < 0 || i >= arr.length) throw new LangError(`Line ${e.line}: position ${i} is outside ${exprName(e.arr)}, which has ${arr.length}.`, e.line);
        return arr[i]!;
      }
      case "cast": {
        const v = yield* this.eval(e.x, env);
        return coerce(e.type, v);
      }
      case "unary": {
        const v = yield* this.eval(e.x, env);
        if (e.op === "!") return truthy(v) ? 0 : 1;
        if (e.op === "-") return -Number(v);
        if (e.op === "~") return ~Number(v);
        return Number(v);
      }
      case "cond":
        return truthy(yield* this.eval(e.test, env)) ? yield* this.eval(e.a, env) : yield* this.eval(e.b, env);
      case "bin": {
        if (e.op === "&&") return truthy(yield* this.eval(e.a, env)) && truthy(yield* this.eval(e.b, env)) ? 1 : 0;
        if (e.op === "||") return truthy(yield* this.eval(e.a, env)) || truthy(yield* this.eval(e.b, env)) ? 1 : 0;
        const a = yield* this.eval(e.a, env);
        const b = yield* this.eval(e.b, env);
        return arith(e.op, a, b, !this.isFloat(e.a, env) && !this.isFloat(e.b, env), e.line);
      }
      case "assign": {
        let v = yield* this.eval(e.value, env);
        if (e.op !== "=") {
          const cur = this.read(e.target, env);
          v = arith(e.op.slice(0, -1), cur, v, !this.isFloat(e.target, env) && !this.isFloat(e.value, env), e.line);
        }
        yield* this.write(e.target, env, v);
        return this.read(e.target, env);
      }
      case "update": {
        const cur = Number(this.read(e.target, env));
        const nv = e.op === "++" ? cur + 1 : cur - 1;
        yield* this.write(e.target, env, nv);
        return e.prefix ? nv : cur;
      }
      case "call":
        return yield* this.callExpr(e, env);
    }
  }

  /** A value shown the way the code talks about it: HIGH/LOW for a level. */
  private showAs(e: Expr, v: Val): string {
    const level = (e.k === "call" && e.name === "digitalRead") || (e.k === "lit" && this.prog.lits[e.lit]!.kind === "level");
    return level ? (Number(v) ? "HIGH" : "LOW") : show(v);
  }

  private isFloat(e: Expr, env: Scope): boolean {
    switch (e.k) {
      case "lit":
        return this.prog.lits[e.lit]!.isFloat;
      case "id": {
        const v = env.find(e.name);
        return !!v && !isIntType(v.type);
      }
      case "index":
        return this.isFloat(e.arr, env);
      case "cast":
        return !isIntType(e.type);
      case "unary":
        return this.isFloat(e.x, env);
      case "bin":
        return ["+", "-", "*", "/", "%"].includes(e.op) && (this.isFloat(e.a, env) || this.isFloat(e.b, env));
      case "cond":
        return this.isFloat(e.a, env) || this.isFloat(e.b, env);
      case "assign":
      case "update":
        return this.isFloat(e.target, env);
      case "call":
        return ["sqrt", "sin", "cos", "pow", "sq"].includes(e.name) || (["abs", "min", "max", "constrain"].includes(e.name) && e.args.some((a) => this.isFloat(a, env)));
      default:
        return false;
    }
  }

  private read(t: Expr, env: Scope): Val {
    if (t.k === "id") {
      const v = env.find(t.name);
      if (!v) throw new LangError(`Line ${t.line}: "${t.name}" hasn't been created.`, t.line);
      return v.value;
    }
    if (t.k === "index") {
      const arr = this.read(t.arr, env);
      // An index inside a read-back is already evaluated once; recompute
      // cheaply, since it has no side effects in any sketch this page runs.
      const i = Number(evalPure(t.idx, env, this.host, this.prog));
      return Array.isArray(arr) ? arr[i]! : 0;
    }
    return 0;
  }

  private *write(t: Expr, env: Scope, v: Val): Generator<Step, void, void> {
    if (t.k === "id") {
      const cell = env.find(t.name);
      if (!cell) throw new LangError(`Line ${t.line}: "${t.name}" hasn't been created. Declare it first, like: int ${t.name} = 0;`, t.line);
      cell.value = coerce(cell.type, v);
      return;
    }
    if (t.k === "index") {
      const arr = t.arr.k === "id" ? env.find(t.arr.name) : undefined;
      const i = Number(yield* this.eval(t.idx, env));
      const target = arr ? arr.value : this.read(t.arr, env);
      if (!Array.isArray(target) || i < 0 || i >= target.length) throw new LangError(`Line ${t.line}: that position is outside the list.`, t.line);
      target[i] = arr ? coerce(arr.type, v) : v;
    }
  }

  private *callExpr(e: Expr & { k: "call" }, env: Scope): Generator<Step, Val, void> {
    const args: Val[] = [];
    for (const a of e.args) args.push(yield* this.eval(a, env));
    const n = (i: number) => Number(args[i] ?? 0);
    const h = this.host;
    switch (e.name) {
      case "pinMode":
        h.pinMode(n(0), MODE_NAMES[n(1)] ?? "INPUT", e.line);
        return 0;
      case "digitalWrite":
        h.digitalWrite(n(0), truthy(args[1] ?? 0) ? 1 : 0, e.line);
        return 0;
      case "analogWrite":
        h.analogWrite(n(0), n(1), e.line);
        return 0;
      case "digitalRead":
        return h.digitalRead(n(0), e.line);
      case "analogRead":
        return h.analogRead(n(0), e.line);
      case "delay":
        yield { k: "delay", ms: Math.max(0, n(0)), line: e.line };
        return 0;
      case "delayMicroseconds":
        yield { k: "delay", ms: Math.max(0, n(0)) / 1000, line: e.line };
        return 0;
      case "millis":
        return Math.floor(h.millis());
      case "micros":
        return Math.floor(h.millis() * 1000);
      case "Serial.begin":
        return 0;
      case "Serial.print":
      case "Serial.println":
        h.print(args.length ? show(args[0]!, true) : "", e.name === "Serial.println", e.line);
        return 0;
      case "abs":
        return Math.abs(n(0));
      case "min":
        return Math.min(n(0), n(1));
      case "max":
        return Math.max(n(0), n(1));
      case "constrain":
        return Math.min(Math.max(n(0), n(1)), n(2));
      case "map":
        return Math.trunc(((n(0) - n(1)) * (n(4) - n(3))) / (n(2) - n(1)) + n(3));
      case "sq":
        return n(0) * n(0);
      case "sqrt":
        return Math.sqrt(n(0));
      case "pow":
        return Math.pow(n(0), n(1));
      case "random":
        return args.length > 1 ? Math.floor(n(0) + Math.random() * (n(1) - n(0))) : Math.floor(Math.random() * n(0));
      case "randomSeed":
        return 0;
    }
    const fn = this.prog.funcs.get(e.name);
    if (fn) return (yield* this.call(fn, args, e.line)) ?? 0;
    const lib = e.name.split(".")[0];
    throw new LangError(
      e.name.includes(".")
        ? `Line ${e.line}: ${e.name}() comes from the ${lib} library, which this page doesn't simulate.`
        : `Line ${e.line}: there's no function called ${e.name}(). Check the spelling, or define it.`,
      e.line,
    );
  }
}

// ── Values ─────────────────────────────────────────────────────────────

function truthy(v: Val): boolean {
  return typeof v === "string" ? v.length > 0 : Array.isArray(v) ? true : v !== 0;
}

function compare(op: string, a: Val, b: Val): boolean {
  const x = Number(a);
  const y = Number(b);
  switch (op) {
    case "==":
      return typeof a === "string" || typeof b === "string" ? String(a) === String(b) : x === y;
    case "!=":
      return x !== y;
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    default:
      return x >= y;
  }
}

function arith(op: string, a: Val, b: Val, ints: boolean, line: number): Val {
  if (op === "+" && (typeof a === "string" || typeof b === "string")) return show(a, true) + show(b, true);
  const x = Number(a);
  const y = Number(b);
  switch (op) {
    case "+":
      return x + y;
    case "-":
      return x - y;
    case "*":
      return x * y;
    case "/":
      if (y === 0) throw new LangError(`Line ${line}: dividing by zero. On the real board this gives nonsense or a crash.`, line);
      return ints ? Math.trunc(x / y) : x / y;
    case "%":
      return y === 0 ? 0 : x % y;
    case "&":
      return x & y;
    case "|":
      return x | y;
    case "^":
      return x ^ y;
    case "<<":
      return x << y;
    case ">>":
      return x >> y;
    default:
      return compare(op, a, b) ? 1 : 0;
  }
}

function coerce(type: string, v: Val): Val {
  if (Array.isArray(v) || typeof v === "string") return v;
  if (/^(bool|boolean)$/.test(type)) return v !== 0 ? 1 : 0;
  if (/^byte$|^uint8_t$/.test(type)) return Math.trunc(v) & 0xff;
  if (isIntType(type)) return Math.trunc(v);
  return v;
}

function shape(dims: number[], init: Val[]): Val[] {
  const [d, ...rest] = dims;
  const len = d! < 0 ? init.length : d!;
  return Array.from({ length: len }, (_, i) => {
    const item = init[i];
    if (rest.length) return shape(rest, Array.isArray(item) ? item : []);
    return item === undefined || Array.isArray(item) ? 0 : item;
  });
}

export function show(v: Val, raw = false): string {
  if (Array.isArray(v)) return `{${v.map((x) => show(x)).join(", ")}}`;
  if (typeof v === "string") return raw ? v : `"${v}"`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function exprName(e: Expr): string {
  if (e.k === "id") return e.name;
  if (e.k === "index") return `${exprName(e.arr)}[…]`;
  return "value";
}

/** Evaluate an expression with no statements inside it, synchronously. */
function evalPure(e: Expr, env: Scope, host: Host, prog: Program): Val {
  switch (e.k) {
    case "lit":
      return host.lit(e.lit);
    case "id":
      return env.find(e.name)?.value ?? CONSTS[e.name] ?? 0;
    case "bin":
      return arith(e.op, evalPure(e.a, env, host, prog), evalPure(e.b, env, host, prog), true, e.line);
    case "unary":
      return e.op === "-" ? -Number(evalPure(e.x, env, host, prog)) : evalPure(e.x, env, host, prog);
    default:
      return 0;
  }
}

// Each line of a sketch, said in plain words.
//
// A small rule set over the statements the parser found, not a general
// translator: it knows the handful of calls and shapes beginner sketches are
// made of and says nothing about the rest. A blank is better than a wrong
// sentence.

import type { Expr, Program, Stmt } from "./lang.js";

export function explain(prog: Program): Map<number, string> {
  const out = new Map<number, string>();
  for (const [line, fn] of prog.funcAt) {
    out.set(
      line,
      fn.name === "setup"
        ? "When the board powers on, do this once:"
        : fn.name === "loop"
          ? "Then do this, over and over, for as long as it has power:"
          : `A recipe called ${fn.name}, used by the code below.`,
    );
  }
  for (const [line, s] of prog.stmtAt) {
    const text = stmt(s, prog);
    if (text) out.set(line, text);
    if (s.k === "if" && s.elseLine) out.set(s.elseLine, "Otherwise:");
  }
  return out;
}

function stmt(s: Stmt, prog: Program): string | null {
  switch (s.k) {
    case "decl": {
      const d = s.vars[0]!;
      if (d.dims.length) return `A list of numbers called ${d.name}.`;
      if (d.init && !Array.isArray(d.init)) {
        const call = d.init.k === "call" ? callWords(d.init, prog, d.name) : null;
        if (call) return call;
        if (s.isConst) return `Call ${words(d.init, prog)} "${d.name}", so the code reads better.`;
        return `Make a number called ${d.name}, starting at ${words(d.init, prog)}.`;
      }
      return `Make a number called ${d.name}.`;
    }
    case "expr":
      return exprStmt(s.e, prog);
    case "if":
      return `Check: ${cond(s.test, prog)}? If so:`;
    case "while":
      return s.body.k === "empty" || (s.body.k === "block" && !s.body.body.length)
        ? `Wait here, doing nothing, while ${cond(s.test, prog)}.`
        : `Keep repeating this while ${cond(s.test, prog)}:`;
    case "for": {
      if (s.init?.k === "decl" && s.test?.k === "bin" && s.update) {
        const v = s.init.vars[0]!;
        const from = v.init && !Array.isArray(v.init) ? words(v.init, prog) : "0";
        const to = words(s.test.b, prog);
        const stepping = s.update.k === "update" && s.update.op === "--" ? "down" : "up";
        return `Count ${v.name} ${stepping} from ${from} while ${v.name} ${opWords(s.test.op)} ${to}, doing this each time:`;
      }
      return "Repeat this:";
    }
    case "return":
      return s.e ? `Hand back ${words(s.e, prog)}.` : "Stop here and go back.";
    case "break":
      return "Leave the loop now.";
    default:
      return null;
  }
}

function exprStmt(e: Expr, prog: Program): string | null {
  if (e.k === "call") return callWords(e, prog, null);
  if (e.k === "assign") {
    const name = words(e.target, prog);
    if (e.value.k === "unary" && e.value.op === "!" && words(e.value.x, prog) === name) return `Flip ${name}: true becomes false, false becomes true.`;
    if (e.value.k === "call") {
      const c = callWords(e.value, prog, name);
      if (c) return c;
    }
    if (e.op === "+=") return `Add ${words(e.value, prog)} to ${name}.`;
    if (e.op === "-=") return `Take ${words(e.value, prog)} away from ${name}.`;
    return `Set ${name} to ${words(e.value, prog)}.`;
  }
  if (e.k === "update") return `${e.op === "++" ? "Add one to" : "Take one from"} ${words(e.target, prog)}.`;
  return null;
}

function callWords(e: Expr & { k: "call" }, prog: Program, into: string | null): string | null {
  const a = (i: number) => (e.args[i] ? words(e.args[i]!, prog) : "");
  const keep = into ? ` and keep it in ${into}` : "";
  switch (e.name) {
    case "pinMode": {
      const mode = a(1);
      if (mode === "OUTPUT") return `Get pin ${a(0)} ready to send power out.`;
      if (mode === "INPUT_PULLDOWN") return `Get pin ${a(0)} ready to listen, held LOW until something pushes it HIGH.`;
      if (mode === "INPUT_PULLUP") return `Get pin ${a(0)} ready to listen, held HIGH until something pulls it LOW.`;
      return `Get pin ${a(0)} ready to listen.`;
    }
    case "digitalWrite": {
      const lvl = a(1);
      if (lvl === "HIGH" || lvl === "true" || lvl === "1") return `Switch pin ${a(0)} on: 3.3 volts out.`;
      if (lvl === "LOW" || lvl === "false" || lvl === "0") return `Switch pin ${a(0)} off: 0 volts.`;
      return `Switch pin ${a(0)} on or off, depending on ${lvl}.`;
    }
    case "analogWrite":
      return `Flicker pin ${a(0)} on and off, on for ${a(1)} out of every 255 moments.`;
    case "digitalRead":
      return `Check whether pin ${a(0)} is HIGH or LOW${keep}.`;
    case "analogRead":
      return `Measure the voltage on pin ${a(0)} as a number from 0 to 4095${keep}.`;
    case "delay":
      return `Wait ${a(0)} milliseconds. Nothing else happens meanwhile.`;
    case "millis":
      return `Look at the clock: milliseconds since power-on${keep}.`;
    case "Serial.begin":
      return `Open the line to the computer, at ${a(0)} bits a second.`;
    case "Serial.print":
    case "Serial.println":
      return `Send ${a(0) || "a blank line"} to the computer${e.name === "Serial.println" ? ", then start a new line" : ""}.`;
    default:
      return prog.funcs.has(e.name) ? `Do the ${e.name} recipe${e.args.length ? ` with ${e.args.map((x) => words(x, prog)).join(", ")}` : ""}.` : null;
  }
}

function cond(e: Expr, prog: Program): string {
  if (e.k === "bin") {
    if (e.op === "&&") return `${cond(e.a, prog)} and ${cond(e.b, prog)}`;
    if (e.op === "||") return `${cond(e.a, prog)} or ${cond(e.b, prog)}`;
    if (e.a.k === "call" && e.a.name === "digitalRead") return `pin ${words(e.a.args[0]!, prog)} ${e.op === "!=" ? "isn't" : "is"} ${words(e.b, prog)}`;
    return `${words(e.a, prog)} ${opWords(e.op)} ${words(e.b, prog)}`;
  }
  if (e.k === "unary" && e.op === "!") return `${words(e.x, prog)} is false`;
  return `${words(e, prog)} is true`;
}

function opWords(op: string): string {
  return (
    { "==": "is", "!=": "isn't", "<": "is less than", "<=": "is at most", ">": "is more than", ">=": "is at least" } as Record<string, string>
  )[op] ?? op;
}

/** An expression, mostly as written: names stay names. */
function words(e: Expr, prog: Program): string {
  switch (e.k) {
    case "lit":
      return prog.lits[e.lit]!.text;
    case "str":
      return `"${e.v}"`;
    case "id":
      return e.name;
    case "index":
      return `${words(e.arr, prog)}[${words(e.idx, prog)}]`;
    case "call":
      return `${e.name}(${e.args.map((a) => words(a, prog)).join(", ")})`;
    case "unary":
      return `${e.op}${words(e.x, prog)}`;
    case "bin":
      return `${words(e.a, prog)} ${e.op} ${words(e.b, prog)}`;
    case "cast":
      return words(e.x, prog);
    default:
      return "…";
  }
}

// A sketch running on a simulated board.
//
// Holds the interpreter, the circuit it drives, and simulated time, and
// implements the interpreter's Host against the wiring example's analysis:
// a pin the sketch writes becomes a pin state; a pin it reads is answered
// from the circuit.
//
// Pacing. "Step" advances one line per click with the clock stopped. "Slow"
// and "Fast" spend a fixed stretch of real time on every line, with the
// clock running at real speed, so millis() and delay() still mean what they
// say. "Real time" runs lines at roughly microcontroller speed.
//
// Persistence of vision. In real time a multiplexing sketch switches pins
// hundreds of times a second. Each frame, the runner totals how long each
// pin configuration lasted and shows every LED at its time-weighted
// brightness — which is what an eye sees. Slowed down, the flashing shows.

import { analyze, type Analysis, type LedResult } from "../wiring/analyze.js";
import { ADC_GPIOS, BOARD_PULLUPS, PINS, type NodeId, type Part, type PinState } from "../wiring/model.js";
import { LangError, type Literal, type Program } from "./lang.js";
import { Machine, type Host, type Step } from "./run.js";
import type { CodeStats } from "./sketches.js";

export type Speed = "step" | "slow" | "fast" | "real";

const LINE_MS: Record<Speed, number> = { step: 0, slow: 550, fast: 60, real: 0 };
/** Simulated cost of one line in real time: tens of microseconds. Slower
 *  than the chip, but fast beside anything a person can do. */
const LINE_COST = 0.02;
const MAX_LINES_PER_FRAME = 60_000;

export interface IoMark {
  gpio: number;
  pin: NodeId | null;
  dir: "out" | "in" | "mode";
  at: number;
}

export interface SerialLine {
  text: string;
  line: number;
  at: number;
}

export interface Missed {
  line: number;
  pin: NodeId;
  at: number;
}

const pinOfGpio = new Map(PINS.filter((p) => p.gpio !== undefined).map((p) => [p.gpio!, p.id]));

export class Runner {
  machine!: Machine;
  private gen!: Generator<Step, void, void>;

  // The world.
  parts: Part[];
  pressed = new Set<string>();
  burnt = new Set<string>();
  pins = new Map<NodeId, PinState>();
  private key = "";
  private cache = new Map<string, Analysis>();
  /** The pin states behind each configuration key seen this frame. */
  private snaps = new Map<string, Map<NodeId, PinState>>();

  // Time.
  speed: Speed = "slow";
  paused = false;
  simMs = 0;
  private waitUntil: number | null = null;
  delayLine: number | null = null;
  private delayStart = 0;
  private delayMs = 0;
  private budget = 0;

  // What the page shows.
  line = 0;
  notes = new Map<number, { text: string; at: number }>();
  io = new Map<number, IoMark[]>();
  serial: SerialLine[] = [];
  private partial: SerialLine | null = null;
  missed: Missed[] = [];
  error: LangError | null = null;
  popping = new Set<string>();
  stats!: CodeStats;

  private lastRead = new Map<number, number>();
  private flaggedThisDelay = new Set<number>();
  private weights = new Map<string, number>();
  private lastChange = 0;
  private wasLit = new Map<string, boolean>();
  private sweep = { armed: false, dirty: false, last: 0 };
  /** The line the code keeps returning to without moving on, and since when. */
  private stall = { line: 0, since: 0 };
  display: Analysis;

  constructor(
    public prog: Program,
    public lits: Literal[],
    parts: Part[],
  ) {
    this.parts = parts;
    this.reset();
    this.display = this.analysis();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  reset() {
    this.pins = new Map();
    this.key = "";
    this.burnt = new Set();
    this.cache.clear();
    this.snaps = new Map();
    this.simMs = 0;
    this.waitUntil = null;
    this.delayLine = null;
    this.budget = 0;
    this.line = 0;
    this.notes = new Map();
    this.io = new Map();
    this.serial = [];
    this.partial = null;
    this.missed = [];
    this.error = null;
    this.lastRead = new Map();
    this.weights = new Map();
    this.lastChange = 0;
    this.wasLit = new Map();
    this.sweep = { armed: false, dirty: false, last: 0 };
    this.stall = { line: 0, since: 0 };
    this.stats = { simMs: 0, stallMs: 0, ledFlips: 0, seen: {}, lastFloat: 0, readsSinceFloat: 0, cleanSweeps: 0, missed: 0, printed: [] };
    this.machine = new Machine(this.prog, this.host);
    this.gen = this.machine.run();
  }

  /** Swap in a new program (after an edit) and start it from power-on. */
  load(prog: Program, lits: Literal[]) {
    this.prog = prog;
    this.lits = lits;
    this.reset();
  }

  setParts(parts: Part[]) {
    this.parts = parts;
    this.invalidate();
  }

  setPressed(id: string, down: boolean) {
    if (down) this.pressed.add(id);
    else this.pressed.delete(id);
    this.invalidate();
    this.checkMissed();
  }

  replace(id: string) {
    this.burnt = new Set([...this.burnt].filter((b) => b !== id && !b.startsWith(`${id}:`)));
    this.invalidate();
  }

  private invalidate() {
    this.cache.clear();
  }

  // ── Running ──────────────────────────────────────────────────────────

  /** Advance by one animation frame of `dt` real milliseconds. */
  tick(dt: number) {
    if (this.error || this.paused || this.speed === "step") {
      this.endFrame();
      return;
    }
    dt = Math.min(dt, 100);
    try {
      if (this.speed === "real") {
        const target = this.simMs + dt;
        let n = 0;
        while (this.simMs < target) {
          if (this.waitUntil !== null) {
            if (this.waitUntil <= target) {
              this.advanceTo(this.waitUntil);
              this.endDelay();
            } else {
              this.advanceTo(target);
              break;
            }
            continue;
          }
          this.advance();
          this.simMs += LINE_COST;
          if (++n > MAX_LINES_PER_FRAME) {
            this.advanceTo(target);
            break;
          }
        }
      } else {
        this.advanceTo(this.simMs + dt);
        if (this.waitUntil !== null) {
          if (this.simMs >= this.waitUntil) this.endDelay();
          else {
            this.checkMissed();
            this.endFrame();
            return;
          }
        }
        this.budget += dt;
        while (this.budget >= LINE_MS[this.speed] && this.waitUntil === null) {
          this.budget -= LINE_MS[this.speed];
          this.advance();
        }
        if (this.waitUntil !== null) this.budget = 0;
      }
    } catch (e) {
      this.fail(e);
    }
    this.checkMissed();
    this.endFrame();
  }

  /** One line, with the clock stopped: the Step button. */
  stepOnce() {
    try {
      if (this.waitUntil !== null) {
        this.advanceTo(this.waitUntil);
        this.endDelay();
      }
      this.advance();
      this.simMs += LINE_COST;
    } catch (e) {
      this.fail(e);
    }
    this.endFrame();
  }

  private advance() {
    const r = this.gen.next();
    if (r.done) return;
    const s = r.value;
    // A loop spinning on one line — waiting, not delaying — is a stall.
    if (s.k === "line" && s.line === this.stall.line) {
      this.stats.stallMs = Math.max(this.stats.stallMs, this.simMs - this.stall.since);
    } else this.stall = { line: s.k === "line" ? s.line : 0, since: this.simMs };
    this.line = s.line;
    if (s.k === "delay") {
      this.waitUntil = this.simMs + s.ms;
      this.delayLine = s.line;
      this.delayStart = this.simMs;
      this.delayMs = s.ms;
      this.flaggedThisDelay.clear();
    }
  }

  private advanceTo(t: number) {
    this.simMs = Math.max(this.simMs, t);
  }

  private endDelay() {
    this.waitUntil = null;
    this.delayLine = null;
  }

  /** How far through the current delay, 0–1, or null. */
  delayProgress(): number | null {
    if (this.waitUntil === null) return null;
    return this.delayMs <= 0 ? 1 : Math.min(1, (this.simMs - this.delayStart) / this.delayMs);
  }

  private fail(e: unknown) {
    this.error = e instanceof LangError ? e : new LangError(String((e as Error)?.message ?? e), this.line);
  }

  // ── The circuit ──────────────────────────────────────────────────────

  private keyOf(pins: Map<NodeId, PinState>) {
    return [...pins.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, s]) => `${id}:${s.mode}${"level" in s ? s.level : ""}${"duty" in s ? s.duty : ""}`)
      .join("|");
  }

  analysis(key = this.key, pins = this.pins): Analysis {
    let a = this.cache.get(key);
    if (!a) {
      a = analyze({ parts: this.parts, pins: new Map(pins), pressed: this.pressed, burnt: this.burnt });
      this.cache.set(key, a);
      if (this.cache.size > 400) this.cache.clear();
    }
    return a;
  }

  private setPin(id: NodeId, s: PinState) {
    const old = this.key;
    this.weights.set(old, (this.weights.get(old) ?? 0) + (this.simMs - this.lastChange));
    this.lastChange = this.simMs;
    this.pins.set(id, s);
    this.key = this.keyOf(this.pins);
    if (!this.snaps.has(this.key)) this.snaps.set(this.key, new Map(this.pins));
  }

  /** Close the frame: burn what should burn, blend brightness, count flips. */
  private endFrame() {
    this.weights.set(this.key, (this.weights.get(this.key) ?? 0) + (this.simMs - this.lastChange));
    this.lastChange = this.simMs;
    const current = this.analysis();

    // Anything burning in any configuration this frame burns.
    const burning = new Set<string>();
    const frameAnalyses = new Map<string, Analysis>();
    for (const [k, w] of this.weights) {
      const snap = k === this.key ? this.pins : this.snaps.get(k);
      if (!snap || (w <= 0 && k !== this.key)) continue;
      const a = this.analysis(k, snap);
      frameAnalyses.set(k, a);
      a.leds.forEach((l) => l.status === "burning" && burning.add(l.id));
    }
    for (const l of current.leds) if (l.status === "burning") burning.add(l.id);
    if (burning.size) {
      for (const id of burning) this.burnt.add(id), this.popping.add(id);
      this.invalidate();
      globalThis.setTimeout(() => burning.forEach((id) => this.popping.delete(id)), 1400);
    }

    let leds: LedResult[] = current.leds;
    const total = [...this.weights.values()].reduce((a, b) => a + b, 0);
    if (this.speed === "real" && total > 0 && this.weights.size > 1) {
      const blend = new Map<string, number>();
      for (const [k, w] of this.weights) {
        const a = frameAnalyses.get(k);
        if (!a) continue;
        for (const l of a.leds) blend.set(l.id, (blend.get(l.id) ?? 0) + (l.status === "lit" ? l.brightness : 0) * (w / total));
      }
      leds = current.leds.map((l) => {
        // Brightness is perceived roughly as a power of light: an LED lit
        // half the time looks brighter than half as bright.
        const b = Math.pow(blend.get(l.id) ?? 0, 0.6);
        return b > 0.01 ? { ...l, status: "lit", brightness: b } : l.status === "lit" ? { ...l, brightness: 0, status: "too-low" } : l;
      });
    }
    this.weights = new Map();
    this.snaps = new Map([[this.key, new Map(this.pins)]]);
    this.display = { ...this.analysis(), leds };

    for (const l of leds) {
      const lit = l.status === "lit";
      if (this.wasLit.has(l.id) && this.wasLit.get(l.id) !== lit) this.stats.ledFlips++;
      this.wasLit.set(l.id, lit);
    }
    this.stats.simMs = this.simMs;
  }

  /** A button change while delay() waits is one nobody hears. */
  private checkMissed() {
    if (this.waitUntil === null || this.delayLine === null) return;
    const a = this.analysis();
    for (const r of a.readings) {
      const gpio = PINS.find((p) => p.id === r.id)?.gpio;
      if (gpio === undefined || !this.lastRead.has(gpio) || r.digital === "floating") continue;
      const v = r.digital === "HIGH" ? 1 : 0;
      if (v !== this.lastRead.get(gpio) && !this.flaggedThisDelay.has(gpio)) {
        this.flaggedThisDelay.add(gpio);
        this.stats.missed++;
        this.missed.push({ line: this.delayLine, pin: r.id, at: this.simMs });
        if (this.missed.length > 30) this.missed.shift();
      }
    }
  }

  // ── The Host ─────────────────────────────────────────────────────────

  private mark(line: number, gpio: number, dir: IoMark["dir"]) {
    const list = (this.io.get(line) ?? []).filter((m) => m.gpio !== gpio);
    list.push({ gpio, pin: pinOfGpio.get(gpio) ?? null, dir, at: this.simMs });
    this.io.set(line, list);
  }

  private label(gpio: number) {
    const id = pinOfGpio.get(gpio);
    return id ? PINS.find((p) => p.id === id)!.label : `GPIO ${gpio}`;
  }

  host: Host = {
    lit: (i) => this.lits[i]?.value ?? 0,
    note: (line, text) => this.notes.set(line, { text, at: this.simMs }),
    millis: () => this.simMs,
    pinMode: (gpio, mode, line) => {
      this.mark(line, gpio, "mode");
      const id = pinOfGpio.get(gpio);
      if (!id) {
        this.notes.set(line, { text: `GPIO ${gpio} isn't on this board's pins`, at: this.simMs });
        return;
      }
      const p = PINS.find((x) => x.id === id)!;
      if (mode === "OUTPUT" && p.inputOnly) {
        this.notes.set(line, { text: `${p.label} can only listen, never output`, at: this.simMs });
        return;
      }
      this.setPin(id, mode === "OUTPUT" ? { mode: "OUTPUT", level: 0 } : ({ mode } as PinState));
      this.notes.set(line, { text: `${p.label} → ${mode}`, at: this.simMs });
    },
    digitalWrite: (gpio, level, line) => {
      this.mark(line, gpio, "out");
      const id = pinOfGpio.get(gpio);
      const cur = id ? this.pins.get(id) : undefined;
      if (!id) {
        this.notes.set(line, { text: `GPIO ${gpio} isn't on this board's pins`, at: this.simMs });
        return;
      }
      if (!cur || (cur.mode !== "OUTPUT" && cur.mode !== "PWM")) {
        this.notes.set(line, { text: `${this.label(gpio)} was never set to OUTPUT, so nothing happens`, at: this.simMs });
        return;
      }
      this.setPin(id, { mode: "OUTPUT", level: level ? 1 : 0 });
      this.notes.set(line, { text: `${this.label(gpio)} → ${level ? "HIGH" : "LOW"}`, at: this.simMs });
    },
    analogWrite: (gpio, duty, line) => {
      this.mark(line, gpio, "out");
      const id = pinOfGpio.get(gpio);
      if (!id) return;
      // A clean sweep: up from near 0 to a peak near 255 and turning back,
      // with nothing past 255 on the way.
      if (duty > 255) this.sweep.dirty = true;
      const d = Math.max(0, Math.min(255, Math.round(duty)));
      if (d <= 5) this.sweep = { armed: true, dirty: false, last: d };
      else {
        if (this.sweep.armed && !this.sweep.dirty && this.sweep.last >= 250 && d < this.sweep.last) {
          this.stats.cleanSweeps++;
          this.sweep.armed = false;
        }
        this.sweep.last = d;
      }
      this.setPin(id, { mode: "PWM", duty: d });
      this.notes.set(line, {
        text: duty > 255 ? `${this.label(gpio)} → ${Math.round(duty)}, past 255, so fully on` : `${this.label(gpio)} → on ${d} of 255`,
        at: this.simMs,
      });
    },
    digitalRead: (gpio, line) => {
      this.mark(line, gpio, "in");
      const v = this.readDigital(gpio);
      this.lastRead.set(gpio, v);
      return v;
    },
    analogRead: (gpio, line) => {
      this.mark(line, gpio, "in");
      const id = pinOfGpio.get(gpio);
      if (!id) return 0;
      if (!ADC_GPIOS.has(gpio)) {
        this.notes.set(line, { text: `${this.label(gpio)} can't measure voltage`, at: this.simMs });
        return 0;
      }
      const r = this.analysis().readings.find((x) => x.id === id);
      if (!r || r.analog === undefined) return Math.floor(Math.random() * 4096);
      return r.analog;
    },
    print: (text, newline, line) => {
      if (this.partial) this.partial.text += text;
      else this.partial = { text, line, at: this.simMs };
      if (newline) {
        this.serial.push(this.partial);
        this.stats.printed.push(this.partial.text);
        if (this.serial.length > 200) this.serial.shift();
        if (this.stats.printed.length > 200) this.stats.printed.shift();
        this.partial = null;
      }
    },
  };

  private readDigital(gpio: number): number {
    const id = pinOfGpio.get(gpio);
    if (!id) return 0;
    const s = this.pins.get(id);
    if (s?.mode === "OUTPUT") return s.level;
    const r = this.analysis().readings.find((x) => x.id === id);
    let floating = false;
    let v: number;
    if (r) {
      floating = r.digital === "floating";
      v = floating ? (Math.random() < 0.5 ? 1 : 0) : r.digital === "HIGH" ? 1 : 0;
    } else if (s?.mode === "INPUT_PULLDOWN") v = 0;
    else if (s?.mode === "INPUT_PULLUP" || BOARD_PULLUPS.has(gpio)) v = 1;
    else {
      floating = true;
      v = Math.random() < 0.5 ? 1 : 0;
    }
    if (floating) {
      this.stats.lastFloat = this.simMs;
      this.stats.readsSinceFloat = 0;
    } else {
      this.stats.readsSinceFloat++;
      const seen = (this.stats.seen[gpio] ??= { high: false, low: false });
      if (v) seen.high = true;
      else seen.low = true;
    }
    return v;
  }

  /** The value of a global the sketch declared, for panels. */
  peek(name: string): number | undefined {
    const v = this.machine.peek(name);
    return typeof v === "number" ? v : undefined;
  }
}

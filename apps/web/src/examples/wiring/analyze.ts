// What the board is doing, in two layers.
//
// 1. Connection. What is joined to what: the breadboard's strips, wires, a
//    closed button. Every explanation the page gives comes from here — is
//    there a loop, is the LED backwards, are both legs in one strip, does
//    power reach GND through wire alone. It needs nothing about any part
//    beyond how its legs connect.
//
// 2. Voltage. A small nodal solve over the same connected groups, for the
//    three things connection can't answer: how bright an LED is, whether it
//    takes enough current to burn out, and what a pin reading a voltage
//    sees. Parts enter it only as resistances (a resistor, the two halves of
//    a potentiometer), an LED's forward drop, and the board's fixed
//    voltages, so it stays one general mechanism rather than a model per
//    part. It is not run while the board is shorted — the board is off.

import {
  ADC_GPIOS,
  BOARD_PULLUPS,
  DEFAULT_PIN,
  SEGMENTS,
  PIN_BY_ID,
  PINS,
  POT_OHMS,
  STRIPS,
  buttonPairs,
  legsOf,
  placeName,
  potLegs,
  segGround,
  segLeg,
  type NodeId,
  type Part,
  type PinState,
} from "./model.js";

export interface Circuit {
  parts: Part[];
  /** Pin modes, as code would set them. A pin not listed is an INPUT. */
  pins: ReadonlyMap<NodeId, PinState>;
  /** Buttons currently held down, by part id. */
  pressed: ReadonlySet<string>;
  /** LEDs that have burned out, by part id. A burnt LED no longer conducts. */
  burnt: ReadonlySet<string>;
}

export type EdgeKind = "strip" | "wire" | "button" | "internal" | "resistor" | "pot" | "led";

/** One step between two nodes. `partId` is absent for the breadboard's own
 *  hidden strips. */
export interface Edge {
  from: NodeId;
  to: NodeId;
  kind: EdgeKind;
  partId?: string;
}

export type LedStatus =
  | "lit" //        a closed loop, enough current to glow
  | "burning" //    too much current: it burns out now
  | "burnt" //      already gone
  | "too-low" //    a closed loop, but too little voltage across it to glow
  | "backwards" //  a loop exists, but through the LED the wrong way
  | "bypassed" //   both legs in the same connected group
  | "no-power" //   nothing reaches the long leg
  | "no-return" //  power reaches it, but the short leg goes nowhere
  | "pin-off" //    the loop runs through a digital pin that is off
  | "off" //        the board is shorted and has shut down
  | "idle"; //      not connected to anything that matters

export interface LedResult {
  /** The LED's part id, or "<display id>:<segment>" for a display segment. */
  id: string;
  status: LedStatus;
  /** The loop, source pin to GND pin, when there is one. */
  loop?: Edge[];
  /** For "pin-off", and for a loop fed by a pin: that pin. */
  pin?: NodeId;
  /** Current through it, in milliamps, when the solve ran. */
  mA?: number;
  /** 0–1: how bright it looks, averaged over PWM. */
  brightness: number;
}

export interface PinReading {
  id: NodeId;
  /** Volts on the pin, or null when nothing drives it: floating. */
  volts: number | null;
  /** What digitalRead() would return. */
  digital: "HIGH" | "LOW" | "floating";
  /** What analogRead() would return, on a pin that has an ADC. */
  analog?: number;
}

export interface Short {
  kind: "supply" | "pin" | "supplies";
  path: Edge[];
}

export interface Analysis {
  short: Short | null;
  leds: LedResult[];
  /** Readings for every input pin that has something plugged into it. */
  readings: PinReading[];
  /** Net index per node, for colouring and hover. */
  netOf: (id: NodeId) => number;
  supplyNets: Set<number>;
  groundNets: Set<number>;
}

/** Electrical constants — round numbers of the right size, not a datasheet. */
const V3 = 3.3;
const VIN = 5;
const LED_VF = 2.0; //      red LED forward drop
const LED_R = 15; //        its resistance once conducting
const LED_BURN_MA = 30; //  more than this for any time and it is gone
const LED_FULL_MA = 5; //   looks fully bright
const LED_MIN_MA = 0.05; // glows at all
const PIN_R = 25; //        an output pin's own resistance
const PULL_R = 45_000; //   the chip's own pull-up / pull-down
const BOARD_PULL_R = 10_000; // a pull-up resistor on the board itself

export const pinState = (c: Circuit, id: NodeId): PinState => c.pins.get(id) ?? DEFAULT_PIN;

const drives = (s: PinState) => s.mode === "OUTPUT" || s.mode === "PWM";
const drivesHigh = (s: PinState) => (s.mode === "OUTPUT" && s.level === 1) || (s.mode === "PWM" && s.duty > 0);
const drivesLow = (s: PinState) => s.mode === "OUTPUT" && s.level === 0;

// ── Graph ──────────────────────────────────────────────────────────────

const CONDUCTS: ReadonlySet<EdgeKind> = new Set(["strip", "wire", "button", "internal"]);

/** An LED as the analysis sees it: a discrete LED, or one display segment. */
interface LedEl {
  id: string;
  a: NodeId;
  b: NodeId;
}

interface Resist {
  a: NodeId;
  b: NodeId;
  ohms: number;
}

function buildEdges(c: Circuit): { edges: Edge[]; resists: Resist[]; leds: LedEl[] } {
  const edges: Edge[] = [];
  const resists: Resist[] = [];
  const leds: LedEl[] = [];
  for (const strip of STRIPS) {
    for (let i = 1; i < strip.length; i++) {
      edges.push({ from: strip[i - 1]!, to: strip[i]!, kind: "strip" });
    }
  }
  for (const p of c.parts) {
    if (p.kind === "button") {
      const [p1, p2] = buttonPairs(p);
      edges.push({ from: p1[0], to: p1[1], kind: "button", partId: p.id });
      edges.push({ from: p2[0], to: p2[1], kind: "button", partId: p.id });
      if (c.pressed.has(p.id)) edges.push({ from: p1[1], to: p2[1], kind: "button", partId: p.id });
    } else if (p.kind === "pot") {
      const [l, w, r] = potLegs(p);
      edges.push({ from: l, to: w, kind: "pot", partId: p.id });
      edges.push({ from: w, to: r, kind: "pot", partId: p.id });
      // A wiper hard against one end still leaves a trace of track.
      resists.push({ a: l, b: w, ohms: Math.max(1, p.turn * POT_OHMS) });
      resists.push({ a: w, b: r, ohms: Math.max(1, (1 - p.turn) * POT_OHMS) });
    } else if (p.kind === "seg7") {
      const [g1, g2] = segGround(p);
      edges.push({ from: g1, to: g2, kind: "internal", partId: p.id });
      for (const s of SEGMENTS) {
        const el = { id: `${p.id}:${s}`, a: segLeg(p, s), b: g1 };
        leds.push(el);
        if (!c.burnt.has(el.id)) edges.push({ from: el.a, to: el.b, kind: "led", partId: el.id });
      }
    } else if (p.kind === "led") {
      leds.push({ id: p.id, a: p.a, b: p.b });
      if (!c.burnt.has(p.id)) edges.push({ from: p.a, to: p.b, kind: "led", partId: p.id });
    } else if (p.kind === "resistor") {
      edges.push({ from: p.a, to: p.b, kind: "resistor", partId: p.id });
      resists.push({ a: p.a, b: p.b, ohms: p.ohms ?? 220 });
    } else {
      edges.push({ from: p.a, to: p.b, kind: "wire", partId: p.id });
    }
  }
  return { edges, resists, leds };
}

type Adj = Map<NodeId, Edge[]>;

/** Adjacency, every edge usable both ways except an LED, which conducts
 *  only from its long leg to its short one. */
function adjacency(edges: Edge[]): Adj {
  const adj: Adj = new Map();
  const add = (e: Edge) => {
    const list = adj.get(e.from);
    if (list) list.push(e);
    else adj.set(e.from, [e]);
  };
  for (const e of edges) {
    add(e);
    if (e.kind !== "led") add({ ...e, from: e.to, to: e.from });
  }
  return adj;
}

/** Fewest-steps path from any of `starts` to any of `goals`. */
function bfs(adj: Adj, starts: NodeId[], goals: ReadonlySet<NodeId>, allow: (e: Edge) => boolean): Edge[] | null {
  const prev = new Map<NodeId, Edge | null>();
  const queue: NodeId[] = [];
  for (const s of starts) if (!prev.has(s)) prev.set(s, null), queue.push(s);
  for (let qi = 0; qi < queue.length; qi++) {
    const n = queue[qi]!;
    if (goals.has(n)) {
      const path: Edge[] = [];
      for (let e = prev.get(n); e; e = prev.get(e.from)) path.unshift(e);
      return path;
    }
    for (const e of adj.get(n) ?? []) {
      if (prev.has(e.to) || !allow(e)) continue;
      prev.set(e.to, e);
      queue.push(e.to);
    }
  }
  return null;
}

// ── Analysis ───────────────────────────────────────────────────────────

export function analyze(c: Circuit): Analysis {
  const { edges, resists, leds: ledParts } = buildEdges(c);
  const adj = adjacency(edges);

  // Nets: groups joined by conductors alone.
  const parent = new Map<NodeId, NodeId>();
  const find = (x: NodeId): NodeId => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const e of edges) {
    if (!CONDUCTS.has(e.kind)) continue;
    const ra = find(e.from);
    const rb = find(e.to);
    if (ra !== rb) parent.set(ra, rb);
  }
  const netIdx = new Map<NodeId, number>();
  const rootIdx = new Map<NodeId, number>();
  const every = new Set<NodeId>(PINS.map((p) => p.id));
  for (const s of STRIPS) for (const h of s) every.add(h);
  for (const p of c.parts) for (const l of legsOf(p)) every.add(l);
  for (const id of every) {
    const r = find(id);
    if (!rootIdx.has(r)) rootIdx.set(r, rootIdx.size);
    netIdx.set(id, rootIdx.get(r)!);
  }
  const netOf = (id: NodeId) => netIdx.get(id) ?? -1;

  // Sources and sinks.
  const supplyPins = PINS.filter((p) => p.kind === "3v3" || p.kind === "vin").map((p) => p.id);
  const gpio = PINS.filter((p) => p.kind === "gpio");
  const highPins = gpio.filter((p) => !p.inputOnly && drivesHigh(pinState(c, p.id))).map((p) => p.id);
  const lowPins = gpio.filter((p) => !p.inputOnly && drivesLow(pinState(c, p.id))).map((p) => p.id);
  const gndPins = PINS.filter((p) => p.kind === "gnd").map((p) => p.id);
  const sources = [...supplyPins, ...highPins];
  const sinks = new Set([...gndPins, ...lowPins]);
  const supplyNets = new Set(sources.map(netOf));
  const groundNets = new Set([...sinks].map(netOf));
  const conductive = (e: Edge) => CONDUCTS.has(e.kind);

  // Shorts: a power pin reaching GND (or a pin driven LOW) through wire.
  let short: Short | null = null;
  const sp = bfs(adj, supplyPins, sinks, conductive);
  if (sp) short = { kind: "supply", path: sp };
  if (!short && highPins.length) {
    const p = bfs(adj, highPins, sinks, conductive);
    if (p) short = { kind: "pin", path: p };
  }
  if (!short) {
    const vin = PINS.filter((p) => p.kind === "vin").map((p) => p.id);
    const v3 = new Set(PINS.filter((p) => p.kind === "3v3").map((p) => p.id));
    const p = bfs(adj, vin, v3, conductive);
    if (p) short = { kind: "supplies", path: p };
  }

  // ── Layer 1: every LED's loop, by connection ─────────────────────────

  const leds: LedResult[] = ledParts.map((led) => {
    if (c.burnt.has(led.id)) return { id: led.id, status: "burnt", brightness: 0 };
    if (netOf(led.a) === netOf(led.b)) return { id: led.id, status: "bypassed", brightness: 0 };
    if (short) return { id: led.id, status: "off", brightness: 0 };

    // The half of the loop before the LED may not detour through ground,
    // and the half after it may not detour through the supply.
    const notThis = (e: Edge) => e.partId !== led.id;
    const toward = (e: Edge) => notThis(e) && !groundNets.has(netOf(e.to));
    const back = (e: Edge) => notThis(e) && !supplyNets.has(netOf(e.to));
    const self: Edge = { from: led.a, to: led.b, kind: "led", partId: led.id };

    const up = bfs(adj, sources, new Set([led.a]), toward);
    const down = bfs(adj, [led.b], sinks, back);
    if (up && down) {
      const first = up[0]?.from ?? led.a;
      const pin = PIN_BY_ID.get(first)?.kind === "gpio" ? first : undefined;
      return { id: led.id, status: "lit", loop: [...up, self, ...down], pin, brightness: 0 };
    }
    const revUp = bfs(adj, sources, new Set([led.b]), toward);
    const revDown = bfs(adj, [led.a], sinks, back);
    if (revUp && revDown) return { id: led.id, status: "backwards", brightness: 0 };
    if (down) {
      for (const p of gpio) {
        if (p.inputOnly || highPins.includes(p.id)) continue;
        // A pin set LOW counts as ground; searching from it, its own net
        // is where the loop would start, not a detour.
        const own = netOf(p.id);
        const fromPin = (e: Edge) => notThis(e) && (netOf(e.to) === own || !groundNets.has(netOf(e.to)));
        if (bfs(adj, [p.id], new Set([led.a]), fromPin)) {
          return { id: led.id, status: "pin-off", pin: p.id, brightness: 0 };
        }
      }
    }
    if (up) return { id: led.id, status: "no-return", brightness: 0 };
    if (down) return { id: led.id, status: "no-power", brightness: 0 };
    return { id: led.id, status: "idle", brightness: 0 };
  });

  // ── Layer 2: voltages ────────────────────────────────────────────────

  const readings: PinReading[] = [];
  const inputPins = gpio.filter((p) => {
    const s = pinState(c, p.id);
    return !drives(s) && c.parts.some((part) => legsOf(part).some((l) => netOf(l) === netOf(p.id)));
  });

  if (!short) {
    const volts = solve(c, netOf, resists, ledParts, highPins, lowPins);

    for (const l of leds) {
      const part = ledParts.find((p) => p.id === l.id);
      if (!part || l.status !== "lit") continue;
      const va = volts.get(netOf(part.a)) ?? 0;
      const vb = volts.get(netOf(part.b)) ?? 0;
      const mA = (Math.max(0, va - vb - LED_VF) / LED_R) * 1000;
      l.mA = mA;
      if (mA > LED_BURN_MA) l.status = "burning";
      else if (mA < LED_MIN_MA) l.status = "too-low";
      else {
        const s = l.pin ? pinState(c, l.pin) : null;
        const duty = s && s.mode === "PWM" ? s.duty / 255 : 1;
        l.brightness = Math.min(1, mA / LED_FULL_MA) ** 0.6 * duty;
      }
    }

    // A pin is floating when no resistive path reaches anything with a
    // fixed voltage. A reverse LED leaves it floating too, so LEDs are not
    // counted as paths here.
    const fixedNets = new Set([...supplyNets, ...groundNets]);
    const reachesFixed = (start: NodeId) => {
      const ok = (e: Edge) => e.kind !== "led";
      const goals = new Set<NodeId>();
      for (const [id, n] of netIdx) if (fixedNets.has(n)) goals.add(id);
      return bfs(adj, [start], goals, ok) !== null;
    };
    for (const p of inputPins) {
      const s = pinState(c, p.id);
      const pulled = s.mode !== "INPUT" || BOARD_PULLUPS.has(p.gpio!);
      const floating = !reachesFixed(p.id) && !pulled;
      const v = floating ? null : (volts.get(netOf(p.id)) ?? 0);
      readings.push({
        id: p.id,
        volts: v,
        digital: v === null ? "floating" : v > V3 / 2 ? "HIGH" : "LOW",
        analog: ADC_GPIOS.has(p.gpio!) && v !== null ? Math.round(Math.max(0, Math.min(1, v / V3)) * 4095) : undefined,
      });
    }
  }

  return { short, leds, readings, netOf, supplyNets, groundNets };
}

// ── The nodal solve ────────────────────────────────────────────────────

/** Net voltages. Fixed: the 3V3 and VIN nets, GND. Pins driving HIGH or LOW
 *  are ideal sources behind their own small resistance; PWM pins are solved
 *  in their on state and the page averages brightness over the duty cycle.
 *  LEDs are piecewise: off, or a forward drop plus a small resistance,
 *  iterated until every LED's state agrees with the voltages across it. */
function solve(
  c: Circuit,
  netOf: (id: NodeId) => number,
  resists: Resist[],
  ledParts: LedEl[],
  highPins: NodeId[],
  lowPins: NodeId[],
): Map<number, number> {
  const fixed = new Map<number, number>();
  for (const p of PINS) {
    if (p.kind === "gnd") fixed.set(netOf(p.id), 0);
    else if (p.kind === "3v3") fixed.set(netOf(p.id), V3);
    else if (p.kind === "vin") fixed.set(netOf(p.id), VIN);
  }

  const leds = ledParts.filter((p) => !c.burnt.has(p.id));
  // Weak pulls on input pins: the chip's own, and any the board adds.
  const pulls: Array<{ id: NodeId; v: number; r: number }> = [];
  for (const p of PINS) {
    if (p.kind !== "gpio") continue;
    const s = pinState(c, p.id);
    if (drives(s)) continue;
    if (s.mode === "INPUT_PULLDOWN") pulls.push({ id: p.id, v: 0, r: PULL_R });
    if (s.mode === "INPUT_PULLUP") pulls.push({ id: p.id, v: V3, r: PULL_R });
    if (BOARD_PULLUPS.has(p.gpio!)) pulls.push({ id: p.id, v: V3, r: BOARD_PULL_R });
  }

  // Unknowns: every net some part touches that isn't fixed.
  const unknown = new Map<number, number>();
  const note = (id: NodeId) => {
    const n = netOf(id);
    if (!fixed.has(n) && !unknown.has(n)) unknown.set(n, unknown.size);
  };
  for (const r of resists) note(r.a), note(r.b);
  for (const l of leds) note(l.a), note(l.b);
  for (const id of [...highPins, ...lowPins, ...pulls.map((p) => p.id)]) note(id);

  const N = unknown.size;
  let on = leds.map(() => false);
  let x: number[] = new Array(N).fill(0);

  const volt = (n: number) => (fixed.has(n) ? fixed.get(n)! : unknown.has(n) ? x[unknown.get(n)!]! : 0);

  for (let iter = 0; iter < 25; iter++) {
    const G = Array.from({ length: N }, () => new Array(N).fill(0));
    const I = new Array(N).fill(0);
    // A trace of leakage to ground keeps an isolated group solvable.
    for (let i = 0; i < N; i++) G[i]![i] = 1e-9;

    /** A conductance g between nets, pushing `src` amps from a to b. */
    const stamp = (na: number, nb: number, g: number, src = 0) => {
      const ia = unknown.get(na);
      const ib = unknown.get(nb);
      if (ia !== undefined) {
        G[ia]![ia] += g;
        I[ia] -= src;
        if (ib !== undefined) G[ia]![ib] -= g;
        else I[ia] += g * (fixed.get(nb) ?? 0);
      }
      if (ib !== undefined) {
        G[ib]![ib] += g;
        I[ib] += src;
        if (ia !== undefined) G[ib]![ia] -= g;
        else I[ib] += g * (fixed.get(na) ?? 0);
      }
    };
    const toVoltage = (id: NodeId, v: number, r: number) => {
      const i = unknown.get(netOf(id));
      if (i === undefined) return;
      G[i]![i] += 1 / r;
      I[i] += v / r;
    };

    for (const r of resists) stamp(netOf(r.a), netOf(r.b), 1 / r.ohms);
    // A conducting LED: current g·(Va − Vb − Vf) from a to b, which is a
    // conductance g plus a fixed g·Vf flowing back.
    leds.forEach((l, k) => {
      if (on[k]) stamp(netOf(l.a), netOf(l.b), 1 / LED_R, -LED_VF / LED_R);
    });
    for (const id of highPins) toVoltage(id, V3, PIN_R);
    for (const id of lowPins) toVoltage(id, 0, PIN_R);
    for (const p of pulls) toVoltage(p.id, p.v, p.r);

    x = gauss(G, I);

    const next = leds.map((l, k) => {
      const vd = volt(netOf(l.a)) - volt(netOf(l.b));
      return on[k] ? vd - LED_VF > 0 : vd > LED_VF;
    });
    if (next.every((v, k) => v === on[k])) break;
    on = next;
  }

  const out = new Map<number, number>(fixed);
  for (const [n, i] of unknown) out.set(n, x[i]!);
  return out;
}

function gauss(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const d = M[col]![col]!;
    if (Math.abs(d) < 1e-15) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / d;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r]![k]! -= f * M[col]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-15 ? 0 : row[n]! / row[i]!));
}

// ── Reading a path aloud ───────────────────────────────────────────────

export interface PathStep {
  label: string;
  kind: "pin" | "place" | EdgeKind;
}

const EDGE_NAMES: Record<EdgeKind, string> = {
  strip: "strip",
  wire: "wire",
  button: "button",
  internal: "display",
  resistor: "resistor",
  pot: "potentiometer",
  led: "LED",
};

/** A path as the chain a person would say: pin, wire, strip, resistor … */
export function describePath(path: Edge[]): PathStep[] {
  if (!path.length) return [];
  const steps: PathStep[] = [];
  const push = (s: PathStep) => {
    const last = steps[steps.length - 1];
    if (last && last.label === s.label && last.kind === s.kind) return;
    steps.push(s);
  };
  const place = (id: NodeId) => {
    const pin = PIN_BY_ID.get(id);
    push(pin ? { label: pin.label, kind: "pin" } : { label: placeName(id), kind: "place" });
  };
  place(path[0]!.from);
  for (const e of path) {
    if (e.kind !== "strip" && e.kind !== "internal") {
      // A display segment is named for its segment.
      const seg = e.kind === "led" && e.partId?.includes(":") ? `segment ${e.partId.split(":")[1]}` : EDGE_NAMES[e.kind];
      push({ label: seg, kind: e.kind });
    }
    place(e.to);
  }
  return steps;
}

/** GPIO pins joined to a node through wire and resistors (not LEDs): the
 *  pins that could drive it. */
export function pinsReaching(c: Circuit, node: NodeId): NodeId[] {
  const { edges } = buildEdges(c);
  const adj = adjacency(edges);
  const seen = new Set<NodeId>([node]);
  const queue = [node];
  for (let i = 0; i < queue.length; i++) {
    for (const e of adj.get(queue[i]!) ?? []) {
      if (e.kind === "led" || seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push(e.to);
    }
  }
  return PINS.filter((p) => p.kind === "gpio" && seen.has(p.id)).map((p) => p.id);
}

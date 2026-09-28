// The circuit as a diagram, laid out twice.
//
// Diagram mode redraws the circuit as a schematic in one of two layouts, and
// slides between them:
//
//   on the board  every symbol sits on the part it stands for, and every
//                 conductor follows the jumpers and the metal strips under
//                 the holes. A connected group is one colour and one
//                 unbroken line, however many wires and strips it crosses.
//   as loops      the same symbols and lines pulled into short loops. Each
//                 chain of parts in series becomes a column between the two
//                 sides of a battery (the board's 3V3 and GND). A chain that
//                 starts or ends at a pin dead-ends in that pin's label.
//
// Both layouts are built from the same pieces with the same number of
// points, so every moment between them is an interpolation. Every line is
// straight: a jumper is drawn from end to end, not along its arc, and every
// corner is kept exactly when a line is resampled. Each line runs
// from a part's leg to its group's "hub": the pin the group is wired to, or
// one of its legs. On the board that line follows the real conductors; as
// loops it runs along the column and the battery's rails.
//
// Groups here are the breadboard's wiring alone, with every button released,
// so pressing a button closes a switch in the diagram instead of reshaping
// it.

import type { Analysis, Edge } from "./analyze.js";
import {
  PIN_BY_ID,
  PINS,
  SEGMENTS,
  STRIPS,
  VIEW_H,
  VIEW_W,
  buttonPairs,
  formatOhms,
  nodeXY,
  potLegs,
  segGround,
  segLeg,
  type NodeId,
  type Part,
} from "./model.js";

export type XY = { x: number; y: number };

export type NetKind = "supply" | "ground" | "pin" | "node";

export interface DiagramNet {
  kind: NetKind;
  /** "3V3", "GND", a pin's printed label, or "" for a group between parts. */
  label: string;
}

export type SymbolKind = "resistor" | "led" | "switch" | "pot";

export interface DiagramSymbol {
  key: string;
  /** The part it stands for. A display's segments all name the display. */
  partId: string;
  /** The id the analysis reports an LED or segment under. */
  ledId?: string;
  kind: SymbolKind;
  label?: string;
  /** Leg a, leg b, and a knob's wiper, in each layout. */
  board: XY[];
  loops: XY[];
}

/** One line, from a leg to its group's hub. */
export interface DiagramLead {
  key: string;
  net: number;
  board: XY[];
  loops: XY[];
}

/** Where a line ends as loops without reaching the battery: a pin's label,
 *  a numbered junction shared with another column, or a leg left open. */
export interface DiagramFlag {
  key: string;
  net: number;
  kind: "pin" | "power" | "node" | "open";
  label: string;
  /** For a GPIO pin's label, so it can be clicked and show the pin's mode. */
  pin?: NodeId;
  side: "above" | "below" | "right";
  board: XY;
  loops: XY;
}

export interface Diagram {
  nets: DiagramNet[];
  symbols: DiagramSymbol[];
  leads: DiagramLead[];
  flags: DiagramFlag[];
  /** Where a column meets a rail that carries on past it. Loops only. */
  dots: XY[];
  /** A short: wire alone from power to ground, and, as loops, a loop with
   *  nothing in it. */
  short: { board: XY[]; loops: XY[] } | null;
  battery: { board: XY; loops: XY; plus: XY; minus: XY };
  /** Columns are far enough apart for resistor values beside them. */
  roomy: boolean;
}

// ── Layout constants (loops) ───────────────────────────────────────────

const BAT_X = 66;
const COL_X0 = 146;
const COL_X1 = VIEW_W - 44;
const SYM_LEN = 40;
/** Room a label takes at the end of a column. */
const FLAG_ROOM = 44;
/** How far a knob's wiper line runs out to the right of its column. */
const TAP = 30;
/** Points per line, at least: enough for a line to bend smoothly between
 *  layouts. */
const K = 28;

// ── Geometry helpers ───────────────────────────────────────────────────

const dist = (a: XY, b: XY) => Math.hypot(b.x - a.x, b.y - a.y);

/** A polyline's corners: repeated points and points along a straight run
 *  dropped. */
export function corners(pts: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && dist(last, p) < 0.01) continue;
    const prev = out[out.length - 2];
    if (last && prev) {
      const cross = (last.x - prev.x) * (p.y - last.y) - (last.y - prev.y) * (p.x - last.x);
      const dot = (last.x - prev.x) * (p.x - last.x) + (last.y - prev.y) * (p.y - last.y);
      if (Math.abs(cross) < 0.01 && dot > 0) out.pop();
    }
    out.push(p);
  }
  return out.length ? out : [pts[0] ?? { x: 0, y: 0 }];
}

/** A polyline as `k` points that include every corner, the rest shared out
 *  along its straight runs by length. */
function resample(pts: XY[], k: number): XY[] {
  const c = corners(pts);
  if (c.length < 2) return Array.from({ length: k }, () => ({ ...c[0]! }));
  const lens = c.slice(1).map((p, i) => dist(c[i]!, p));
  // Every run gets one step; the steps left over go to the longest runs.
  const steps = lens.map(() => 1);
  for (let spare = k - 1 - lens.length; spare > 0; spare--) {
    let best = 0;
    for (let i = 1; i < lens.length; i++) if (lens[i]! / steps[i]! > lens[best]! / steps[best]!) best = i;
    steps[best]!++;
  }
  const out: XY[] = [];
  lens.forEach((_, i) => {
    const a = c[i]!;
    const b = c[i + 1]!;
    for (let j = 0; j < steps[i]!; j++) out.push({ x: a.x + ((b.x - a.x) * j) / steps[i]!, y: a.y + ((b.y - a.y) * j) / steps[i]! });
  });
  out.push(c[c.length - 1]!);
  return out;
}

/** Two polylines as the same number of points, each keeping its corners, so
 *  one can slide into the other. */
function pair(a: XY[], b: XY[], k = K): [XY[], XY[]] {
  const n = Math.max(k, corners(a).length, corners(b).length);
  return [resample(a, n), resample(b, n)];
}

// ── Conductors ─────────────────────────────────────────────────────────

/** A conductor between two nodes, with the points it is drawn through. */
interface Conductor {
  from: NodeId;
  to: NodeId;
  pts: XY[];
}

function conductors(parts: Part[]): Conductor[] {
  const out: Conductor[] = [];
  const line = (from: NodeId, to: NodeId): Conductor => ({ from, to, pts: [nodeXY(from), nodeXY(to)] });
  for (const s of STRIPS) for (let i = 1; i < s.length; i++) out.push(line(s[i - 1]!, s[i]!));
  // The GND pins are joined inside the board.
  const gnds = PINS.filter((p) => p.kind === "gnd").map((p) => p.id);
  for (let i = 1; i < gnds.length; i++) out.push(line(gnds[0]!, gnds[i]!));
  for (const p of parts) {
    if (p.kind === "wire") out.push(line(p.a, p.b));
    else if (p.kind === "button") for (const [x, y] of buttonPairs(p)) out.push(line(x, y));
  }
  return out;
}

// ── Parts as symbols ───────────────────────────────────────────────────

interface Comp {
  key: string;
  partId: string;
  ledId?: string;
  kind: SymbolKind;
  label?: string;
  a: NodeId;
  b: NodeId;
  /** A knob's wiper: a tap off the side, not part of the series chain. */
  w?: NodeId;
}

function components(parts: Part[]): Comp[] {
  const out: Comp[] = [];
  for (const p of parts) {
    if (p.kind === "resistor") out.push({ key: p.id, partId: p.id, kind: "resistor", label: formatOhms(p.ohms ?? 220), a: p.a, b: p.b });
    else if (p.kind === "led") out.push({ key: p.id, partId: p.id, ledId: p.id, kind: "led", a: p.a, b: p.b });
    else if (p.kind === "button") {
      const [p1, p2] = buttonPairs(p);
      out.push({ key: p.id, partId: p.id, kind: "switch", a: p1[0], b: p2[0] });
    } else if (p.kind === "pot") {
      const [l, w, r] = potLegs(p);
      out.push({ key: p.id, partId: p.id, kind: "pot", label: "knob", a: l, b: r, w });
    } else if (p.kind === "seg7") {
      const g1 = segGround(p);
      for (const s of SEGMENTS) {
        const id = `${p.id}:${s}`;
        out.push({ key: id, partId: p.id, ledId: id, kind: "led", label: s, a: segLeg(p, s), b: g1 });
      }
    }
  }
  return out;
}

type Term = "a" | "b";
const other = (t: Term): Term => (t === "a" ? "b" : "a");

/** A part in a column, and which of its legs faces up. */
interface Step {
  c: Comp;
  up: Term;
}

interface Column {
  steps: Step[];
  top: number;
  bottom: number;
  topBus: boolean;
  bottomBus: boolean;
  x: number;
  /** Where its parts sit on the board, for ordering columns left to right. */
  boardX: number;
}

// ── The diagram ────────────────────────────────────────────────────────

export function buildDiagram(parts: Part[], analysis: Analysis, showShort: boolean): Diagram {
  const cond = conductors(parts);

  // Groups: union-find over the conductors.
  const parent = new Map<NodeId, NodeId>();
  const find = (x: NodeId): NodeId => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const c of cond) {
    const ra = find(c.from);
    const rb = find(c.to);
    if (ra !== rb) parent.set(ra, rb);
  }
  const index = new Map<NodeId, number>();
  const netOf = (id: NodeId) => {
    const r = find(id);
    let i = index.get(r);
    if (i === undefined) index.set(r, (i = index.size));
    return i;
  };

  // What each group is, from the pins in it. 3V3 wins over GND: a group
  // holding both is a short, and the board is off.
  const kindOf = new Map<number, { kind: NetKind; label: string; hub: NodeId; pin?: NodeId }>();
  const wired = new Set(parts.flatMap((p) => (p.kind === "wire" ? [p.a, p.b] : [])));
  const rank: Record<string, number> = { "3v3": 0, gnd: 1, gpio: 2, vin: 3, en: 4, serial: 5 };
  const pinsByNet = new Map<number, typeof PINS>();
  for (const p of PINS) {
    const n = netOf(p.id);
    pinsByNet.set(n, [...(pinsByNet.get(n) ?? []), p]);
  }
  for (const [n, ps] of pinsByNet) {
    const best = [...ps].sort((x, y) => rank[x.kind]! - rank[y.kind]! || Number(wired.has(y.id)) - Number(wired.has(x.id)))[0]!;
    const kind: NetKind = best.kind === "3v3" ? "supply" : best.kind === "gnd" ? "ground" : "pin";
    kindOf.set(n, { kind, label: best.label, hub: best.id, pin: best.kind === "gpio" ? best.id : undefined });
  }
  const kind = (n: number): NetKind => kindOf.get(n)?.kind ?? "node";

  // Legs on each group: the two ends of a part in series, and a knob's wiper.
  let comps = components(parts);
  const count = () => {
    const ends = new Map<number, Array<{ c: Comp; t: Term }>>();
    const taps = new Map<number, Comp[]>();
    for (const c of comps) {
      for (const t of ["a", "b"] as const) {
        const n = netOf(c[t]);
        ends.set(n, [...(ends.get(n) ?? []), { c, t }]);
      }
      if (c.w) {
        const n = netOf(c.w);
        taps.set(n, [...(taps.get(n) ?? []), c]);
      }
    }
    return { ends, taps };
  };
  // A display segment nothing is wired to is part of the display, not of the
  // circuit: leave it out rather than draw a column that goes nowhere.
  {
    const { ends, taps } = count();
    const used = (id: NodeId) => {
      const n = netOf(id);
      return kind(n) !== "node" || (ends.get(n)?.length ?? 0) + (taps.get(n)?.length ?? 0) > 1;
    };
    comps = comps.filter((c) => !c.ledId?.includes(":") || used(c.a));
  }
  const { ends, taps } = count();
  const legs = (n: number) => (ends.get(n)?.length ?? 0) + (taps.get(n)?.length ?? 0);
  /** A group that just joins two parts in series, and so sits inside a column. */
  const through = (n: number) => {
    const e = ends.get(n) ?? [];
    return kind(n) === "node" && e.length === 2 && !taps.has(n) && e[0]!.c !== e[1]!.c;
  };

  // ── Chains of parts in series ────────────────────────────────────────

  const order: Record<NetKind, number> = { supply: 0, pin: 1, node: 2, ground: 3 };
  const seen = new Set<Comp>();
  const columns: Column[] = [];
  for (const start of comps) {
    if (seen.has(start)) continue;
    seen.add(start);
    let steps: Step[] = [{ c: start, up: "a" }];
    for (;;) {
      const last = steps[steps.length - 1]!;
      const n = netOf(last.c[other(last.up)]);
      if (!through(n)) break;
      const next = ends.get(n)!.find((e) => e.c !== last.c)!;
      if (seen.has(next.c)) break;
      seen.add(next.c);
      steps.push({ c: next.c, up: next.t });
    }
    for (;;) {
      const first = steps[0]!;
      const n = netOf(first.c[first.up]);
      if (!through(n)) break;
      const prev = ends.get(n)!.find((e) => e.c !== first.c)!;
      if (seen.has(prev.c)) break;
      seen.add(prev.c);
      steps.unshift({ c: prev.c, up: other(prev.t) });
    }
    // Power at the top, ground at the bottom; between equals, an LED's long
    // leg faces up.
    const topOf = (s: Step[]) => netOf(s[0]!.c[s[0]!.up]);
    const bottomOf = (s: Step[]) => netOf(s[s.length - 1]!.c[other(s[s.length - 1]!.up)]);
    const rt = order[kind(topOf(steps))];
    const rb = order[kind(bottomOf(steps))];
    const led = steps.find((s) => s.c.kind === "led");
    if (rt > rb || (rt === rb && led?.up === "b")) steps = steps.reverse().map((s) => ({ c: s.c, up: other(s.up) }));
    const top = topOf(steps);
    const bottom = bottomOf(steps);
    const xs = steps.flatMap((s) => [nodeXY(s.c.a).x, nodeXY(s.c.b).x]);
    columns.push({
      steps,
      top,
      bottom,
      topBus: kind(top) === "supply",
      bottomBus: kind(bottom) === "ground",
      x: 0,
      boardX: xs.reduce((a, b) => a + b, 0) / xs.length,
    });
  }

  // Columns on both rails first, then those on the + rail only, then the −
  // rail only, then the rest; left to right as on the board within each.
  // That keeps the + rail from running over any column that isn't on it.
  const group = (c: Column) => (c.topBus && c.bottomBus ? 0 : c.topBus ? 1 : c.bottomBus ? 2 : 3);
  columns.sort((p, q) => group(p) - group(q) || p.boardX - q.boardX);

  const short = analysis.short && showShort ? analysis.short : null;
  const slots = columns.length + (short ? 1 : 0);
  const hasTap = comps.some((c) => c.w);
  const spacing = Math.min(hasTap ? 96 : 80, (COL_X1 - COL_X0) / Math.max(1, slots - 1));
  const colX = (i: number) => COL_X0 + i * spacing;
  columns.forEach((c, i) => (c.x = colX(i + (short ? 1 : 0))));

  const most = Math.max(1, ...columns.map((c) => c.steps.length));
  const height = Math.max(220, Math.min(480, 130 + 64 * most));
  const midY = VIEW_H / 2 - 6;
  const TOP = midY - height / 2;
  const BOT = midY + height / 2;
  const plus = { x: BAT_X, y: midY - 5 };
  const minus = { x: BAT_X, y: midY + 5 };
  const toPlus = (x: number): XY[] => [{ x, y: TOP }, { x: BAT_X, y: TOP }, plus];
  const toMinus = (x: number): XY[] => [{ x, y: BOT }, { x: BAT_X, y: BOT }, minus];

  const nets: DiagramNet[] = [];
  const netInfo = (n: number): DiagramNet =>
    (nets[n] ??= { kind: kind(n), label: kindOf.get(n)?.label ?? "" });

  // ── Lines on the board: each leg back to its group's hub ─────────────

  const adj = new Map<NodeId, Array<{ to: NodeId; pts: XY[] }>>();
  const link = (from: NodeId, to: NodeId, pts: XY[]) => adj.set(from, [...(adj.get(from) ?? []), { to, pts }]);
  for (const c of cond) {
    link(c.from, c.to, c.pts);
    link(c.to, c.from, [...c.pts].reverse());
  }
  const hubOf = (n: number, fallback: NodeId) => kindOf.get(n)?.hub ?? fallback;
  const back = new Map<NodeId, { prev: NodeId; pts: XY[] }>();
  const searched = new Set<NodeId>();
  const search = (hub: NodeId) => {
    if (searched.has(hub)) return;
    searched.add(hub);
    const queue = [hub];
    for (let i = 0; i < queue.length; i++) {
      for (const e of adj.get(queue[i]!) ?? []) {
        if (searched.has(e.to)) continue;
        searched.add(e.to);
        back.set(e.to, { prev: queue[i]!, pts: e.pts });
        queue.push(e.to);
      }
    }
  };
  // Every group but one between parts has a pin for its hub; those take the
  // first leg met, in column order, so the choice is stable.
  const nodeHub = new Map<number, NodeId>();
  for (const c of columns) {
    for (const s of c.steps) {
      for (const id of [s.c[s.up], s.c[other(s.up)], s.c.w]) {
        if (!id) continue;
        const n = netOf(id);
        if (!kindOf.has(n) && !nodeHub.has(n)) nodeHub.set(n, id);
      }
    }
  }
  const hubNode = (n: number, id: NodeId) => nodeHub.get(n) ?? hubOf(n, id);
  const boardPath = (id: NodeId): XY[] => {
    const hub = hubNode(netOf(id), id);
    search(hub);
    const pts = [nodeXY(id)];
    for (let n = id, guard = 0; n !== hub && guard < 5000; guard++) {
      const step = back.get(n);
      if (!step) break;
      // step.pts runs prev → n; walk it backwards.
      for (let i = step.pts.length - 2; i >= 0; i--) pts.push(step.pts[i]!);
      n = step.prev;
    }
    return pts;
  };

  // ── Lines, symbols and labels, as loops ──────────────────────────────

  const symbols: DiagramSymbol[] = [];
  const leads: DiagramLead[] = [];
  const flags: DiagramFlag[] = [];
  const junction = new Map<number, number>();
  const nameOf = (n: number) => {
    if (kind(n) !== "node") return netInfo(n).label;
    if (!junction.has(n)) junction.set(n, junction.size + 1);
    return String(junction.get(n));
  };

  /** A leg that ends a column (or a wiper) without reaching the battery. */
  const flag = (key: string, n: number, id: NodeId, at: XY, side: DiagramFlag["side"]) => {
    const k = kind(n);
    const open = k === "node" && legs(n) < 2;
    const info = kindOf.get(n);
    flags.push({
      key,
      net: n,
      kind: open ? "open" : k === "node" ? "node" : info?.pin ? "pin" : "power",
      label: open ? "" : nameOf(n),
      pin: info?.pin,
      side,
      board: nodeXY(open ? id : hubNode(n, id)),
      loops: at,
    });
  };

  const lead = (key: string, id: NodeId, loops: XY[]) => {
    const [board, looped] = pair(boardPath(id), loops);
    leads.push({ key, net: netOf(id), board, loops: looped });
  };

  const topRail: number[] = [];
  const bottomRail: number[] = [];

  for (const col of columns) {
    const { x, steps } = col;
    const topY = col.topBus ? TOP : TOP + FLAG_ROOM;
    const botY = col.bottomBus ? BOT : BOT - FLAG_ROOM;
    const n = steps.length;
    let len = SYM_LEN;
    let gap = (botY - topY - n * len) / (n + 1);
    if (gap < 12) (gap = 12), (len = (botY - topY - 12 * (n + 1)) / n);
    const ys = steps.map((_, k) => topY + gap * (k + 1) + len * k);

    steps.forEach((s, k) => {
      const upAt = { x, y: ys[k]! };
      const downAt = { x, y: ys[k]! + len };
      const loops: XY[] = [];
      loops[s.up === "a" ? 0 : 1] = upAt;
      loops[s.up === "a" ? 1 : 0] = downAt;
      const board = [nodeXY(s.c.a), nodeXY(s.c.b)];
      if (s.c.w) {
        board.push(nodeXY(s.c.w));
        loops.push({ x: x + 16, y: (upAt.y + downAt.y) / 2 });
      }
      symbols.push({ key: s.c.key, partId: s.c.partId, ledId: s.c.ledId, kind: s.c.kind, label: s.c.label, board, loops });

      // The leg facing up.
      const upId = s.c[s.up];
      if (k > 0) {
        const mid = { x, y: (ys[k - 1]! + len + upAt.y) / 2 };
        lead(`${s.c.key}:up`, upId, [upAt, mid]);
      } else if (col.topBus) {
        lead(`${s.c.key}:up`, upId, [upAt, ...toPlus(x)]);
      } else {
        lead(`${s.c.key}:up`, upId, [upAt, { x, y: topY }]);
        flag(`${s.c.key}:up`, col.top, upId, { x, y: topY }, "above");
      }
      // The leg facing down.
      const downId = s.c[other(s.up)];
      if (k < n - 1) {
        const mid = { x, y: (downAt.y + ys[k + 1]!) / 2 };
        lead(`${s.c.key}:down`, downId, [downAt, mid]);
      } else if (col.bottomBus) {
        lead(`${s.c.key}:down`, downId, [downAt, ...toMinus(x)]);
      } else {
        lead(`${s.c.key}:down`, downId, [downAt, { x, y: botY }]);
        flag(`${s.c.key}:down`, col.bottom, downId, { x, y: botY }, "below");
      }
      // A knob's wiper runs out to the right and ends in a label.
      if (s.c.w) {
        const w = loops[2]!;
        const end = { x: x + TAP, y: w.y };
        lead(`${s.c.key}:w`, s.c.w, [w, end]);
        flag(`${s.c.key}:w`, netOf(s.c.w), s.c.w, end, "right");
      }
    });
    if (col.topBus) topRail.push(x);
    if (col.bottomBus) bottomRail.push(x);
  }

  // ── A short: wire alone from power to ground ─────────────────────────

  let shortOut: Diagram["short"] = null;
  if (short && short.path.length) {
    const x = colX(0);
    const from = short.path[0]!.from;
    const to = short.path[short.path.length - 1]!.to;
    const fromBus = PIN_BY_ID.get(from)?.kind === "3v3";
    const toBus = PIN_BY_ID.get(to)?.kind === "gnd";
    const up: XY[] = fromBus ? [...toPlus(x)].reverse() : [{ x, y: TOP + FLAG_ROOM }];
    const down: XY[] = toBus ? toMinus(x) : [{ x, y: BOT - FLAG_ROOM }];
    const pf = (id: NodeId, at: XY, side: DiagramFlag["side"], key: string) => {
      const pin = PIN_BY_ID.get(id);
      flags.push({
        key,
        net: -1,
        kind: pin?.kind === "gpio" ? "pin" : "power",
        label: pin?.label ?? "",
        pin: pin?.kind === "gpio" ? id : undefined,
        side,
        board: nodeXY(id),
        loops: at,
      });
    };
    if (!fromBus) pf(from, up[0]!, "above", "short:from");
    if (!toBus) pf(to, down[0]!, "below", "short:to");
    if (fromBus) topRail.push(x);
    if (toBus) bottomRail.push(x);
    const [board, looped] = pair(pathPoints(short.path), [...up, ...down], K * 2);
    shortOut = { board, loops: looped };
  }

  // A dot wherever a column joins a rail that carries on past it.
  const dots: XY[] = [];
  const rail = (xs: number[], y: number) => {
    const far = Math.max(...xs);
    for (const x of xs) if (x < far) dots.push({ x, y });
  };
  if (topRail.length) rail(topRail, TOP);
  if (bottomRail.length) rail(bottomRail, BOT);

  // The battery rises out of the board's power pins.
  const v3 = PINS.find((p) => p.kind === "3v3")!;
  const b0 = nodeXY(v3.id);
  const b1 = nodeXY(PINS.find((p) => p.kind === "gnd" && p.side === v3.side)!.id);
  const battery = { board: { x: (b0.x + b1.x) / 2, y: (b0.y + b1.y) / 2 }, loops: { x: BAT_X, y: midY }, plus, minus };

  for (let n = 0; n < index.size; n++) if (!nets[n]) netInfo(n);
  return { nets, symbols, leads, flags, dots, short: shortOut, battery, roomy: spacing >= 64 };
}

/** The points a path of edges runs through on the board. */
function pathPoints(path: Edge[]): XY[] {
  return [nodeXY(path[0]!.from), ...path.map((e) => nodeXY(e.to))];
}

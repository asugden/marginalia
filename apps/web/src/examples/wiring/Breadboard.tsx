// The sandbox figure: a development board above a half-size breadboard.
//
// All drawing is hand-made SVG in one coordinate system (model.ts), so a
// pointer position maps straight to a hole. Holes are not DOM elements;
// the SVG snaps the pointer to the nearest one. Parts are elements, so they
// can be selected, pressed, turned, and dragged by their legs.

import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { pinState, type Analysis, type Circuit, type Edge } from "./analyze.js";
import {
  BB_X0,
  BB_X1,
  BB_Y,
  BB_Y1,
  BOARD,
  CHANNEL_Y,
  COLS,
  HOLES,
  MAIN_ROWS,
  P,
  PINS,
  PIN_BY_ID,
  STRIPS,
  VIEW_H,
  VIEW_W,
  WIRE_COLORS,
  buttonLegs,
  colX,
  holeInfo,
  isRail,
  legsOf,
  nearestNode,
  nodeXY,
  potLegs,
  rowY,
  SEG_BOTTOM,
  SEG_TOP,
  seg7Legs,
  type Button,
  type MainRow,
  type NodeId,
  type Part,
  type PinState,
  type Pot,
  type Seg7,
  type TwoLeg,
  type WireColor,
} from "./model.js";

export type Tool = "move" | "wire" | "resistor" | "led" | "button" | "pot" | "seg7";

export interface BreadboardProps {
  circuit: Circuit;
  analysis: Analysis;
  /** Draw a short's path, or leave it for the reader to find. */
  showShort: boolean;
  tool: Tool;
  wireColor: WireColor | "auto";
  xray: boolean;
  netColors: boolean;
  /** A part id or a pin id. */
  selected: string | null;
  popping: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onAdd: (part: Part) => void;
  onChange: (id: string, patch: Partial<Part>) => void;
  onPress: (id: string, down: boolean) => void;
  onPinClick: (id: NodeId) => void;
}

type XY = { x: number; y: number };

type Drag =
  | { mode: "new"; kind: "wire" | "resistor" | "led"; from: NodeId; x: number; y: number }
  | { mode: "leg"; id: string; end: "a" | "b"; fixed: NodeId; x: number; y: number }
  /** Moving a button, potentiometer or display by one of its legs. */
  | { mode: "shift"; id: string; leg: number; x: number; y: number }
  | { mode: "knob"; id: string; x0: number; y0: number; turn0: number; x: number; y: number };

// Colours by connection. Supply and ground keep the colours a jumper-wire
// convention already gives them; the rest take the general data-mark hues.
const NET_SUPPLY = "var(--salmon-600)";
const NET_GROUND = "var(--ink-700, #3d3831)";
const NET_HUES = ["var(--purple-600)", "var(--amber-600)", "var(--green-600)", "var(--blue-600)", "#00879c"];

/** Capture the pointer so a drag keeps its events when it leaves the element.
 *  Throws for a pointer the browser no longer tracks; the drag works without
 *  it, so that is not worth failing over. */
function capture(el: Element | null | undefined, pointerId: number) {
  try {
    el?.setPointerCapture(pointerId);
  } catch {
    /* ignore */
  }
}

let partSeq = 0;
const newId = (k: string) => `${k}-u${++partSeq}`;

// ── Geometry helpers ────────────────────────────────────────────────────

/** The control point of a jumper's gentle arc. Symmetric in its ends, so the
 *  current overlay can retrace it in either direction. */
function arcControl(a: XY, b: XY): XY {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) (nx = -nx), (ny = -ny);
  const bulge = Math.min(46, 6 + len * 0.16);
  return { x: (a.x + b.x) / 2 + nx * bulge, y: (a.y + b.y) / 2 + ny * bulge };
}

/** Where an LED or resistor body sits: its legs' midpoint, nudged off the
 *  line so the legs read as bent wire. */
function bodyAt(a: XY, b: XY, lift: number): XY {
  const c = arcControl(a, b);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const d = Math.hypot(c.x - mx, c.y - my) || 1;
  return { x: mx + ((c.x - mx) / d) * lift, y: my + ((c.y - my) / d) * lift };
}

function edgeSegment(e: Edge, parts: Map<string, Part>): string {
  const to = nodeXY(e.to);
  const part = e.partId ? parts.get(e.partId) : undefined;
  if (e.kind === "wire" && part?.kind === "wire") {
    const c = arcControl(nodeXY(part.a), nodeXY(part.b));
    return `Q ${c.x} ${c.y} ${to.x} ${to.y}`;
  }
  if ((e.kind === "led" || e.kind === "resistor") && (part?.kind === "led" || part?.kind === "resistor")) {
    const body = bodyAt(nodeXY(part.a), nodeXY(part.b), e.kind === "led" ? 16 : 6);
    return `L ${body.x} ${body.y} L ${to.x} ${to.y}`;
  }
  return `L ${to.x} ${to.y}`;
}

function pathD(path: Edge[], parts: Map<string, Part>): string {
  if (!path.length) return "";
  const s = nodeXY(path[0]!.from);
  return `M ${s.x} ${s.y} ` + path.map((e) => edgeSegment(e, parts)).join(" ");
}

// ── Component ──────────────────────────────────────────────────────────

export function Breadboard(props: BreadboardProps) {
  const { circuit, analysis, tool, xray, netColors, selected, popping } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<NodeId | null>(null);

  // The drag lives in a ref as well as state: pointer events can arrive
  // faster than React re-renders, and each handler must see the latest.
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const occupied = useMemo(() => {
    const m = new Map<NodeId, string>();
    for (const p of circuit.parts) for (const l of legsOf(p)) m.set(l, p.id);
    return m;
  }, [circuit.parts]);

  const freeFor = (legs: NodeId[], self?: string) =>
    legs.every((l) => {
      const owner = occupied.get(l);
      return !owner || owner === self;
    });

  // Where a button or pot would land if dropped now.
  const shifted = (d: Extract<Drag, { mode: "shift" }>, part: Button | Pot | Seg7): Button | Pot | Seg7 | null => {
    const n = nearestNode(d.x, d.y);
    const h = n ? holeInfo(n) : undefined;
    if (!h || isRail(h.row)) return null;
    if (part.kind === "seg7") {
      const col = h.col - (d.leg % 5);
      if (col < 1 || col > COLS - 4) return null;
      const next = { ...part, col };
      return freeFor(seg7Legs(next), part.id) ? next : null;
    }
    if (part.kind === "button") {
      const col = h.col - (d.leg >= 2 ? 2 : 0);
      if (col < 1 || col > COLS - 2) return null;
      const next = { ...part, col };
      return freeFor(buttonLegs(next), part.id) ? next : null;
    }
    const col = h.col - d.leg;
    if (col < 1 || col > COLS - 2) return null;
    const next = { ...part, col, row: h.row as MainRow };
    return freeFor(potLegs(next), part.id) ? next : null;
  };

  // Parts as drawn: a part being dragged is drawn where it would land.
  const parts = useMemo(() => {
    if (!drag) return circuit.parts;
    return circuit.parts.map((p) => {
      if (drag.mode === "shift" && drag.id === p.id && (p.kind === "button" || p.kind === "pot" || p.kind === "seg7")) {
        return shifted(drag, p) ?? p;
      }
      if (drag.mode === "knob" && drag.id === p.id && p.kind === "pot") {
        return { ...p, turn: knobTurn(drag) };
      }
      return p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuit.parts, drag]);
  const partMap = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  // Nets worth a colour: the ones something is plugged into.
  const netColor = useMemo(() => {
    const m = new Map<number, string>();
    let k = 0;
    const used = new Set<number>();
    for (const p of circuit.parts) for (const l of legsOf(p)) used.add(analysis.netOf(l));
    for (const n of [...used].sort((x, y) => x - y)) {
      if (analysis.supplyNets.has(n)) m.set(n, NET_SUPPLY);
      else if (analysis.groundNets.has(n)) m.set(n, NET_GROUND);
      else m.set(n, NET_HUES[k++ % NET_HUES.length]!);
    }
    return m;
  }, [analysis, circuit.parts]);

  const powered = !analysis.short;
  const hoverNet = hover ? analysis.netOf(hover) : -1;

  const toSvg = (e: { clientX: number; clientY: number }): XY => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };

  // ── Background pointer handling ──────────────────────────────────────

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    const { x, y } = toSvg(e);
    const node = nearestNode(x, y);
    const h = node ? holeInfo(node) : undefined;
    if (tool === "button") {
      if (h && !isRail(h.row)) {
        const b: Button = { id: newId("btn"), kind: "button", col: Math.max(1, Math.min(COLS - 2, h.col - 1)), turned: false };
        if (freeFor(buttonLegs(b))) props.onAdd(b), props.onSelect(b.id);
      }
      return;
    }
    if (tool === "pot") {
      if (h && !isRail(h.row)) {
        const p: Pot = { id: newId("pot"), kind: "pot", row: h.row as MainRow, col: Math.max(1, Math.min(COLS - 2, h.col - 1)), turn: 0.5 };
        if (freeFor(potLegs(p))) props.onAdd(p), props.onSelect(p.id);
      }
      return;
    }
    if (tool === "seg7") {
      if (h && !isRail(h.row)) {
        const d: Seg7 = { id: newId("seg"), kind: "seg7", col: Math.max(1, Math.min(COLS - 4, h.col - 2)) };
        if (freeFor(seg7Legs(d))) props.onAdd(d), props.onSelect(d.id);
      }
      return;
    }
    if (tool === "move" || !node || occupied.has(node)) {
      props.onSelect(null);
      return;
    }
    capture(svgRef.current, e.pointerId);
    setDrag({ mode: "new", kind: tool, from: node, x, y });
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const { x, y } = toSvg(e);
    setHover(nearestNode(x, y));
    const d = dragRef.current;
    if (!d) return;
    const next = { ...d, x, y } as Drag;
    setDrag(next);
    // The knob turns the real part as it moves, so the LED follows live.
    if (next.mode === "knob") props.onChange(next.id, { turn: knobTurn(next) });
  };

  const finishDrag = (e: RPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toSvg(e);
    const done = { ...d, x, y } as Drag;
    setDrag(null);
    if (done.mode === "knob") {
      props.onChange(done.id, { turn: knobTurn(done) });
      return;
    }
    if (done.mode === "shift") {
      const part = circuit.parts.find((p) => p.id === done.id);
      if (part && (part.kind === "button" || part.kind === "pot" || part.kind === "seg7")) {
        const next = shifted(done, part);
        if (next) props.onChange(part.id, next);
      }
      return;
    }
    const node = nearestNode(x, y);
    if (!node) return;
    if (done.mode === "new") {
      if (node === done.from || occupied.has(node)) return;
      const part: TwoLeg = { id: newId(done.kind), kind: done.kind, a: done.from, b: node };
      if (done.kind === "wire") part.color = pickColor(props.wireColor, done.from, node);
      if (done.kind === "resistor") part.ohms = 220;
      props.onAdd(part);
      props.onSelect(part.id);
    } else {
      if (node === done.fixed) return;
      const owner = occupied.get(node);
      if (owner && owner !== done.id) return;
      props.onChange(done.id, { [done.end]: node });
    }
  };

  const begin = (e: RPointerEvent, d: Drag, select: string) => {
    e.stopPropagation();
    capture(svgRef.current, e.pointerId);
    props.onSelect(select);
    setDrag(d);
  };

  // ── Rendering ────────────────────────────────────────────────────────

  const colorOfNode = (id: NodeId) => netColor.get(analysis.netOf(id));
  const litLoops = analysis.leds.filter((l) => l.status === "lit" && l.loop);
  const ledById = new Map(analysis.leds.map((l) => [l.id, l]));

  const legPos = (p: TwoLeg, end: "a" | "b"): XY => {
    if (drag?.mode === "leg" && drag.id === p.id && drag.end === end) return { x: drag.x, y: drag.y };
    return nodeXY(end === "a" ? p.a : p.b);
  };

  return (
    <svg
      ref={svgRef}
      className={`wr-svg wr-tool-${tool}${drag ? " wr-svg--dragging" : ""}`}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={VIEW_W}
      height={VIEW_H}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      role="img"
      aria-label="A development board above a breadboard"
    >
      <defs>
        <radialGradient id="wr-glow">
          <stop offset="0%" stopColor="#ff5a3c" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#ff5a3c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff5a3c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <DevBoard
        powered={powered}
        circuit={circuit}
        analysis={analysis}
        hover={hover}
        selected={selected}
        onPinClick={props.onPinClick}
      />

      {/* ── The breadboard body ── */}
      <rect x={BB_X0} y={BB_Y} width={BB_X1 - BB_X0} height={BB_Y1 - BB_Y} rx={8} className="wr-bb" />
      <rect x={BB_X0 + 8} y={CHANNEL_Y - 7} width={BB_X1 - BB_X0 - 16} height={14} rx={3} className="wr-bb-channel" />
      {(["tp", "tn", "bn", "bp"] as const).map((r) => {
        const y = rowY(r) + (r === "tp" || r === "bn" ? -P * 0.5 : P * 0.5);
        return (
          <line
            key={r}
            x1={colX(1) - 8}
            x2={colX(COLS) + 8}
            y1={y}
            y2={y}
            className={r === "tp" || r === "bp" ? "wr-rail-plus" : "wr-rail-minus"}
          />
        );
      })}
      {(["tp", "tn", "bn", "bp"] as const).map((r) => (
        <text key={r} x={BB_X0 + 12} y={rowY(r) + 4} className="wr-bb-sign">
          {r === "tp" || r === "bp" ? "+" : "−"}
        </text>
      ))}
      {MAIN_ROWS.map((r) => (
        <text key={r} x={BB_X0 + 13} y={rowY(r) + 3.5} className="wr-bb-letter">
          {r}
        </text>
      ))}
      {Array.from({ length: COLS }, (_, i) => i + 1)
        .filter((c) => c === 1 || c % 5 === 0)
        .map((c) => (
          <g key={c}>
            <text x={colX(c)} y={rowY("a") - P * 0.62} className="wr-bb-num">
              {c}
            </text>
            <text x={colX(c)} y={rowY("j") + P * 0.95} className="wr-bb-num">
              {c}
            </text>
          </g>
        ))}

      {/* ── X-ray: the metal strips inside ── */}
      {xray &&
        STRIPS.map((strip, i) => {
          const a = nodeXY(strip[0]!);
          const b = nodeXY(strip[strip.length - 1]!);
          const col = netColors ? colorOfNode(strip[0]!) : undefined;
          const lit = hoverNet >= 0 && analysis.netOf(strip[0]!) === hoverNet;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`wr-strip${lit ? " wr-strip--hover" : ""}`}
              style={col ? { stroke: col } : undefined}
            />
          );
        })}

      {/* ── Holes ── */}
      {HOLES.map((h) => {
        const inHover = hoverNet >= 0 && analysis.netOf(h.id) === hoverNet;
        const col = netColors ? colorOfNode(h.id) : undefined;
        return (
          <rect
            key={h.id}
            x={h.x - 3.5}
            y={h.y - 3.5}
            width={7}
            height={7}
            rx={1.2}
            className={`wr-hole${inHover ? " wr-hole--hover" : ""}`}
            style={col ? { fill: col, stroke: col } : undefined}
          />
        );
      })}

      {/* ── Parts ── */}
      {parts.map((p) => {
        const isSel = p.id === selected;
        const select = (e: RPointerEvent) => {
          e.stopPropagation();
          props.onSelect(p.id);
        };
        if (p.kind === "button") {
          return (
            <PushButton
              key={p.id}
              part={p}
              pressed={circuit.pressed.has(p.id)}
              selected={isSel}
              xray={xray}
              onDown={(e) => {
                e.stopPropagation();
                capture(e.currentTarget as Element, e.pointerId);
                props.onSelect(p.id);
                props.onPress(p.id, true);
              }}
              onUp={() => props.onPress(p.id, false)}
            />
          );
        }
        if (p.kind === "seg7") {
          return (
            <Display
              key={p.id}
              part={p}
              leds={ledById}
              selected={isSel}
              xray={xray}
              onDown={select}
            />
          );
        }
        if (p.kind === "pot") {
          return (
            <Potentiometer
              key={p.id}
              part={p}
              selected={isSel}
              onKnob={(e) => {
                const { x, y } = toSvg(e);
                begin(e, { mode: "knob", id: p.id, x0: x, y0: y, turn0: p.turn, x, y }, p.id);
              }}
              onDown={select}
            />
          );
        }
        const a = legPos(p, "a");
        const b = legPos(p, "b");
        if (p.kind === "wire") {
          const c = arcControl(a, b);
          const color = netColors ? (colorOfNode(p.a) ?? "#888") : WIRE_COLORS[(p.color as WireColor) ?? "yellow"];
          const d = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
          return (
            <g key={p.id} className={`wr-part${isSel ? " wr-part--sel" : ""}`} onPointerDown={select}>
              <path d={d} className="wr-wire-hit" />
              <path d={d} className="wr-wire" style={{ stroke: color }} />
              <circle cx={a.x} cy={a.y} r={3.2} className="wr-wire-end" />
              <circle cx={b.x} cy={b.y} r={3.2} className="wr-wire-end" />
            </g>
          );
        }
        if (p.kind === "resistor") return <Resistor key={p.id} a={a} b={b} selected={isSel} onDown={select} />;
        const r = ledById.get(p.id);
        return (
          <Led
            key={p.id}
            a={a}
            b={b}
            status={r?.status ?? "idle"}
            brightness={r?.brightness ?? 0}
            popping={popping.has(p.id)}
            selected={isSel}
            onDown={select}
          />
        );
      })}

      {/* ── Current, drawn along the physical path ── */}
      {(!drag || drag.mode === "knob") &&
        litLoops.map((l) => (
          <path
            key={l.id}
            d={pathD(l.loop!, partMap)}
            className="wr-flow"
            style={{ opacity: 0.25 + 0.75 * l.brightness }}
          />
        ))}
      {analysis.short && props.showShort && <path d={pathD(analysis.short.path, partMap)} className="wr-short" />}

      {/* ── A wire being drawn ── */}
      {drag?.mode === "new" && <DragPreview from={nodeXY(drag.from)} to={{ x: drag.x, y: drag.y }} kind={drag.kind} />}

      {/* ── Leg handles: grab a leg to move it, or the part it belongs to ── */}
      {parts.map((p) => {
        if (p.kind === "button" || p.kind === "pot" || p.kind === "seg7") {
          return legsOf(p).map((l, i) => {
            const { x, y } = nodeXY(l);
            return (
              <circle
                key={`${p.id}-${i}`}
                cx={x}
                cy={y}
                r={7}
                className="wr-leg-handle"
                onPointerDown={(e) => {
                  const pt = toSvg(e);
                  begin(e, { mode: "shift", id: p.id, leg: i, x: pt.x, y: pt.y }, p.id);
                }}
              />
            );
          });
        }
        return (["a", "b"] as const).map((end) => {
          const pos = legPos(p, end);
          return (
            <circle
              key={`${p.id}-${end}`}
              cx={pos.x}
              cy={pos.y}
              r={7}
              className="wr-leg-handle"
              onPointerDown={(e) => {
                const pt = toSvg(e);
                begin(e, { mode: "leg", id: p.id, end, fixed: end === "a" ? p.b : p.a, x: pt.x, y: pt.y }, p.id);
              }}
            />
          );
        });
      })}

      {/* ── Hovered hole or pin, and where a drag would land ── */}
      {hover && !drag && <HoverTag id={hover} state={pinState(circuit, hover)} occupied={occupied.has(hover)} />}
      {(drag?.mode === "new" || drag?.mode === "leg") &&
        (() => {
          const n = nearestNode(drag.x, drag.y);
          if (!n) return null;
          const owner = occupied.get(n);
          const bad = !!owner && owner !== (drag.mode === "leg" ? drag.id : undefined);
          const { x, y } = nodeXY(n);
          return <circle cx={x} cy={y} r={7} className={bad ? "wr-snap wr-snap--bad" : "wr-snap"} />;
        })()}
    </svg>
  );
}

/** Drag up or right to turn clockwise. */
function knobTurn(d: Extract<Drag, { mode: "knob" }>) {
  return Math.max(0, Math.min(1, d.turn0 + (d.x - d.x0 - (d.y - d.y0)) / 160));
}

function pickColor(choice: WireColor | "auto", a: NodeId, b: NodeId): WireColor {
  if (choice !== "auto") return choice;
  const kinds = [a, b].map((n) => {
    const pin = PIN_BY_ID.get(n);
    if (pin) return pin.kind === "gnd" ? "gnd" : pin.kind === "3v3" || pin.kind === "vin" ? "plus" : "sig";
    const h = holeInfo(n);
    if (h && isRail(h.row)) return h.row === "tp" || h.row === "bp" ? "plus" : "gnd";
    return "other";
  });
  if (kinds.includes("gnd")) return "black";
  if (kinds.includes("plus")) return "red";
  if (kinds.includes("sig")) return "yellow";
  const cycle: WireColor[] = ["green", "blue", "orange"];
  return cycle[partSeq % cycle.length]!;
}

// ── Pieces ─────────────────────────────────────────────────────────────

function DevBoard({
  powered,
  circuit,
  analysis,
  hover,
  selected,
  onPinClick,
}: {
  powered: boolean;
  circuit: Circuit;
  analysis: Analysis;
  hover: NodeId | null;
  selected: string | null;
  onPinClick: (id: NodeId) => void;
}) {
  const { x0, x1, y0, y1 } = BOARD;
  const readings = new Map(analysis.readings.map((r) => [r.id, r]));
  return (
    <g className="wr-board">
      <rect x={x0 - 14} y={(y0 + y1) / 2 - 17} width={26} height={34} rx={5} className="wr-usb" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={7} className="wr-pcb" />
      <rect x={370} y={y0 + 68} width={158} height={84} rx={3} className="wr-module" />
      <rect x={378} y={y0 + 74} width={116} height={72} rx={2} className="wr-can" />
      <text x={436} y={y0 + 114} className="wr-can-text">
        ESP32
      </text>
      <path
        d={`M 504 ${y0 + 80} h 16 v 10 h -12 v 10 h 12 v 10 h -12 v 10 h 12 v 10 h -12 v 10 h 12 v 10 h -16`}
        className="wr-antenna"
      />
      <circle cx={x0 + 30} cy={y0 + 78} r={4} className={powered ? "wr-pwr wr-pwr--on" : "wr-pwr"} />
      <text x={x0 + 30} y={y0 + 94} className="wr-board-tiny">
        PWR
      </text>
      <rect x={x0 + 22} y={y0 + 122} width={14} height={10} rx={2} className="wr-smd-btn" />
      <rect x={x0 + 22} y={y0 + 142} width={14} height={10} rx={2} className="wr-smd-btn" />

      {PINS.map((p) => {
        const isGpio = p.kind === "gpio";
        const s = pinState(circuit, p.id);
        const r = readings.get(p.id);
        const ly = p.side === "T" ? p.y + 26 : p.y - 26;
        const cls = ["wr-pinlabel"];
        if (isGpio) cls.push("wr-pinlabel--gpio", ...pinClasses(s));
        if (r) cls.push(r.digital === "floating" ? "wr-pinlabel--floating" : r.digital === "HIGH" ? "wr-pinlabel--reads-high" : "wr-pinlabel--reads-low");
        if (selected === p.id) cls.push("wr-pinlabel--sel");
        return (
          <g key={p.id}>
            <rect x={p.x - 6} y={p.y - 6} width={12} height={12} rx={1.5} className="wr-pin" />
            <rect
              x={p.x - 2.5}
              y={p.y - 2.5}
              width={5}
              height={5}
              className={`wr-pin-hole${hover === p.id ? " wr-pin-hole--hover" : ""}`}
            />
            <g
              data-pin={p.id}
              className={cls.join(" ")}
              style={s.mode === "PWM" ? { ["--wr-duty" as string]: String(0.2 + (0.8 * s.duty) / 255) } : undefined}
              onPointerDown={
                isGpio
                  ? (e) => {
                      e.stopPropagation();
                      onPinClick(p.id);
                    }
                  : undefined
              }
            >
              <rect x={p.x - 8} y={ly - 17} width={16} height={34} rx={3} className="wr-pinlabel-bg" />
              <text x={p.x} y={ly} transform={`rotate(-90 ${p.x} ${ly})`} className="wr-pinlabel-text">
                {p.label}
              </text>
            </g>
          </g>
        );
      })}
    </g>
  );
}

function pinClasses(s: PinState): string[] {
  switch (s.mode) {
    case "OUTPUT":
      return [s.level ? "wr-pinlabel--high" : "wr-pinlabel--low"];
    case "PWM":
      return ["wr-pinlabel--pwm"];
    case "INPUT_PULLDOWN":
      return ["wr-pinlabel--pulldown"];
    default:
      return [];
  }
}

function Resistor({ a, b, selected, onDown }: { a: XY; b: XY; selected: boolean; onDown: (e: RPointerEvent) => void }) {
  const body = bodyAt(a, b, 6);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const w = Math.max(14, Math.min(30, len - 12));
  const bands = ["#d0342c", "#d0342c", "#7a4a1e", "#c9a227"];
  return (
    <g className={`wr-part${selected ? " wr-part--sel" : ""}`} onPointerDown={onDown}>
      <polyline points={`${a.x},${a.y} ${body.x},${body.y} ${b.x},${b.y}`} className="wr-leg" />
      <g transform={`translate(${body.x} ${body.y}) rotate(${angle > 90 || angle < -90 ? angle + 180 : angle})`}>
        <rect x={-w / 2} y={-5} width={w} height={10} rx={4.5} className="wr-res-body" />
        {bands.map((c, i) => (
          <rect key={i} x={-w / 2 + 4 + i * ((w - 10) / 3.4)} y={-5} width={2.6} height={10} fill={c} />
        ))}
      </g>
    </g>
  );
}

function Led({
  a,
  b,
  status,
  brightness,
  popping,
  selected,
  onDown,
}: {
  a: XY;
  b: XY;
  status: string;
  brightness: number;
  popping: boolean;
  selected: boolean;
  onDown: (e: RPointerEvent) => void;
}) {
  const body = bodyAt(a, b, 16);
  const lit = status === "lit" && brightness > 0.01;
  const burnt = status === "burnt";
  // The long leg (anode) gets a kink, as on the real part.
  const ak = { x: (a.x + body.x) / 2 + 3, y: (a.y + body.y) / 2 };
  return (
    <g className={`wr-part${selected ? " wr-part--sel" : ""}`} onPointerDown={onDown}>
      <polyline points={`${a.x},${a.y} ${ak.x},${ak.y} ${body.x},${body.y}`} className="wr-leg" />
      <polyline points={`${b.x},${b.y} ${body.x},${body.y}`} className="wr-leg" />
      {lit && (
        <circle
          cx={body.x}
          cy={body.y}
          r={14 + 22 * brightness}
          fill="url(#wr-glow)"
          className="wr-led-glow"
          style={{ opacity: 0.2 + 0.8 * brightness }}
        />
      )}
      <circle cx={body.x} cy={body.y} r={9.5} className={burnt ? "wr-led wr-led--burnt" : "wr-led"} />
      {lit && <circle cx={body.x} cy={body.y} r={9.5} className="wr-led-light" style={{ opacity: brightness }} />}
      <circle cx={body.x - 3} cy={body.y - 3} r={2.6} className="wr-led-shine" />
      {burnt && (
        <path
          d={`M ${body.x - 5} ${body.y - 4} l 4 4 l -2 3 l 5 3 M ${body.x + 4} ${body.y - 6} l -2 5`}
          className="wr-led-crack"
        />
      )}
      <text x={a.x + (a.x <= b.x ? -9 : 9)} y={a.y - 7} className="wr-led-plus">
        +
      </text>
      {popping && (
        <g className="wr-pop">
          <circle cx={body.x} cy={body.y} r={10} className="wr-pop-ring" />
          <circle cx={body.x - 4} cy={body.y - 12} r={6} className="wr-smoke wr-smoke--1" />
          <circle cx={body.x + 5} cy={body.y - 16} r={7} className="wr-smoke wr-smoke--2" />
          <circle cx={body.x} cy={body.y - 22} r={8} className="wr-smoke wr-smoke--3" />
        </g>
      )}
    </g>
  );
}

/** A push button, drawn so its orientation shows. The body carries metal
 *  tabs on the two sides the legs leave from, and each leg bends from its
 *  tab down to its hole. Turning the button rotates the body (animated) and
 *  moves the legs to the other two sides. In X-ray the internal pairs show
 *  as bars joining the tabs that face each other. */
function PushButton({
  part,
  pressed,
  selected,
  xray,
  onDown,
  onUp,
}: {
  part: Button;
  pressed: boolean;
  selected: boolean;
  xray: boolean;
  onDown: (e: RPointerEvent) => void;
  onUp: () => void;
}) {
  const cx = colX(part.col + 1);
  const cy = CHANNEL_Y;
  // Real proportions: a 6 mm body nearly as wide as its legs are apart.
  const H = 23; // half the body
  const T = 15; // where the legs leave, off the centre line
  const legs = buttonLegs(part).map((l) => {
    const h = nodeXY(l);
    const sx = Math.sign(h.x - cx);
    const sy = Math.sign(h.y - cy);
    const exit = part.turned ? { x: cx + sx * H, y: cy + sy * T } : { x: cx + sx * T, y: cy + sy * H };
    const knee = part.turned ? { x: cx + sx * (H + 7), y: cy + sy * T } : { x: cx + sx * T, y: cy + sy * (H + 4) };
    return `M ${exit.x} ${exit.y} L ${knee.x} ${knee.y} L ${h.x} ${h.y}`;
  });
  return (
    <g
      className={`wr-part wr-button${selected ? " wr-part--sel" : ""}`}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {legs.map((d, i) => (
        <path key={`${part.turned}-${i}`} d={d} className="wr-leg wr-btn-leg" />
      ))}
      <g
        className="wr-btn-rot"
        style={{ transform: `rotate(${part.turned ? 90 : 0}deg)`, transformOrigin: `${cx}px ${cy}px` }}
      >
        {/* Drawn upright: tabs on the top and bottom edges. */}
        <rect x={cx - H + 3} y={cy - H - 4} width={2 * H - 6} height={6} rx={1.5} className="wr-btn-tab" />
        <rect x={cx - H + 3} y={cy + H - 2} width={2 * H - 6} height={6} rx={1.5} className="wr-btn-tab" />
        <rect x={cx - H} y={cy - H} width={2 * H} height={2 * H} rx={2.5} className="wr-btn-body" />
        {xray && (
          <>
            <line x1={cx - T} y1={cy - H + 2} x2={cx - T} y2={cy + H - 2} className="wr-btn-pair" />
            <line x1={cx + T} y1={cy - H + 2} x2={cx + T} y2={cy + H - 2} className="wr-btn-pair" />
          </>
        )}
        <circle cx={cx} cy={cy} r={pressed ? 10 : 12} className={pressed ? "wr-btn-cap wr-btn-cap--down" : "wr-btn-cap"} />
      </g>
    </g>
  );
}

/** A common-ground seven-segment display. Its body covers its own legs, as
 *  the real part does; X-ray names each leg. */
function Display({
  part,
  leds,
  selected,
  xray,
  onDown,
}: {
  part: Seg7;
  leds: Map<string, { status: string; brightness: number }>;
  selected: boolean;
  xray: boolean;
  onDown: (e: RPointerEvent) => void;
}) {
  const x0 = colX(part.col) - 12;
  const x1 = colX(part.col + 4) + 12;
  const y0 = rowY("e") - 10;
  const y1 = rowY("f") + 10;
  const cx = (x0 + x1) / 2 - 4;
  const cy = (y0 + y1) / 2;
  // Segment geometry, in a 36 × 60 box centred on (cx, cy), slightly slanted.
  const W = 34;
  const Hh = 30;
  const t = 6;
  const sk = 0.12;
  const pt = (x: number, y: number) => `${cx + x - y * sk},${cy + y}`;
  const hSeg = (y: number) =>
    [pt(-W / 2 + t, y - t / 2), pt(W / 2 - t, y - t / 2), pt(W / 2 - t / 2, y), pt(W / 2 - t, y + t / 2), pt(-W / 2 + t, y + t / 2), pt(-W / 2 + t / 2, y)].join(" ");
  const vSeg = (x: number, ya: number, yb: number) =>
    [pt(x, ya + t / 2), pt(x + t / 2, ya + t), pt(x + t / 2, yb - t), pt(x, yb - t / 2), pt(x - t / 2, yb - t), pt(x - t / 2, ya + t)].join(" ");
  const shapes: Record<string, string> = {
    a: hSeg(-Hh),
    g: hSeg(0),
    d: hSeg(Hh),
    f: vSeg(-W / 2, -Hh, 0),
    b: vSeg(W / 2, -Hh, 0),
    e: vSeg(-W / 2, 0, Hh),
    c: vSeg(W / 2, 0, Hh),
  };
  const segState = (s: string) => leds.get(`${part.id}:${s}`);
  return (
    <g className={`wr-part wr-seg7${selected ? " wr-part--sel" : ""}`} onPointerDown={onDown}>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={3} className="wr-seg7-body" />
      {Object.entries(shapes).map(([s, d]) => {
        const st = segState(s);
        const b = st?.status === "lit" ? st.brightness : 0;
        return (
          <g key={s}>
            <polygon points={d} className={st?.status === "burnt" ? "wr-seg wr-seg--burnt" : "wr-seg"} />
            {b > 0.01 && <polygon points={d} className="wr-seg-lit" style={{ opacity: 0.15 + 0.85 * b }} />}
          </g>
        );
      })}
      {(() => {
        const st = segState("dp");
        const b = st?.status === "lit" ? st.brightness : 0;
        const dx = cx + W / 2 + 7 - Hh * sk;
        return (
          <g>
            <circle cx={dx} cy={cy + Hh} r={3.5} className="wr-seg" />
            {b > 0.01 && <circle cx={dx} cy={cy + Hh} r={3.5} className="wr-seg-lit" style={{ opacity: 0.15 + 0.85 * b }} />}
          </g>
        );
      })()}
      {xray &&
        [...SEG_TOP.map((l, i) => ({ l, x: colX(part.col + i), y: rowY("e") - 13 })), ...SEG_BOTTOM.map((l, i) => ({ l, x: colX(part.col + i), y: rowY("f") + 19 }))].map(
          ({ l, x, y }, i) => (
            <text key={i} x={x} y={y} className={l === "GND" ? "wr-seg-pin wr-seg-pin--gnd" : "wr-seg-pin"}>
              {l === "GND" ? "⏚" : l}
            </text>
          ),
        )}
    </g>
  );
}

/** A trimmer potentiometer: three legs in a row, a body above them, and a
 *  knob whose pointer sweeps 270°. */
function Potentiometer({
  part,
  selected,
  onKnob,
  onDown,
}: {
  part: Pot;
  selected: boolean;
  onKnob: (e: RPointerEvent) => void;
  onDown: (e: RPointerEvent) => void;
}) {
  const legs = potLegs(part).map(nodeXY);
  const mid = legs[1]!;
  // Sits over its legs, lifted toward the channel side so the legs show.
  const up = "abcde".includes(part.row) ? -1 : 1;
  const cy = mid.y + up * 20;
  const angle = -135 + part.turn * 270;
  const rad = ((angle - 90) * Math.PI) / 180;
  const R = 11;
  return (
    <g className={`wr-part${selected ? " wr-part--sel" : ""}`} onPointerDown={onDown}>
      {legs.map((l, i) => (
        <line key={i} x1={l.x} y1={l.y} x2={l.x} y2={cy - up * 12} className="wr-leg" />
      ))}
      <rect x={mid.x - 25} y={cy - 16} width={50} height={32} rx={4} className="wr-pot-body" />
      <g className="wr-pot-knob" onPointerDown={onKnob}>
        <circle cx={mid.x} cy={cy} r={R + 2} className="wr-pot-ring" />
        <circle cx={mid.x} cy={cy} r={R} className="wr-pot-cap" />
        <line
          x1={mid.x}
          y1={cy}
          x2={mid.x + Math.cos(rad) * (R - 2)}
          y2={cy + Math.sin(rad) * (R - 2)}
          className="wr-pot-pointer"
        />
      </g>
    </g>
  );
}

function DragPreview({ from, to, kind }: { from: XY; to: XY; kind: "wire" | "resistor" | "led" }) {
  if (kind === "wire") {
    const c = arcControl(from, to);
    return <path d={`M ${from.x} ${from.y} Q ${c.x} ${c.y} ${to.x} ${to.y}`} className="wr-wire wr-wire--ghost" />;
  }
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="wr-leg wr-leg--ghost" />;
}

function HoverTag({ id, state, occupied }: { id: NodeId; state: PinState; occupied: boolean }) {
  const pin = PIN_BY_ID.get(id);
  const { x, y } = nodeXY(id);
  if (!pin) return <circle cx={x} cy={y} r={6.5} className={occupied ? "wr-hover wr-hover--full" : "wr-hover"} />;
  const text =
    pin.kind === "gpio"
      ? `${pin.label} · GPIO ${pin.gpio} · ${state.mode}${pin.inputOnly ? " only" : ""}`
      : pin.kind === "3v3"
        ? "3V3 · 3.3 volts out"
        : pin.kind === "vin"
          ? "VIN · 5 volts from USB"
          : pin.kind === "gnd"
            ? "GND · ground, where every loop ends"
            : "EN · reset";
  const w = text.length * 6.1 + 14;
  const ty = pin.side === "T" ? y - 20 : y + 20;
  const tx = Math.max(w / 2 + 4, Math.min(VIEW_W - w / 2 - 4, x));
  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={7} className="wr-hover" />
      <rect x={tx - w / 2} y={ty - 10} width={w} height={20} rx={4} className="wr-tooltip" />
      <text x={tx} y={ty + 4} className="wr-tip-text">
        {text}
      </text>
    </g>
  );
}

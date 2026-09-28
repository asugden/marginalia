// The diagram layer: the circuit as a schematic, over the board or as loops.
//
// schematic.ts builds both layouts; this draws any moment between them.
// `t` runs from 0 (on the board) to 1 (as loops) and is animated here, so
// switching layouts slides every line and symbol from one to the other.
// On the board the layer only draws; the board underneath stays in charge
// of the pointer. As loops, switches press and pin labels click.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Button, Switch } from "../../components/index.js";
import type { Analysis, Circuit, PinReading } from "./analyze.js";
import { pinState } from "./analyze.js";
import { VIEW_H, VIEW_W, type PinState } from "./model.js";
import { corners, type Diagram as DiagramData, type DiagramFlag, type DiagramSymbol, type XY } from "./schematic.js";

export type DiagramMode = "off" | "board" | "loops";

const MORPH_MS = 900;

/** Diagram on or off, and, when on, whether it is pulled into loops. */
export function DiagramControls({ mode, onChange }: { mode: DiagramMode; onChange: (m: DiagramMode) => void }) {
  return (
    <>
      <Switch label="Diagram" checked={mode !== "off"} onChange={(e) => onChange(e.currentTarget.checked ? "board" : "off")} />
      {mode !== "off" && (
        <Button
          size="sm"
          variant={mode === "loops" ? "primary" : "subtle"}
          aria-pressed={mode === "loops"}
          title="Pull the diagram off the board into short loops around a battery"
          onClick={() => onChange(mode === "loops" ? "board" : "loops")}
        >
          Simplify
        </Button>
      )}
    </>
  );
}
const mix = (a: XY, b: XY, t: number): XY => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

// ── Lines, and bridges where they cross ────────────────────────────────

/** Half the width of a bridge. */
const HOP = 4.5;

interface Line {
  key: string;
  /** Lines in one group may meet and overlap; lines in different groups
   *  that cross are not joined, and one bridges the other. */
  net: number;
  pts: XY[];
}

/** Each line as a path of straight runs, with a bridge wherever it crosses
 *  a line it isn't joined to. Of two crossing runs, the more nearly
 *  horizontal one hops, as on a hand-drawn diagram. */
function bridged(lines: Line[]): string[] {
  const box = lines.map((l) => {
    const xs = l.pts.map((p) => p.x);
    const ys = l.pts.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  // Hops per line, per run: where along the run (0–1) each one falls.
  const hops = lines.map((l) => l.pts.slice(1).map(() => [] as number[]));
  const flat = (a: XY, b: XY) => Math.abs(b.x - a.x) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const A = lines[i]!;
      const B = lines[j]!;
      if (A.net === B.net) continue;
      const p = box[i]!;
      const q = box[j]!;
      if (p.x1 < q.x0 || q.x1 < p.x0 || p.y1 < q.y0 || q.y1 < p.y0) continue;
      for (let m = 1; m < A.pts.length; m++) {
        const a0 = A.pts[m - 1]!;
        const a1 = A.pts[m]!;
        for (let n = 1; n < B.pts.length; n++) {
          const b0 = B.pts[n - 1]!;
          const b1 = B.pts[n]!;
          const rx = a1.x - a0.x;
          const ry = a1.y - a0.y;
          const sx = b1.x - b0.x;
          const sy = b1.y - b0.y;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-6) continue;
          const u = ((b0.x - a0.x) * sy - (b0.y - a0.y) * sx) / den;
          const v = ((b0.x - a0.x) * ry - (b0.y - a0.y) * rx) / den;
          // A touch at either end is a join or a corner, not a crossing.
          if (u <= 0.02 || u >= 0.98 || v <= 0.02 || v >= 0.98) continue;
          if (flat(a0, a1) >= flat(b0, b1)) hops[i]![m - 1]!.push(u);
          else hops[j]![n - 1]!.push(v);
        }
      }
    }
  }
  return lines.map((l, i) => {
    let d = `M ${l.pts[0]!.x.toFixed(1)} ${l.pts[0]!.y.toFixed(1)}`;
    for (let m = 1; m < l.pts.length; m++) {
      const a = l.pts[m - 1]!;
      const b = l.pts[m]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / (len || 1);
      const uy = (b.y - a.y) / (len || 1);
      // Bridges bulge up, or left on a vertical run.
      const sweep = ux > 0.01 || (Math.abs(ux) <= 0.01 && uy < 0) ? 1 : 0;
      let last = -Infinity;
      for (const u of hops[i]![m - 1]!.sort((x, y) => x - y)) {
        const s = u * len;
        if (s - last < 2 * HOP + 1 || s < HOP + 1 || len - s < HOP + 1) continue;
        last = s;
        const h0 = { x: a.x + ux * (s - HOP), y: a.y + uy * (s - HOP) };
        const h1 = { x: a.x + ux * (s + HOP), y: a.y + uy * (s + HOP) };
        d += ` L ${h0.x.toFixed(1)} ${h0.y.toFixed(1)} A ${HOP} ${HOP} 0 0 ${sweep} ${h1.x.toFixed(1)} ${h1.y.toFixed(1)}`;
      }
      d += ` L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  });
}

/** Classes for a pin's label, on the board or in the diagram: its mode as
 *  code set it, and what it reads. */
export function pinLabelClasses(s: PinState, reading: PinReading | undefined, selected: boolean): string[] {
  const cls: string[] = [];
  if (s.mode === "OUTPUT") cls.push(s.level ? "wr-pinlabel--high" : "wr-pinlabel--low");
  else if (s.mode === "PWM") cls.push("wr-pinlabel--pwm");
  else if (s.mode === "INPUT_PULLDOWN") cls.push("wr-pinlabel--pulldown");
  if (reading) cls.push(reading.digital === "floating" ? "wr-pinlabel--floating" : reading.digital === "HIGH" ? "wr-pinlabel--reads-high" : "wr-pinlabel--reads-low");
  if (selected) cls.push("wr-pinlabel--sel");
  return cls;
}

export interface DiagramProps {
  diagram: DiagramData;
  mode: Exclude<DiagramMode, "off">;
  circuit: Circuit;
  analysis: Analysis;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onPress: (id: string, down: boolean) => void;
  onPinClick: (id: string) => void;
}

export function Diagram({ diagram, mode, circuit, analysis, selected, onSelect, onPress, onPinClick }: DiagramProps) {
  const target = mode === "loops" ? 1 : 0;
  const [t, setT] = useState(target);
  const tRef = useRef(target);

  useEffect(() => {
    const from = tRef.current;
    if (from === target) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      tRef.current = target;
      setT(target);
      return;
    }
    const t0 = performance.now();
    const dur = MORPH_MS * Math.abs(target - from);
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const v = from + (target - from) * ease(k);
      tRef.current = v;
      setT(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const leds = new Map(analysis.leds.map((l) => [l.id, l]));
  const readings = new Map(analysis.readings.map((r) => [r.id, r]));
  // Labels and the battery belong to the loops; they fade in on the way.
  const late = Math.max(0, (t - 0.45) / 0.55);
  const bat = mix(diagram.battery.board, diagram.battery.loops, t);

  const lines: Line[] = diagram.leads.map((l) => ({ key: l.key, net: l.net, pts: corners(l.board.map((p, i) => mix(p, l.loops[i]!, t))) }));
  if (diagram.short) lines.push({ key: "short", net: -1, pts: corners(diagram.short.board.map((p, i) => mix(p, diagram.short!.loops[i]!, t))) });
  const paths = bridged(lines);

  return (
    <g className={`wr-dg${mode === "loops" ? " wr-dg--loops" : ""}`}>
      {/* Paper over the board: it shows through on the board, and is gone
          as loops. Black ink reads the same in either theme. */}
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} rx={8} className="wr-dg-paper" opacity={0.72 + 0.28 * t} />
      {/* The battery: the board's 3V3 and GND. */}
      <g opacity={late} className="wr-dg-battery" transform={`translate(${bat.x - diagram.battery.loops.x} ${bat.y - diagram.battery.loops.y})`}>
        <line x1={diagram.battery.plus.x - 13} x2={diagram.battery.plus.x + 13} y1={diagram.battery.plus.y} y2={diagram.battery.plus.y} className="wr-dg-cell" />
        <line x1={diagram.battery.minus.x - 7} x2={diagram.battery.minus.x + 7} y1={diagram.battery.minus.y} y2={diagram.battery.minus.y} className="wr-dg-cell" />
        <text x={diagram.battery.plus.x - 17} y={diagram.battery.plus.y - 4} className="wr-dg-bat-label">
          3V3
        </text>
        <text x={diagram.battery.minus.x - 17} y={diagram.battery.minus.y + 12} className="wr-dg-bat-label">
          GND
        </text>
      </g>

      {lines.map((l, i) => (
        <path key={l.key} d={paths[i]} className="wr-dg-wire" />
      ))}
      {diagram.dots.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.2} className="wr-dg-dot" opacity={late} />
      ))}

      {diagram.symbols.map((s) => {
        const led = s.ledId ? leds.get(s.ledId) : undefined;
        return (
          <Symbol
            key={s.key}
            sym={s}
            t={t}
            roomy={diagram.roomy}
            labelOpacity={late}
            lit={led?.status === "lit" ? led.brightness : 0}
            burnt={led?.status === "burnt" || led?.status === "burning"}
            pressed={circuit.pressed.has(s.partId)}
            selected={selected === s.partId}
            onDown={(e) => {
              e.stopPropagation();
              onSelect(s.partId);
              if (s.kind === "switch") {
                try {
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                onPress(s.partId, true);
              }
            }}
            onUp={s.kind === "switch" ? () => onPress(s.partId, false) : undefined}
          />
        );
      })}

      {diagram.flags.map((f) => (
        <Flag
          key={f.key}
          flag={f}
          at={mix(f.board, f.loops, t)}
          opacity={late}
          classes={f.pin ? pinLabelClasses(pinState(circuit, f.pin), readings.get(f.pin), selected === f.pin) : []}
          onPin={
            f.pin
              ? (e) => {
                  e.stopPropagation();
                  onPinClick(f.pin!);
                }
              : undefined
          }
        />
      ))}
    </g>
  );
}

// ── Symbols ────────────────────────────────────────────────────────────
//
// Each is drawn along +x from leg a to leg b, then turned and stretched onto
// the two points it has at this moment. The body keeps its size; the leads
// either side take up the length.

const BODY: Record<DiagramSymbol["kind"], number> = { resistor: 26, led: 16, switch: 26, pot: 26 };

function Symbol({
  sym,
  t,
  roomy,
  labelOpacity,
  lit,
  burnt,
  pressed,
  selected,
  onDown,
  onUp,
}: {
  sym: DiagramSymbol;
  t: number;
  /** Room beside the column for a label longer than a letter. */
  roomy: boolean;
  labelOpacity: number;
  lit: number;
  burnt: boolean;
  pressed: boolean;
  selected: boolean;
  onDown: (e: RPointerEvent) => void;
  onUp?: () => void;
}) {
  const a = mix(sym.board[0]!, sym.loops[0]!, t);
  const b = mix(sym.board[1]!, sym.loops[1]!, t);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  const body = Math.min(BODY[sym.kind], len * 0.8);
  const s = body / BODY[sym.kind];
  const half = BODY[sym.kind] / 2;

  // A label sits to the left of a column (a wiper leaves to the right), or
  // below a part lying across the board.
  let nl = { x: u.y, y: -u.x };
  if (nl.x > 0.01 || (Math.abs(nl.x) <= 0.01 && nl.y < 0)) nl = { x: -nl.x, y: -nl.y };
  const lx = mid.x + nl.x * 12;
  const ly = mid.y + nl.y * 12 + 3;
  const anchor = nl.x < -0.5 ? "end" : nl.x > 0.5 ? "start" : "middle";

  // A knob's wiper: a line in from the side, ending in an arrow at the track.
  let wiper = null;
  if (sym.kind === "pot" && sym.board[2] && sym.loops[2]) {
    const w = mix(sym.board[2], sym.loops[2], t);
    const side = (w.x - mid.x) * -u.y + (w.y - mid.y) * u.x;
    const n = side >= 0 ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
    const tip = { x: mid.x + n.x * 6, y: mid.y + n.y * 6 };
    const tail = { x: mid.x + n.x * 16, y: mid.y + n.y * 16 };
    const head = (k: number) => ({ x: tip.x + n.x * 5 + u.x * 3 * k, y: tip.y + n.y * 5 + u.y * 3 * k });
    wiper = (
      <g className="wr-dg-sym-line">
        <polyline points={`${w.x},${w.y} ${tail.x},${tail.y} ${tip.x},${tip.y}`} fill="none" />
        <polygon points={`${tip.x},${tip.y} ${head(1).x},${head(1).y} ${head(-1).x},${head(-1).y}`} className="wr-dg-arrow" />
      </g>
    );
  }

  return (
    <g
      className={`wr-dg-sym wr-dg-sym--${sym.kind}${selected ? " wr-dg-sym--sel" : ""}`}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wr-dg-hit" />
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${deg})`}>
        <line x1={-len / 2} x2={-body / 2} y1={0} y2={0} className="wr-dg-sym-line" />
        <line x1={body / 2} x2={len / 2} y1={0} y2={0} className="wr-dg-sym-line" />
        <g transform={`scale(${s})`}>
          {(sym.kind === "resistor" || sym.kind === "pot") && (
            <polyline
              points={`${-half},0 ${-half + 2},-5 ${-half + 6},5 ${-half + 10},-5 ${-half + 14},5 ${-half + 18},-5 ${-half + 22},5 ${half},0`}
              className="wr-dg-sym-line"
              fill="none"
            />
          )}
          {sym.kind === "led" && (
            <>
              <polygon points="-8,-8 -8,8 8,0" className={burnt ? "wr-dg-led wr-dg-led--burnt" : "wr-dg-led"} />
              {lit > 0.01 && <polygon points="-8,-8 -8,8 8,0" className="wr-dg-led-lit" style={{ opacity: 0.25 + 0.75 * lit }} />}
              <line x1={8} x2={8} y1={-8} y2={8} className="wr-dg-sym-line" />
              {lit > 0.01 && (
                <g className="wr-dg-rays" style={{ opacity: 0.3 + 0.7 * lit }}>
                  <path d="M -1 -10 l 5 -7 M 4 -10 l 5 -7" />
                  <path d="M 4 -17 l -3 0.5 M 4 -17 l 0.2 3 M 9 -17 l -3 0.5 M 9 -17 l 0.2 3" />
                </g>
              )}
              {burnt && <path d="M -5 -5 L 5 5 M 5 -5 L -5 5" className="wr-dg-burnt-x" />}
            </>
          )}
          {sym.kind === "switch" && (
            <>
              <circle cx={-11} cy={0} r={2.2} className="wr-dg-contact" />
              <circle cx={11} cy={0} r={2.2} className="wr-dg-contact" />
              <g className="wr-dg-plunger" transform={`translate(0 ${pressed ? 0 : -4.5})`}>
                <line x1={-13} x2={13} y1={-2.4} y2={-2.4} className="wr-dg-sym-line" />
                <line x1={0} x2={0} y1={-2.4} y2={-9} className="wr-dg-sym-line" />
                <line x1={-4} x2={4} y1={-9} y2={-9} className="wr-dg-sym-line" />
              </g>
            </>
          )}
        </g>
      </g>
      {wiper}
      {sym.label && (roomy || sym.label.length === 1) && (
        <text x={lx} y={ly} textAnchor={anchor} className="wr-dg-label" opacity={labelOpacity}>
          {sym.label}
        </text>
      )}
    </g>
  );
}

// ── Where a line stops short of the battery ────────────────────────────

function Flag({
  flag,
  at,
  opacity,
  classes,
  onPin,
}: {
  flag: DiagramFlag;
  at: XY;
  opacity: number;
  classes: string[];
  onPin?: (e: RPointerEvent) => void;
}) {
  if (flag.kind === "open") return <circle cx={at.x} cy={at.y} r={3.2} className="wr-dg-open" opacity={opacity} />;
  if (flag.kind === "node") {
    const c = flag.side === "above" ? { x: at.x, y: at.y - 8 } : flag.side === "below" ? { x: at.x, y: at.y + 8 } : { x: at.x + 8, y: at.y };
    return (
      <g opacity={opacity} className="wr-dg-node">
        <circle cx={c.x} cy={c.y} r={8} />
        <text x={c.x} y={c.y + 3.2}>
          {flag.label}
        </text>
      </g>
    );
  }
  // A pin's label, drawn as the board draws it.
  const c = flag.side === "above" ? { x: at.x, y: at.y - 17 } : flag.side === "below" ? { x: at.x, y: at.y + 17 } : { x: at.x + 8, y: at.y };
  const cls = ["wr-pinlabel", flag.kind === "pin" ? "wr-pinlabel--gpio" : "wr-dg-power", ...classes];
  return (
    <g opacity={opacity} className={cls.join(" ")} data-pin={flag.pin} onPointerDown={onPin}>
      <rect x={c.x - 8} y={c.y - 17} width={16} height={34} rx={3} className="wr-pinlabel-bg" />
      <text x={c.x} y={c.y} transform={`rotate(-90 ${c.x} ${c.y})`} className="wr-pinlabel-text">
        {flag.label}
      </text>
    </g>
  );
}

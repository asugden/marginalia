// The figure every split panel draws: counts through one day with a model
// fitted to some of them, and below, each set's average miss against the
// parameter count.
//
// A count's ROLE decides its mark, the same in every panel:
//   training    filled dot; its miss is the dashed grey curve
//   validation  hollow square; dotted curve
//   test        hollow dot; solid dark curve
// The fit only ever sees the training counts.
//
// Drawn 1:1 (style.md §12). Dragging along the lower plot picks a size.

import { useId } from "react";
import { traffic, type Pt } from "./fit.js";

export type Role = "train" | "val" | "test";

export const ROLE_NAME: Record<Role, string> = {
  train: "training",
  val: "validation",
  test: "test",
};

const W = 680;
const PX0 = 52;
const PX1 = W - 14;
const PY0 = 14;
const PY1 = 262;
const Y_MAX = 1500;
const CY0 = 330;
const CY1 = 478;
const H = 512;

export const px = (h: number) => PX0 + (h / 24) * (PX1 - PX0);
export const py = (y: number) => PY1 - (y / Y_MAX) * (PY1 - PY0);

const USUAL_D = Array.from({ length: 97 }, (_, i) => {
  const h = i / 4;
  return `${i ? "L" : "M"} ${px(h).toFixed(2)} ${py(traffic(h)).toFixed(2)}`;
}).join(" ");

/** One set's marker, for the figure and for legends. */
export function Mark({ role, x, y }: { role: Role; x: number; y: number }) {
  if (role === "val") return <rect className="cs-dot cs-dot--val" x={x - 3} y={y - 3} width={6} height={6} />;
  return <circle className={role === "train" ? "cs-dot" : "cs-dot cs-dot--next"} cx={x} cy={y} r={3.2} />;
}

const CURVE_CLASS: Record<Role, string> = {
  train: "cs-curve cs-curve--today",
  val: "cs-curve cs-curve--val",
  test: "cs-curve cs-curve--next",
};
const CURSOR_CLASS: Record<Role, string> = {
  train: "cs-cursor-dot cs-cursor-dot--today",
  val: "cs-cursor-dot cs-cursor-dot--val",
  test: "cs-cursor-dot cs-cursor-dot--next",
};

export interface SplitFigureProps {
  /** Every count, with the set it belongs to. */
  points: { pt: Pt; role: Role }[];
  /** The fitted model's path. */
  fitD: string;
  /** Earlier fits, drawn faint. */
  ghosts?: string[];
  /** Draw the usual traffic the counts were drawn from. */
  usual?: boolean;
  /** Each set's miss at every size, with its label at the curve's end. */
  curves: { role: Role; vals: number[]; label: string }[];
  /** The parameter count at each size (for the axis). */
  paramsAt: (i: number) => number;
  /** The size shown. */
  at: number;
  onAt: (i: number) => void;
  /** A size to mark as the chosen one, if any. */
  chosen?: number;
  chosenLabel?: string;
  ariaLabel: string;
}

export function SplitFigure(p: SplitFigureProps) {
  // Each figure on the page needs its own clip id.
  const clipId = `cs-day-clip-${useId().replace(/:/g, "")}`;
  const n = p.curves[0]!.vals.length;
  const pMin = p.paramsAt(0);
  const pMax = p.paramsAt(n - 1);
  const cx = (i: number) => PX0 + ((p.paramsAt(i) - pMin) / Math.max(1, pMax - pMin)) * (PX1 - PX0);
  // Scaled to the worst miss on any curve, rounded up.
  const eMax = Math.ceil(Math.max(...p.curves.flatMap((c) => c.vals)) / 100) * 100;
  const cy = (e: number) => CY1 - (e / eMax) * (CY1 - CY0);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${cx(i).toFixed(2)} ${cy(v).toFixed(2)}`).join(" ");

  // Curve labels at the right end, nudged apart so they never overlap.
  const labels = p.curves
    .map((c) => ({ label: c.label, y: cy(c.vals[n - 1]!) - 6 }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 13);

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const x = pt.matrixTransform(svg.getScreenCTM()!.inverse()).x;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - x) < Math.abs(cx(best) - x)) best = i;
    p.onAt(best);
  };

  // Draw order: test, then validation, then training on top.
  const order: Role[] = ["test", "val", "train"];

  return (
    <svg className="cs-fig" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={p.ariaLabel}>
      {/* ── The day ── */}
      <rect className="cs-frame" x={PX0} y={PY0} width={PX1 - PX0} height={PY1 - PY0} rx={4} />
      {[500, 1000].map((v) => (
        <line key={v} className="cs-grid" x1={PX0} y1={py(v)} x2={PX1} y2={py(v)} />
      ))}
      {[0, 500, 1000, 1500].map((v) => (
        <text key={v} className="fig-tick" x={PX0 - 6} y={py(v) + 3} textAnchor="end">
          {v}
        </text>
      ))}
      {[0, 6, 12, 18, 24].map((h) => (
        <text key={h} className="fig-tick" x={px(h)} y={PY1 + 14} textAnchor="middle">
          {`${String(h).padStart(2, "0")}:00`}
        </text>
      ))}
      <text className="fig-label" x={PX0 + 8} y={PY0 + 16}>
        cars an hour
      </text>
      <text className="fig-label" x={PX1} y={PY1 + 30} textAnchor="end">
        time of day
      </text>

      <clipPath id={clipId}>
        <rect x={PX0} y={PY0} width={PX1 - PX0} height={PY1 - PY0} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {p.usual && <path className="cs-usual" d={USUAL_D} />}
        {(p.ghosts ?? []).map((d, i) => (
          <path key={i} className="cs-fit cs-fit--ghost" d={d} />
        ))}
        <path className="cs-fit" d={p.fitD} />
      </g>
      {order.flatMap((role) =>
        p.points
          .filter((q) => q.role === role)
          .map((q, i) => <Mark key={`${role}${i}`} role={role} x={px(q.pt.x)} y={py(Math.min(Y_MAX, q.pt.y))} />),
      )}

      {/* ── The miss against parameters ── */}
      <line className="cs-axis" x1={PX0} y1={CY1} x2={PX1} y2={CY1} />
      <line className="cs-axis" x1={PX0} y1={CY0} x2={PX0} y2={CY1} />
      {[0, eMax / 2, eMax].map((v) => (
        <text key={v} className="fig-tick" x={PX0 - 6} y={cy(v) + 3} textAnchor="end">
          {v}
        </text>
      ))}
      {[0, Math.round(n / 3), Math.round((2 * n) / 3), n - 1].map((i) => (
        <text key={i} className="fig-tick" x={cx(i)} y={CY1 + 14} textAnchor="middle">
          {p.paramsAt(i)}
        </text>
      ))}
      <text className="fig-label" x={PX0 + 8} y={CY0 - 8}>
        average miss
      </text>
      <text className="fig-label" x={PX1} y={CY1 + 30} textAnchor="end">
        parameters
      </text>

      {p.curves.map((c) => (
        <path key={c.role} className={CURVE_CLASS[c.role]} d={line(c.vals)} />
      ))}
      {labels.map((l) => (
        <text key={l.label} className="fig-label" x={PX1 - 4} y={l.y} textAnchor="end">
          {l.label}
        </text>
      ))}

      {p.chosen != null && (
        <g>
          <line className="cs-chosen" x1={cx(p.chosen)} y1={CY0} x2={cx(p.chosen)} y2={CY1} />
          <text className="fig-label" x={cx(p.chosen)} y={CY0 - 8} textAnchor={cx(p.chosen) > PX1 - 80 ? "end" : "middle"}>
            {p.chosenLabel ?? "chosen"}
          </text>
        </g>
      )}

      <line className="cs-cursor" x1={cx(p.at)} y1={CY0} x2={cx(p.at)} y2={CY1} />
      {p.curves.map((c) => (
        <circle key={c.role} className={CURSOR_CLASS[c.role]} cx={cx(p.at)} cy={cy(c.vals[p.at]!)} r={4} />
      ))}
      <rect
        className="cs-hit"
        x={PX0}
        y={CY0}
        width={PX1 - PX0}
        height={CY1 - CY0}
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons & 1 && pick(e)}
      />
    </svg>
  );
}

/** A legend row for one set. */
export function LegendMark({ role, children }: { role: Role; children: React.ReactNode }) {
  return (
    <span className="cs-legend__row">
      <svg width="22" height="10" aria-hidden="true">
        <Mark role={role} x={11} y={5} />
      </svg>
      {children}
    </span>
  );
}

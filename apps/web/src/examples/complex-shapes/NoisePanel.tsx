// Panel 2: fit one day's traffic, and check the fit against the next day.
//
// Each dot is the cars an hour passing one spot on a road, counted every half
// hour. Every day has the same rush hours and different scatter around them.
// The model is fitted to today's counts (filled) and scored on the next day's
// (hollow), taken at the same times. Below the plot, both misses are drawn
// against the parameter count, so the whole sweep is visible at once.
//
// "Next day" moves the calendar on: the next day's counts become today's and
// a new next day arrives. The fits to the last few days stay on the plot,
// faint, refitted at whatever size the slider is at — so the reader sees small
// models agree from day to day and large ones chase each day's scatter.
//
// The panel is titled "Overfitting" and says nothing more about it: today's
// miss falls to zero while the next day's stops falling and creeps back up.

import { useMemo, useState } from "react";
import { Button, Switch } from "../../components/index.js";
import { COUNTS, dayOf, fitAll, maxSizeFor, minSize, modelOf, paramsOf, rms, traffic, type Fitted, type Kind } from "./fit.js";
import { ParamSlider, fitPath, sizeFor } from "./draw.js";

const W = 680;
// The traffic plot.
const PX0 = 52;
const PX1 = W - 14;
const PY0 = 14;
const PY1 = 262;
const Y_MAX = 1500;
// The miss against parameters, underneath.
const CY0 = 330;
const CY1 = 478;
const H = 512;
/** The day the page opens on. See NoisePanel. */
const FIRST_DAY = 11;
/** How many earlier days leave a faint fit behind. */
const GHOSTS = 4;

const px = (h: number) => PX0 + (h / 24) * (PX1 - PX0);
const py = (y: number) => PY1 - (y / Y_MAX) * (PY1 - PY0);

// Fits are exact and deterministic; keep them so the calendar can go back and
// forth, and ghost days are not refitted on every render.
const FITS = new Map<string, Fitted[]>();
function fitsFor(kind: Kind, day: number): Fitted[] {
  const key = `${kind}:${day}`;
  let f = FITS.get(key);
  if (!f) {
    f = fitAll(kind, dayOf(day), maxSizeFor(kind, COUNTS));
    FITS.set(key, f);
  }
  return f;
}

export function NoisePanel({ kind }: { kind: Kind }) {
  // Any day shows the gap between the two misses; this one also shows the
  // next day's turning back up clearly, for both kinds, so the page opens on it.
  const [day, setDay] = useState(FIRST_DAY);
  const [params, setParams] = useState(4);
  const [usual, setUsual] = useState(false);
  const maxSize = maxSizeFor(kind, COUNTS);
  const size = sizeFor(kind, params, maxSize);
  const at = size - minSize(kind);

  const today = useMemo(() => dayOf(day), [day]);
  const next = useMemo(() => dayOf(day + 1), [day]);
  const fits = fitsFor(kind, day);
  const fit = fits[at]!;

  // Both misses at every size: the curves under the plot.
  const curves = useMemo(
    () => ({
      today: fits.map((f) => rms(f, today)),
      next: fits.map((f) => rms(f, next)),
    }),
    [fits, today, next],
  );

  const ghosts = useMemo(() => {
    const out: string[] = [];
    for (let d = Math.max(FIRST_DAY, day - GHOSTS); d < day; d++) out.push(fitPath(fitsFor(kind, d)[at]!, 0, 24, px, py));
    return out;
  }, [kind, day, at]);

  return (
    <div className="cs-layout">
      <aside className="cs-side">
        <div className="cs-box cs-box--controls">
          <ParamSlider kind={kind} size={size} maxSize={maxSize} onSize={(s) => setParams(paramsOf(kind, s))} />
          <span className="cs-model">{modelOf(kind, size)}</span>
        </div>

        <div className="cs-box" aria-live="polite">
          <span className="cs-kicker">Average miss, cars an hour</span>
          <div className="cs-score">
            <span className="cs-score__name">today</span>
            <span className="cs-score__val">{curves.today[at]!.toFixed(0)}</span>
          </div>
          <div className="cs-score">
            <span className="cs-score__name">the next day</span>
            <span className="cs-score__val cs-score__val--next">{curves.next[at]!.toFixed(0)}</span>
          </div>
        </div>

        <div className="cs-box cs-box--controls">
          <Button size="sm" variant="subtle" onClick={() => setDay((d) => d + 1)}>
            Next day
          </Button>
          <Switch label="Usual traffic" checked={usual} onChange={(e) => setUsual(e.target.checked)} />
        </div>

        <div className="cs-legend">
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <circle className="cs-dot" cx="11" cy="5" r="3.2" />
            </svg>
            today's counts, fitted
          </span>
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <circle className="cs-dot cs-dot--next" cx="11" cy="5" r="3.2" />
            </svg>
            the next day's counts
          </span>
          <span className="cs-legend__row">
            <svg width="22" height="10" aria-hidden="true">
              <line className="cs-fit" x1="3" y1="5" x2="19" y2="5" />
            </svg>
            the model
          </span>
          {ghosts.length > 0 && (
            <span className="cs-legend__row">
              <svg width="22" height="10" aria-hidden="true">
                <line className="cs-fit cs-fit--ghost" x1="3" y1="5" x2="19" y2="5" />
              </svg>
              fitted to earlier days
            </span>
          )}
          {usual && (
            <span className="cs-legend__row">
              <svg width="22" height="10" aria-hidden="true">
                <line className="cs-usual" x1="3" y1="5" x2="19" y2="5" />
              </svg>
              the usual traffic
            </span>
          )}
        </div>
      </aside>

      <NoiseFigure
        kind={kind}
        today={today}
        next={next}
        fitD={fitPath(fit, 0, 24, px, py)}
        ghosts={ghosts}
        usual={usual}
        curves={curves}
        at={at}
        onAt={(i) => setParams(paramsOf(kind, i + minSize(kind)))}
      />
    </div>
  );
}

const USUAL_D = Array.from({ length: 97 }, (_, i) => {
  const h = i / 4;
  return `${i ? "L" : "M"} ${px(h).toFixed(2)} ${py(traffic(h)).toFixed(2)}`;
}).join(" ");

function NoiseFigure({
  kind,
  today,
  next,
  fitD,
  ghosts,
  usual,
  curves,
  at,
  onAt,
}: {
  kind: Kind;
  today: { x: number; y: number }[];
  next: { x: number; y: number }[];
  fitD: string;
  ghosts: string[];
  usual: boolean;
  curves: { today: number[]; next: number[] };
  at: number;
  onAt: (i: number) => void;
}) {
  const n = curves.today.length;
  const pMin = paramsOf(kind, minSize(kind));
  const pMax = paramsOf(kind, minSize(kind) + n - 1);
  const cx = (i: number) => PX0 + ((paramsOf(kind, i + minSize(kind)) - pMin) / (pMax - pMin)) * (PX1 - PX0);
  // Scaled to the worst miss on the curve (the smallest model's), rounded up.
  const eMax = Math.ceil(Math.max(...curves.today, ...curves.next) / 100) * 100;
  const cy = (e: number) => CY1 - (e / eMax) * (CY1 - CY0);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${cx(i).toFixed(2)} ${cy(v).toFixed(2)}`).join(" ");

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const x = pt.matrixTransform(svg.getScreenCTM()!.inverse()).x;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(cx(i) - x) < Math.abs(cx(best) - x)) best = i;
    onAt(best);
  };

  return (
    <svg
      className="cs-fig"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`Traffic counts through one day, a model with ${paramsOf(kind, at + minSize(kind))} parameters fitted to them, and the counts from the next day. Below, the average miss on each day against the number of parameters.`}
    >
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

      <clipPath id="cs-day-clip">
        <rect x={PX0} y={PY0} width={PX1 - PX0} height={PY1 - PY0} />
      </clipPath>
      <g clipPath="url(#cs-day-clip)">
        {usual && <path className="cs-usual" d={USUAL_D} />}
        {ghosts.map((d, i) => (
          <path key={i} className="cs-fit cs-fit--ghost" d={d} />
        ))}
        <path className="cs-fit" d={fitD} />
      </g>
      {next.map((p, i) => (
        <circle key={`n${i}`} className="cs-dot cs-dot--next" cx={px(p.x)} cy={py(Math.min(Y_MAX, p.y))} r={3.2} />
      ))}
      {today.map((p, i) => (
        <circle key={`t${i}`} className="cs-dot" cx={px(p.x)} cy={py(Math.min(Y_MAX, p.y))} r={3.2} />
      ))}

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
          {paramsOf(kind, i + minSize(kind))}
        </text>
      ))}
      <text className="fig-label" x={PX0 + 8} y={CY0 - 8}>
        average miss
      </text>
      <text className="fig-label" x={PX1} y={CY1 + 30} textAnchor="end">
        parameters
      </text>

      <path className="cs-curve cs-curve--today" d={line(curves.today)} />
      <path className="cs-curve cs-curve--next" d={line(curves.next)} />
      <text className="fig-label" x={PX1 - 4} y={cy(curves.next[n - 1]!) - 6} textAnchor="end">
        the next day
      </text>
      <text className="fig-label" x={PX1 - 4} y={cy(curves.today[n - 1]!) - 6} textAnchor="end">
        today
      </text>

      <line className="cs-cursor" x1={cx(at)} y1={CY0} x2={cx(at)} y2={CY1} />
      <circle className="cs-cursor-dot cs-cursor-dot--today" cx={cx(at)} cy={cy(curves.today[at]!)} r={4} />
      <circle className="cs-cursor-dot cs-cursor-dot--next" cx={cx(at)} cy={cy(curves.next[at]!)} r={4} />
      <rect className="cs-hit" x={PX0} y={CY0} width={PX1 - PX0} height={CY1 - CY0} onPointerDown={pick} onPointerMove={(e) => e.buttons & 1 && pick(e)} />
    </svg>
  );
}

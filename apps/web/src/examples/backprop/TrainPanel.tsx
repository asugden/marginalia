// Panel 6: the walk on repeat, over all four examples.
//
// The whole run is computed up front; the buttons only move through it, so
// Step and Run show exactly the same numbers.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { DATA, LEARNING_RATE, SEED, SIZES, STEPS, TARGETS, TRAIN_PANEL } from "./content.js";
import { initParams, trainStep, type Params } from "./scalar.js";
import { Panel, Readout, fmt, signClass } from "./ui.js";

interface Frame {
  loss: number;
  predictions: number[];
}

function trajectory(): Frame[] {
  let p: Params = initParams(SIZES, SEED);
  const frames: Frame[] = [];
  for (let s = 0; s <= STEPS; s++) {
    const t = trainStep(p, DATA, TARGETS, LEARNING_RATE, null);
    frames.push({ loss: t.loss, predictions: t.predictions });
    p = t.next;
  }
  return frames;
}

export function TrainPanel() {
  const frames = useMemo(() => trajectory(), []);
  const [at, setAt] = useState(0);
  const f = frames[at]!;

  return (
    <Panel title={TRAIN_PANEL.title} standfirst={TRAIN_PANEL.standfirst} note={TRAIN_PANEL.note}>
      <div className="bp-controls">
        <Button size="sm" variant="primary" disabled={at >= STEPS} onClick={() => setAt(at + 1)}>
          {TRAIN_PANEL.stepOne}
        </Button>
        <Button size="sm" variant="subtle" disabled={at >= STEPS} onClick={() => setAt(STEPS)}>
          {TRAIN_PANEL.runAll}
        </Button>
        <Button size="sm" variant="subtle" disabled={at === 0} onClick={() => setAt(0)}>
          {TRAIN_PANEL.reset}
        </Button>
      </div>

      <div className="bp-train">
        <div className="bp-scroll">
          <LossCurve frames={frames} at={at} />
        </div>
        <div className="bp-train__side">
          <div className="bp-stats">
            <Readout label={TRAIN_PANEL.stepLabel}>
              <span className="bp-big">{at}</span>
            </Readout>
            <Readout label={TRAIN_PANEL.lossLabel}>
              <span className="bp-big">{fmt(f.loss, 3)}</span>
            </Readout>
          </div>
          <Readout label={TRAIN_PANEL.predLabel}>
            <table className="bp-preds">
              <thead>
                <tr>
                  <th>inputs</th>
                  <th>target</th>
                  <th>prediction</th>
                </tr>
              </thead>
              <tbody>
                {DATA.map((x, i) => (
                  <tr key={i}>
                    <td>{x.map((v) => fmt(v)).join(", ")}</td>
                    <td>{fmt(TARGETS[i]!)}</td>
                    <td className={signClass(f.predictions[i]!)}>{fmt(f.predictions[i]!, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Readout>
        </div>
      </div>
    </Panel>
  );
}

const CW = 440;
const CH = 220;
const L = 40;
const B = 28;

function LossCurve({ frames, at }: { frames: Frame[]; at: number }) {
  const top = Math.max(...frames.map((f) => f.loss));
  const sx = (i: number) => L + (i / STEPS) * (CW - L - 10);
  const sy = (v: number) => CH - B - (v / top) * (CH - B - 14);
  const path = (fs: Frame[], upTo: number) =>
    fs
      .slice(0, upTo + 1)
      .map((f, i) => `${i ? "L" : "M"} ${sx(i)} ${sy(f.loss)}`)
      .join(" ");

  return (
    <svg
      className="bp-plot"
      viewBox={`0 0 ${CW} ${CH}`}
      width={CW}
      height={CH}
      role="img"
      aria-label="Total error against training step."
    >
      <line x1={L} y1={CH - B} x2={CW - 10} y2={CH - B} className="bp-plot__axis" />
      <line x1={L} y1={14} x2={L} y2={CH - B} className="bp-plot__axis" />
      {[0, 10, 20, 30, 40, 50].map((t) => (
        <text key={t} x={sx(t)} y={CH - B + 14} className="fig-tick" textAnchor="middle">
          {t}
        </text>
      ))}
      <text x={L - 6} y={sy(top)} className="fig-tick" textAnchor="end" dominantBaseline="middle">
        {fmt(top, 1)}
      </text>
      <text x={L - 6} y={sy(0)} className="fig-tick" textAnchor="end" dominantBaseline="middle">
        0
      </text>
      <text x={CW - 10} y={CH - 2} className="fig-label" textAnchor="end">
        step
      </text>
      <path d={path(frames, at)} className="bp-plot__curve" />
      <circle cx={sx(at)} cy={sy(frames[at]!.loss)} r={4} className="bp-plot__dot" />
    </svg>
  );
}

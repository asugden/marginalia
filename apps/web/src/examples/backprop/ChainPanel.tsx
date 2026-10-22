// Panel 4: one path from a weight to the error — the chain rule, by nudging.
//
// The weight joining one hidden-1 neuron to one hidden-2 neuron reaches the
// error by exactly one road: through that hidden-2 neuron, then the output.
// The path is drawn dark on the network; under it, the same road as a row of
// gauges, each a number on the way:
//
//   weight → its neuron's sum → that neuron's output → y → error
//
// Between each pair, the link: how much the next number moves per unit the
// one before it moves. "Nudge" adds 0.001 to the weight and every gauge shows
// how far it moved, so each link can be seen as the ratio of two moves. The
// slider moves the weight further, far enough to switch the neuron off.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { CHAIN_PANEL } from "./content.js";
import { NetFigure, nid } from "./NetFigure.js";
import { PARAMS, T0, nameOf, run0, strongestPath, type Run } from "./net.js";
import type { Params } from "./scalar.js";
import { Panel, Readout, fmt, signClass } from "./ui.js";

// Small enough that the error's own curve does not show: measured and
// multiplied agree to the digits shown.
const NUDGE = 0.001;

/** The parameters with one weight (layer 1, neuron k, from j) replaced. */
function withWeight(j: number, k: number, w: number): Params {
  return {
    sizes: PARAMS.sizes,
    layers: PARAMS.layers.map((layer, l) =>
      layer.map((n, kk) => (l === 1 && kk === k ? { w: n.w.map((v, jj) => (jj === j ? w : v)), b: n.b } : n)),
    ),
  };
}

/** The five numbers along the road, in order. */
function gauges(r: Run, j: number, k: number, w: number): number[] {
  const e = r.layers[1]![k]!;
  return [w, e.n.val, e.o.val, r.y.val, r.loss.val];
}

export function ChainPanel() {
  const base = useMemo(() => run0(), []);
  const { j, k } = useMemo(() => strongestPath(base), [base]);
  const w0 = PARAMS.layers[1]![k]!.w[j]!;
  const [w, setW] = useState(w0);
  const [moved, setMoved] = useState<number[] | null>(null);

  const r = useMemo(() => run0(withWeight(j, k, w)), [j, k, w]);
  const now = gauges(r, j, k, w);
  const A = nameOf(0, j);
  const E = nameOf(1, k);
  const e = r.layers[1]![k]!;
  const links = [
    r.layers[0]![j]!.o.val, // the sum moves by the weight's input times the nudge
    e.n.val > 0 ? 1 : 0, // ReLU passes the move through, or not at all
    r.layers[2]![0]!.w[k]!.val, // y moves by E's weight into it
    2 * (r.y.val - T0), // the error moves by 2 × (y − target)
  ];
  const product = links.reduce((a, b) => a * b, 1);

  const nudge = () => {
    const before = now;
    const after = gauges(run0(withWeight(j, k, w + NUDGE)), j, k, w + NUDGE);
    setW(w + NUDGE);
    setMoved(after.map((v, i) => v - before[i]!));
  };

  const labels = [`weight ${A}→${E}`, `${E}'s sum`, `${E}'s output`, "y", "error"];
  const linkLabels = [`${A}'s output`, `${E}'s slope`, `weight ${E}→y`, "2 × (y − target)"];
  const path = new Set([`1-${k}-${j}`, `2-0-${k}`]);
  const pathNodes = new Set([nid(0, j), nid(1, k), nid(2, 0), "error" as const]);

  return (
    <Panel title={CHAIN_PANEL.title} standfirst={CHAIN_PANEL.standfirst} note={CHAIN_PANEL.note}>
      <div className="bp-controls">
        <Button size="sm" variant="primary" onClick={nudge}>
          Nudge the weight +{NUDGE}
        </Button>
        <label className="bp-slider">
          <span className="bp-kicker">weight {A}→{E}</span>
          <input
            type="range"
            min={w0 - 2}
            max={w0 + 2}
            step={0.01}
            value={w}
            onChange={(ev) => {
              setW(parseFloat(ev.target.value));
              setMoved(null);
            }}
          />
        </label>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            setW(w0);
            setMoved(null);
          }}
        >
          {CHAIN_PANEL.reset}
        </Button>
      </div>

      <div className="bp-chain__net">
        <NetFigure run={r} path={path} pathNodes={pathNodes} width={460} />
      </div>

      <div className="bp-chain" role="list">
        {now.map((v, i) => (
          <div key={i} className="bp-chain__step" role="listitem">
            <div className={`bp-gauge${i === 0 ? " bp-gauge--source" : ""}`}>
              <span className="bp-kicker">{labels[i]}</span>
              <span className="bp-gauge__val">{fmt(v, 3)}</span>
              <span className={`bp-gauge__moved ${moved ? signClass(moved[i]!) : ""}`}>
                {moved ? `${moved[i]! >= 0 ? "+" : ""}${fmt(moved[i]!, 5)}` : " "}
              </span>
            </div>
            {i < links.length && (
              <div className="bp-link" title={linkLabels[i]}>
                <span className="bp-link__x">× {fmt(links[i]!, 2)}</span>
                <span className="bp-link__what">{linkLabels[i]}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="bp-chain__sums">
        <Readout label={CHAIN_PANEL.measuredLabel}>
          <span className="bp-working">
            {moved ? (
              <>
                {fmt(moved[4]!, 5)} ÷ {NUDGE} = <b>{fmt(moved[4]! / NUDGE, 2)}</b>
              </>
            ) : (
              "·"
            )}
          </span>
        </Readout>
        <Readout label={CHAIN_PANEL.productLabel}>
          <span className="bp-working">
            {links.map((l) => fmt(l, 2)).join(" × ")} = <b>{fmt(product, 2)}</b>
          </span>
        </Readout>
      </div>
    </Panel>
  );
}

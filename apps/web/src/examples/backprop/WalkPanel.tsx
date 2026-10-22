// Panel 5: backpropagation, one click per neuron, the way the reference
// walk-through does it by hand.
//
// The reader starts at the error and clicks back up. A neuron can be clicked
// once every neuron it feeds is done (those carry a dashed ring), so the
// order is the real one, but the reader takes each step. Each click shows
// that neuron's working with the numbers filled in: one line per neuron it
// feeds (weight × that neuron's slope × that neuron's gradient), then their
// sum. The weights into a finished neuron switch to their gradient colours,
// and hovering one shows its own working.
//
// When every neuron is done, one button steps every weight downhill and runs
// the example again.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { LEARNING_RATE, WALK_PANEL } from "./content.js";
import { NetFigure, nid, type NodeId } from "./NetFigure.js";
import { PARAMS, T0, inName, nameOf, run0, type Run } from "./net.js";
import { step as takeStep } from "./scalar.js";
import { Panel, Readout, Working, fmt, fmtIn, signClass } from "./ui.js";

/** Who a part feeds: its gradient needs theirs first. */
function consumers(run: Run, id: NodeId): NodeId[] {
  if (id === "error") return [];
  const [l, j] = id.split("-").map(Number) as [number, number];
  if (l === run.layers.length - 1) return ["error"];
  return run.layers[l + 1]!.map((_, k) => nid(l + 1, k));
}

/** A neuron's slope: ReLU's for a hidden neuron, 1 for the plain output. */
function slopeOf(run: Run, l: number, k: number): number {
  if (l === run.layers.length - 1) return 1;
  return run.layers[l]![k]!.n.val > 0 ? 1 : 0;
}

export function WalkPanel() {
  const run = useMemo(() => run0(), []);
  const [done, setDone] = useState<Set<NodeId>>(new Set());
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [stepped, setStepped] = useState(false);

  const all: NodeId[] = ["error", ...run.layers.flatMap((L, l) => L.map((_, j) => nid(l, j)))];
  const ready = new Set(all.filter((id) => !done.has(id) && consumers(run, id).every((c) => done.has(c))));
  const finished = done.size === all.length;
  const after = useMemo(() => run0(takeStep(PARAMS, run, LEARNING_RATE)), [run]);

  const pick = (id: NodeId) => {
    if (ready.has(id)) setDone((d) => new Set(d).add(id));
    setSelected(id);
  };

  const edgeTip = (l: number, k: number, j: number) => {
    if (!done.has(nid(l, k))) return null;
    const n = run.layers[l]![k]!;
    const inVal = l === 0 ? run.inputs[j]!.val : run.layers[l - 1]![j]!.o.val;
    return `weight ${inName(l, j)}→${nameOf(l, k)}: input ${fmt(inVal, 2)} × slope ${slopeOf(run, l, k)} × ${nameOf(l, k)}'s grad ${fmt(n.o.grad, 3)} = ${fmt(n.w[j]!.grad, 3)}`;
  };

  return (
    <Panel title={WALK_PANEL.title} standfirst={WALK_PANEL.standfirst} note={WALK_PANEL.note}>
      <div className="bp-controls">
        <Button size="sm" variant="primary" disabled={!finished || stepped} onClick={() => setStepped(true)}>
          {WALK_PANEL.update}
        </Button>
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            setDone(new Set());
            setSelected(null);
            setStepped(false);
          }}
        >
          {WALK_PANEL.reset}
        </Button>
        <span className="bp-kicker bp-controls__end">
          {done.size} / {all.length}
        </span>
      </div>

      <div className="bp-walk">
        <div className="bp-scroll">
          <NetFigure run={run} done={done} ready={ready} selected={selected} onPick={pick} edgeTip={edgeTip} />
        </div>
        <div className="bp-walk__side">
          <Readout label={selected ? `${WALK_PANEL.workLabel} · ${selected === "error" ? "error" : nameOf(...(selected.split("-").map(Number) as [number, number]))}` : WALK_PANEL.workLabel}>
            {selected ? <WorkFor run={run} id={selected} /> : <p className="bp-hint">{WALK_PANEL.startHint}</p>}
            {done.size > 1 && !finished && <p className="bp-hint">Hover a coloured line for its weight's working.</p>}
            {finished && <p className="bp-hint">{WALK_PANEL.doneHint}</p>}
          </Readout>
          {stepped && (
            <Readout label="After one step">
              <span className="bp-working">
                error {fmt(run.loss.val, 3)} → <b>{fmt(after.loss.val, 3)}</b>
              </span>
            </Readout>
          )}
        </div>
      </div>
    </Panel>
  );
}

function WorkFor({ run, id }: { run: Run; id: NodeId }) {
  if (id === "error") {
    return <Working lines={[<span key="e">grad = 1</span>]} />;
  }
  const [l, j] = id.split("-").map(Number) as [number, number];
  const me = nameOf(l, j);
  const n = run.layers[l]![j]!;
  if (l === run.layers.length - 1) {
    return (
      <Working
        lines={[
          <span key="f">error = (y − target)²</span>,
          <span key="g">
            grad = 2 × (y − target) = 2 × ({fmt(n.o.val, 3)} − {fmtIn(T0)}) ={" "}
            <b className={signClass(n.o.grad)}>{fmt(n.o.grad, 3)}</b>
          </span>,
        ]}
      />
    );
  }
  // One line per neuron this one feeds: weight × its slope × its gradient.
  const next = run.layers[l + 1]!;
  const lines = next.map((c, k) => {
    const w = c.w[j]!.val;
    const s = slopeOf(run, l + 1, k);
    const contrib = w * s * c.o.grad;
    return (
      <span key={k} className={s === 0 ? "bp-working__off" : undefined}>
        to {nameOf(l + 1, k)}: {fmtIn(w, 2)} × {s} × {fmtIn(c.o.grad, 3)} = {fmt(contrib, 3)}
      </span>
    );
  });
  return (
    <Working
      lines={[
        <span key="h" className="bp-working__head">
          {me} feeds {next.map((_, k) => nameOf(l + 1, k)).join(", ")}: weight × slope × grad
        </span>,
        ...lines,
        <span key="s">
          grad of {me} = {next.length > 1 ? "sum" : "that"} = <b className={signClass(n.o.grad)}>{fmt(n.o.grad, 3)}</b>
        </span>,
      ]}
    />
  );
}

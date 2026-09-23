// Give Pac-Man a notebook: the LSTM.
//
// Same corridor, same sentence, but now he carries two things. What he SAYS
// after each word (h, the bottom strip) and what he has WRITTEN DOWN (c, the
// cell, the notebook). Three gates decide, line by line, how much of the
// notebook to keep, how much of the new word to write in, and how much to
// read out loud. The keep-gate is the one the page follows, because it is
// the part that changes the story in the panel after this one.
//
// The lower half is the classic experiment. Both models above were trained on
// short gaps and both carry the negation for as long as you like. Train each
// again on sentences where the negation is ALWAYS far from the adjective —
// twelve to twenty words — and the plain network never learns to use it,
// while the LSTM does. The loss curves are the trainer's; the verdicts are
// live; the accuracies were measured offline over 200 sentences per gap.

import { useMemo, useState } from "react";
import { Corridor, GateStrip, Meter, VStrip } from "./Corridor.js";
import {
  fillerRun,
  idsOf,
  maxAbs,
  runLSTM,
  runPlain,
  type Models,
} from "./rnn.js";

const MAX_GAP = 24;

export function LstmPanel({
  models,
  tokens,
  ids,
  step,
  onStep,
  runnable,
}: {
  models: Models;
  tokens: string[];
  ids: number[];
  step: number;
  onStep: (t: number) => void;
  runnable: boolean;
}) {
  const run = useMemo(() => (runnable ? runLSTM(models.lstm, ids) : null), [models, ids, runnable]);
  const cBound = run ? maxAbs(run.steps.map((s) => s.c)) : 1;
  const hBound = run ? maxAbs(run.steps.map((s) => s.h)) : 1;
  // The notebook line kept longest: highest mean keep-gate over the sentence.
  const keptLine = useMemo(() => {
    if (!run || !run.steps.length) return 0;
    const sums = new Float32Array(models.H);
    for (const s of run.steps) for (let k = 0; k < models.H; k++) sums[k]! += s.f[k]!;
    let best = 0;
    for (let k = 1; k < models.H; k++) if (sums[k]! > sums[best]!) best = k;
    return best;
  }, [run, models.H]);

  const T = tokens.length;
  const s = step >= 1 && run ? run.steps[Math.min(step, T) - 1] : null;

  return (
    <>
      {run && (
        <div className="tf-figwrap">
          <Corridor
            tokens={tokens}
            step={Math.min(step, T)}
            onStep={onStep}
            aboveH={232}
            labels={[
              { y: 30, text: "keep gate" },
              { y: 96, text: "the notebook" },
              { y: 170, text: "what he says" },
              { y: 226, text: "verdict" },
            ]}
            above={(t, x) => {
              if (t === 0) {
                return <rect className="rn-empty" x={x - 5} y={66} width={10} height={59} rx={2} />;
              }
              const st = run.steps[t - 1]!;
              return (
                <>
                  <GateStrip v={st.f} x={x} y={4} cell={4.5} hot={keptLine} />
                  <VStrip v={st.c} bound={cBound} x={x} y={66} />
                  <VStrip v={st.h} bound={hBound} x={x} y={140} />
                  <Meter p={run.ps[t]!} x={x} y={208} />
                </>
              );
            }}
            ariaLabel="The same corridor, with an LSTM: a keep-gate strip, a notebook strip and a spoken strip above each eaten word."
          />
        </div>
      )}
      <p className="tf-readout">
        {s ? (
          <>
            After <b>{tokens[Math.min(step, T) - 1]}</b>, the keep gate on the outlined notebook
            line reads <b>{s.f[keptLine]!.toFixed(2)}</b>: that fraction of what was written there
            survives to the next word untouched. A plain network has no such dial — every line of
            its state goes through the whole matrix and the squash at every word. Here a line can
            be left alone. The keep gate is drawn in shade: white is 0, wipe it; full red is 1, keep
            it all. Watch it drop where the network decides to overwrite.
          </>
        ) : (
          <>
            Step through the sentence. The top strip is the <b>keep gate</b>, one dial per notebook
            line: full red means “keep this line exactly as it is”, white means “wipe it”. The
            outlined line is the one the network keeps longest.
          </>
        )}
      </p>

      <FarExperiment models={models} />
    </>
  );
}

/** The far-negation experiment: stretch the gap, compare the two models that
 *  only ever saw far negations in training. */
function FarExperiment({ models }: { models: Models }) {
  const [gap, setGap] = useState(16);
  const toks = useMemo(
    () => ["the", "film", "was", "not", ...fillerRun(models.fillers, gap), "good"],
    [models.fillers, gap],
  );
  const ids = idsOf(models, toks);
  const plain = runPlain(models.plainFar, ids);
  const lstm = runLSTM(models.lstmFar, ids);
  const pPlain = plain.ps[plain.ps.length - 1]!;
  const pLstm = lstm.ps[lstm.ps.length - 1]!;
  const row = models.meta.report.find((r) => r.gap === gap);
  const curves = models.meta.curves;
  const [lo, hi] = models.meta.farGap;

  // The loss curves, two polylines.
  const CW = 300;
  const CH = 90;
  const pts = (c: number[]) =>
    c.map((v, i) => `${(i / (c.length - 1)) * (CW - 10) + 5},${CH - 8 - Math.min(v, 0.8) * ((CH - 16) / 0.8)}`).join(" ");

  return (
    <div className="rn-far">
      <h3 className="rn-h3">Now make the job hard</h3>
      <p className="at-sub">
        Both networks above were trained on sentences where the negation sat at most{" "}
        {models.meta.nearGap[1]} words before the adjective, and both, it turns out, carry it much
        further than that. So train each again, from scratch, on sentences where the “not” is{" "}
        <b>always {lo} to {hi} words away</b> from the word it flips. Same networks, same
        optimiser, same number of steps. Drag the gap and read the two verdicts.
      </p>
      <div className="rn-stretch">
        <div className="rn-stretch__head">
          <label htmlFor="rn-gap">
            filler words between <b>not</b> and <b>good</b>
          </label>
          <input id="rn-gap" type="range" min={0} max={MAX_GAP} step={1} value={gap} onChange={(e) => setGap(parseInt(e.target.value, 10))} />
          <b className="rn-stretch__n">{gap}</b>
        </div>
        <p className="rn-stretch__sentence">
          {toks.map((t, k) => (
            <span key={k} className={t === "not" || k === toks.length - 1 ? "rn-stretch__hot" : "rn-stretch__fill"}>
              {t}{" "}
            </span>
          ))}
        </p>
        <div className="rn-verdicts">
          <BigMeter name="plain network, trained on far negations only" p={pPlain} acc={row?.rnnFar.neg} />
          <BigMeter name="LSTM, trained on far negations only" p={pLstm} acc={row?.lstmFar.neg} />
        </div>
      </div>
      <div className="rn-curves">
        <svg viewBox={`0 0 ${CW} ${CH}`} width={CW} height={CH} role="img" aria-label="Training loss over steps for the two far-trained models: the plain network stays near chance, the LSTM drops to zero.">
          <line className="rn-curves__axis" x1={5} y1={CH - 8} x2={CW - 5} y2={CH - 8} />
          <text className="fig-tick" x={5} y={CH} textAnchor="start">
            0
          </text>
          <text className="fig-tick" x={CW - 5} y={CH} textAnchor="end">
            {models.meta.steps.toLocaleString()} steps
          </text>
          <text className="fig-label" x={5} y={10} textAnchor="start">
            training loss
          </text>
          <polyline className="rn-curves__line rn-curves__line--plain" points={pts(curves.rnnFar)} />
          <polyline className="rn-curves__line rn-curves__line--lstm" points={pts(curves.lstmFar)} />
          <text className="rn-curves__tag rn-curves__tag--plain" x={CW - 8} y={CH - 8 - Math.min(curves.rnnFar[curves.rnnFar.length - 1]!, 0.8) * ((CH - 16) / 0.8) - 4} textAnchor="end">
            plain: never learns it
          </text>
          <text className="rn-curves__tag rn-curves__tag--lstm" x={CW - 8} y={CH - 14} textAnchor="end">
            LSTM
          </text>
        </svg>
        <p className="tf-p tf-p--muted">
          The plain network's loss never leaves the neighbourhood of “just read the adjective” —
          it ends training saying <b>{Math.round(pPlain * 100)}% good</b> to a sentence with a
          “not” in it, because as far as its weights are concerned the “not” was never there. The
          LSTM's loss falls to zero within the first few hundred steps. Nothing about the task
          changed between the top half of this panel and the bottom except the <i>distance</i>.
          Why distance alone should stop one network from learning and not the other is the next
          panel.
        </p>
      </div>
    </div>
  );
}

function BigMeter({ name, p, acc }: { name: string; p: number; acc?: number }) {
  const positive = p >= 0.5;
  return (
    <div className="rn-bigmeter">
      <span className="fig-label">{name}</span>
      <div className="rn-bigmeter__track">
        <span className="rn-bigmeter__mid" />
        <span
          className={`rn-bigmeter__fill${positive ? " rn-bigmeter__fill--pos" : " rn-bigmeter__fill--neg"}`}
          style={positive ? { left: "50%", width: `${(p - 0.5) * 100}%` } : { right: "50%", width: `${(0.5 - p) * 100}%` }}
        />
      </div>
      <span className={`rn-bigmeter__label${positive ? " rn-meter__label--pos" : " rn-meter__label--neg"}`}>
        {positive ? `${Math.round(p * 100)}% good` : `${Math.round((1 - p) * 100)}% bad`}
        {acc !== undefined && (
          <small>
            {" "}
            · right on {Math.round(acc * 100)}% of 200 negated sentences at this gap
          </small>
        )}
      </span>
    </div>
  );
}

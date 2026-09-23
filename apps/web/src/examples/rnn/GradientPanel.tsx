// Why the plain one forgets: a calculator.
//
// Press × 0.1 twenty times and the display is 0.00000000000000000001. Press
// × 2 twenty times and it is a million. Training a recurrent network does
// exactly this: the signal that says "you got it wrong, adjust" starts at the
// verdict and has to travel back through the chain, and every step of the
// chain multiplies it by something. Twenty words, twenty multiplications.
//
// The bottom half is that multiplication measured on the real networks. For
// the plain one the multiplier at each step is the exact backward pass
// (‖Whᵀ·(g ⊙ (1−h²))‖ / ‖g‖); the "signal left" bar is the running product,
// which is what a word that far back gets to learn from. Before training the
// factors sit around a half and the product is gone in a dozen words. For the
// LSTM the multiplier along the notebook path is the keep gate itself — a
// dial the network can set to one directly, which a plain network cannot.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { COL, X0 } from "./Corridor.js";
import { plainFactors, runLSTM, runPlain, type Models } from "./rnn.js";

const KEYS = [0.1, 0.5, 0.9, 1, 1.1, 2, 10];

function Calculator() {
  const [tape, setTape] = useState<number[]>([]);
  const value = tape.reduce((acc, k) => acc * k, 1);
  const press = (k: number, times = 1) => setTape((t) => [...t, ...Array<number>(times).fill(k)]);
  const shown =
    value === 0
      ? "0"
      : Math.abs(value) >= 1e6 || Math.abs(value) < 1e-4
        ? value.toExponential(2).replace("e", " × 10^")
        : value.toPrecision(6).replace(/\.?0+$/, "");
  return (
    <div className="rn-calc">
      <div className="rn-calc__display" aria-live="polite">
        <span className={`rn-calc__value${Math.abs(value) > 1e6 ? " rn-calc__value--boom" : Math.abs(value) < 1e-6 && value !== 0 ? " rn-calc__value--gone" : ""}`}>{shown}</span>
        <span className="rn-calc__count">{tape.length} press{tape.length === 1 ? "" : "es"}</span>
      </div>
      <div className="rn-calc__keys">
        {KEYS.map((k) => (
          <button key={k} type="button" className="rn-calc__key" onClick={() => press(k)}>
            × {k}
          </button>
        ))}
      </div>
      <div className="rn-calc__row">
        <Button size="sm" variant="subtle" onClick={() => press(tape[tape.length - 1] ?? 0.1, 20)}>
          press the last key 20 more times
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTape([])}>
          clear
        </Button>
      </div>
      <p className="rn-calc__tape">
        {tape.length === 0 ? (
          <>Start at 1. Pick a key and keep pressing it.</>
        ) : (
          <>
            1{tape.slice(0, 24).map((k, i) => ` × ${k}`)}{tape.length > 24 ? ` … (${tape.length - 24} more)` : ""} = <b>{shown}</b>
          </>
        )}
      </p>
    </div>
  );
}

type PlainPick = "plainInit" | "plain" | "plainFar";
type LstmPick = "lstmInit" | "lstm" | "lstmFar";

const PLAIN_LABEL: Record<PlainPick, string> = {
  plainInit: "before training",
  plain: "after training on short gaps",
  plainFar: "after training on far gaps",
};
const LSTM_LABEL: Record<LstmPick, string> = {
  lstmInit: "before training",
  lstm: "after training on short gaps",
  lstmFar: "after training on far gaps",
};

const fmt = (x: number) => (x >= 0.01 ? x.toFixed(2) : x >= 1e-4 ? x.toFixed(4) : x.toExponential(1));

export function GradientPanel({ models, ids, tokens }: { models: Models; ids: number[]; tokens: string[] }) {
  const [pick, setPick] = useState<PlainPick>("plainInit");
  const [lpick, setLpick] = useState<LstmPick>("lstmInit");
  const T = tokens.length;

  const plain = useMemo(() => {
    const m = models[pick];
    const run = runPlain(m, ids);
    return { run, grad: plainFactors(m, run) };
  }, [models, pick, ids]);

  const lstm = useMemo(() => {
    const run = runLSTM(models[lpick], ids);
    // Follow the notebook line the network keeps longest.
    const sums = new Float32Array(models.H);
    for (const s of run.steps) for (let k = 0; k < models.H; k++) sums[k]! += s.f[k]!;
    let line = 0;
    for (let k = 1; k < models.H; k++) if (sums[k]! > sums[line]!) line = k;
    const factors = run.steps.map((s) => s.f[line]!);
    // Running product from the end back to each word.
    const remaining = new Array<number>(T + 1).fill(1);
    for (let t = T; t >= 1; t--) remaining[t - 1] = remaining[t]! * factors[t - 1]!;
    return { run, line, factors, remaining };
  }, [models, lpick, ids, T]);

  const w = X0 + (T + 1) * COL + 90;
  const BAR_H = 54;

  return (
    <>
      <Calculator />

      <h3 className="rn-h3">The network's own calculator</h3>
      <p className="at-sub">
        Learning runs the chain backwards. The verdict is compared with the right answer, and the
        difference has to travel back to every word to say how that word's weights should change.
        At each step on the way back it is multiplied by a number. Below is that number, per
        step, for the sentence above — measured on the plain network, then on the LSTM's notebook
        path — and the running product, which is all the signal a word that far back gets to learn
        from.
      </p>

      <div className="rn-picks">
        <span className="fig-row">plain network</span>
        {(Object.keys(PLAIN_LABEL) as PlainPick[]).map((k) => (
          <Button key={k} size="sm" variant={pick === k ? "primary" : "subtle"} onClick={() => setPick(k)}>
            {PLAIN_LABEL[k]}
          </Button>
        ))}
      </div>
      <FactorChain
        tokens={tokens}
        factors={Array.from({ length: T }, (_, k) => plain.grad.factors[k + 1]!)}
        remaining={plain.grad.remaining}
        width={w}
        barH={BAR_H}
        caption={`the plain network, ${PLAIN_LABEL[pick]}: multiplier per step, and how much signal is left by the time it reaches each word`}
      />
      <p className="tf-readout">
        {pick === "plainInit" ? (
          <>
            Before training, every step multiplies by about{" "}
            <b>{fmt(geoMean(plain.grad.factors.slice(1)))}</b>. By the time the signal has come
            back {T} words to <b>{tokens[0]}</b>, <b>{pct(plain.grad.remaining[0]!)}</b> of it is
            left. The first word's weights are being asked to learn from almost nothing — and a
            “not” twenty words from the adjective is, at the start of training, invisible to
            training. That is the <b>vanishing gradient</b>, and it is why the far-trained plain
            network in the panel above never got going.
          </>
        ) : pick === "plain" ? (
          <>
            After training on short gaps the multipliers are no longer all below one: some steps
            now multiply by <b>{fmt(Math.max(...plain.grad.factors.slice(1)))}</b>. The network
            has learned to <i>hold</i> the flag, which needs a path whose product stays near one —
            and it found one, because the gaps it trained on were short enough for the signal to
            reach back and teach it. Factors above one are the other half of the problem: a chain
            of them is the calculator's × 2 key, and the trainer clips the total at{" "}
            {models.meta.clip} to stop it. That is the <b>exploding gradient</b>, and clipping is
            the everyday fix.
          </>
        ) : (
          <>
            The far-trained plain network never learned to carry anything: its multipliers still
            shrink the signal at nearly every step, and{" "}
            <b>{pct(plain.grad.remaining[0]!)}</b> of it reaches the first word. It reads the
            adjective and nothing else, and its weights show why — the signal that would have
            taught it about “not” never arrived.
          </>
        )}
      </p>

      <div className="rn-picks">
        <span className="fig-row">LSTM, notebook path</span>
        {(Object.keys(LSTM_LABEL) as LstmPick[]).map((k) => (
          <Button key={k} size="sm" variant={lpick === k ? "primary" : "subtle"} onClick={() => setLpick(k)}>
            {LSTM_LABEL[k]}
          </Button>
        ))}
      </div>
      <FactorChain
        tokens={tokens}
        factors={lstm.factors}
        remaining={lstm.remaining}
        width={w}
        barH={BAR_H}
        caption={`the LSTM, ${LSTM_LABEL[lpick]}: the keep gate on the notebook line it keeps longest, and its running product`}
      />
      <p className="tf-readout">
        On the notebook path the multiplier is not a matrix and a squash; it is the <b>keep
        gate</b>, a single number between 0 and 1 that the network sets directly. Before training
        it sits at about <b>{fmt(geoMean(lstm.factors))}</b> — the trainer starts the gate leaning
        open, the standard trick — so the product is already{" "}
        <b>{pct(lstm.remaining[0]!)}</b> at the first word rather than nothing. And a gate can be
        turned to 1: after training, this line's multipliers run{" "}
        <b>
          {fmt(Math.min(...runLSTM(models.lstm, ids).steps.map((s) => s.f[lstm.line]!)))}–
          {fmt(Math.max(...runLSTM(models.lstm, ids).steps.map((s) => s.f[lstm.line]!)))}
        </b>
        . × 1, twenty times, is still 1. That is the whole reason the LSTM exists: it gives the
        calculator a key that reads × 1.
      </p>
      <p className="at-panel__note">
        What is measured: for the plain network, the exact backward pass from the verdict to each
        earlier state, one step at a time, on the sentence shown. For the LSTM, the keep gate on
        one notebook line — the multiplier along the cell's direct path, which is the path the
        design protects; the LSTM also has indirect paths through its spoken state that behave
        like the plain network's. Hochreiter (1991) and Bengio, Simard &amp; Frasconi (1994)
        diagnosed the problem; Hochreiter &amp; Schmidhuber (1997) built the notebook.
      </p>
    </>
  );
}

function geoMean(xs: number[]): number {
  const v = xs.filter((x) => x > 0);
  if (!v.length) return 0;
  return Math.exp(v.reduce((s, x) => s + Math.log(x), 0) / v.length);
}
function pct(x: number): string {
  if (x >= 0.1) return `${Math.round(x * 100)}%`;
  if (x >= 0.001) return `${(x * 100).toFixed(2)}%`;
  return `${(x * 100).toExponential(1)}%`;
}

/** The chain drawn backwards: a factor over each step and a "signal left" bar
 *  under each word. */
function FactorChain({
  tokens,
  factors,
  remaining,
  width,
  barH,
  caption,
}: {
  tokens: string[];
  /** factors[k]: the multiplier applied stepping back past word k+1. */
  factors: number[];
  /** remaining[t]: signal left at the state after word t (t = 0 is the start). */
  remaining: number[];
  width: number;
  barH: number;
  caption: string;
}) {
  const T = tokens.length;
  const colX = (t: number) => X0 + t * COL;
  const yFactor = 22;
  const yWire = 40;
  const yBar0 = 56;
  const yWord = yBar0 + barH + 16;
  const h = yWord + 10;
  return (
    <div className="tf-figwrap rn-gradfig">
      <svg className="tf-fig" viewBox={`0 0 ${width} ${h}`} width={width} height={h} role="img" aria-label={caption}>
        <text className="fig-note" x={X0} y={10}>
          ← The training signal travels this way.
        </text>
        {/* the wire, right to left */}
        <line className="rn-wire" x1={colX(T)} y1={yWire} x2={colX(0) + 6} y2={yWire} markerEnd="url(#rn-arrow-back)" />
        <defs>
          <marker id="rn-arrow-back" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-stack__head" />
          </marker>
        </defs>
        {tokens.map((tok, k) => {
          const t = k + 1;
          const f = factors[k]!;
          const x = colX(t);
          return (
            <g key={`${tok}-${k}`}>
              <text className={`rn-factor${f > 1 ? " rn-factor--boom" : f < 0.5 ? " rn-factor--gone" : ""}`} x={x - COL / 2} y={yFactor} textAnchor="middle">
                × {f.toFixed(2)}
              </text>
              <circle className="rn-node" cx={x} cy={yWire} r={4} />
              <text className="rn-word" x={x} y={yWord} textAnchor="middle">
                {tok}
              </text>
            </g>
          );
        })}
        {/* signal left: at the verdict (right end) and at each state going back */}
        {Array.from({ length: T + 1 }, (_, t) => {
          const r = remaining[t]!;
          const x = colX(t);
          const bh = Math.max(1, r * barH);
          return (
            <g key={`r-${t}`}>
              <rect className="rn-remain" x={x - 9} y={yBar0 + barH - bh} width={18} height={bh} rx={2} />
              <text className="rn-remain__label" x={x} y={yBar0 + barH + 2} textAnchor="middle" dominantBaseline="hanging" style={{ display: "none" }}>
                {pct(r)}
              </text>
            </g>
          );
        })}
        <text className="tf-stack__cap" x={colX(0)} y={yWord} textAnchor="middle">
          start
        </text>
        <text className="fig-label" x={colX(T) + 14} y={yBar0 + 6}>
          signal left
        </text>
        <text className="rn-remain__pct" x={colX(0)} y={yBar0 - 4} textAnchor="middle">
          {pct(remaining[0]!)}
        </text>
        <text className="rn-remain__pct" x={colX(T)} y={yBar0 - 4} textAnchor="middle">
          100%
        </text>
      </svg>
    </div>
  );
}

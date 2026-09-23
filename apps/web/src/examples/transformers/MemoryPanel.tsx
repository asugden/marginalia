// The feed-forward layer, drawn as the dense network it is.
//
// Half of every transformer block is not attention. After the words have read
// each other, each word — alone — passes through a two-layer network: its
// sixteen numbers feed a row of hidden neurons, each of which computes a
// weighted sum plus a bias and passes it through a ReLU, exactly as on the
// activation page; the neurons that fire add their outgoing weights back
// onto the word. Research that took trained models apart found neurons in
// these layers holding facts, and found that editing them edits the fact.
//
// This layer's neurons are designed, one per fact (facts.json), so each can
// be labelled with what it adds. Every fact word is in none of the sentences
// — polish, soccer, iron — because that is the finding the panel exists to
// show: attention mixes in what is in the sentence; this layer adds what the
// model knows from elsewhere. Which word fires a neuron is carried by its
// incoming weights, which the drawing shows; hover a neuron to see them. The
// readout sets the two sources side by side. No "key", no "value": on this
// page those words belong to attention.

import { useState } from "react";
import "../shared/figure.css";
import {
  LEARNED_NEG,
  LEARNED_POS,
  magnitude,
  value,
} from "../shared/palette.js";
import {
  cosine,
  factNeurons,
  factVector,
  nearest,
  type BlockRun,
  type Model,
} from "./transformer.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
}

const W = 720;
const H = 360;
const CX = 420;
const GUTTER_X = 10;
const Y_IN = 46;
const IN_STEP = 22;
const IN_NODE = 14;
const Y_HID = 196;
const HID_STEP = 58;
const HID_NODE = 26;
const Y_OUT = 326;
/** How strongly a neuron must fire to count as recalling its fact. */
const RECALL = 0.5;

export function MemoryPanel({ model, run, row }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const x1 = run.x1[i]!;
  const x2 = run.x2[i]!;
  const mem = run.memory[i]!;
  const context = fromSentence(run, i);
  const neurons = factNeurons(model);
  const eDim = model.eDim;
  const n = neurons.length;

  // Only a strongly firing neuron counts as recalling a fact; the rest are
  // the small nudges every word picks up.
  const top = mem.open[0];
  const headline =
    top !== undefined && mem.activation[top]! >= RECALL ? top : null;
  const nudge = top !== undefined && headline === null ? top : null;

  const inX = (d: number) => CX + (d - (eDim - 1) / 2) * IN_STEP;
  const hidX = (k: number) => CX + (k - (n - 1) / 2) * HID_STEP;
  const bound = (v: Float32Array) => Math.max(1e-6, ...Array.from(v, Math.abs));
  const bIn = bound(x1);
  const bOut = bound(mem.out);
  const wBound = Math.max(...neurons.map((nr) => bound(nr.w)));
  const vBound = Math.max(...neurons.map((nr) => bound(nr.v)));

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="group"
        aria-label={`The fully connected layers for ${word}: sixteen numbers in, ${n} fact neurons, sixteen numbers out.`}
      >
        {/* Gutter captions. */}
        <text className="fig-label" x={GUTTER_X} y={Y_IN - 2}>
          in
        </text>
        <text className="fig-label-sub" x={GUTTER_X} y={Y_IN + 11}>
          after attention
        </text>
        <text className="fig-label" x={GUTTER_X} y={Y_HID - 2}>
          hidden layer
        </text>
        <text className="fig-label-sub" x={GUTTER_X} y={Y_HID + 11}>
          "fact neurons"
        </text>
        <text className="fig-label" x={GUTTER_X} y={Y_OUT - 2}>
          adds
        </text>
        <text className="fig-label-sub" x={GUTTER_X} y={Y_OUT + 11}>
          onto the word
        </text>

        {/* Connections in: each neuron's weights, sage and plum. */}
        <g className="tf-map__wires">
          {neurons.map((nr, k) =>
            Array.from({ length: eDim }, (_, d) => {
              const t = nr.w[d]! / wBound;
              const lit = hover === k;
              return (
                <line
                  key={`a-${k}-${d}`}
                  x1={inX(d)}
                  y1={Y_IN + IN_NODE / 2}
                  x2={hidX(k)}
                  y2={Y_HID - HID_NODE / 2}
                  style={{
                    stroke: t >= 0 ? LEARNED_POS : LEARNED_NEG,
                    opacity:
                      hover === null
                        ? 0.08 + 0.3 * Math.abs(t)
                        : lit
                          ? 0.25 + 0.7 * Math.abs(t)
                          : 0.03,
                  }}
                />
              );
            }),
          )}
          {/* Connections out: drawn strongly only for neurons that fired. */}
          {neurons.map((nr, k) =>
            Array.from({ length: eDim }, (_, d) => {
              const t = nr.v[d]! / vBound;
              const fired = mem.activation[k]! > 0;
              return (
                <line
                  key={`b-${k}-${d}`}
                  x1={hidX(k)}
                  y1={Y_HID + HID_NODE / 2 + 30}
                  x2={inX(d)}
                  y2={Y_OUT - IN_NODE / 2}
                  style={{
                    stroke: t >= 0 ? LEARNED_POS : LEARNED_NEG,
                    opacity: fired ? 0.2 + 0.7 * Math.abs(t) : 0.03,
                  }}
                />
              );
            }),
          )}
        </g>

        {/* In: the word's sixteen numbers. */}
        <text className="fig-label" x={inX(eDim - 1) + 18} y={Y_IN + 4}>
          <tspan className="fig-word">{word}</tspan>
        </text>
        {Array.from(x1, (v, d) => (
          <Node
            key={d}
            cx={inX(d)}
            cy={Y_IN}
            size={IN_NODE}
            fill={value(v / bIn)}
          />
        ))}

        {/* The fact neurons. */}
        {neurons.map((nr, k) => {
          const a = mem.activation[k]!;
          const cx = hidX(k);
          return (
            <g
              key={k}
              className={`tf-fact${a > 0 ? " tf-fact--fired" : ""}`}
              onMouseEnter={() => setHover(k)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                className="tf-fact__hit"
                x={cx - HID_STEP / 2}
                y={Y_HID - 40}
                width={HID_STEP}
                height={90}
              />
              <text
                className="fig-num"
                x={cx}
                y={Y_HID - HID_NODE / 2 - 7}
                textAnchor="middle"
              >
                {a > 0 ? a.toFixed(2) : "0"}
              </text>
              <Node
                cx={cx}
                cy={Y_HID}
                size={HID_NODE}
                fill={magnitude(Math.min(1, a))}
                className="tf-fact__node"
              />
              <text
                className="fig-word"
                x={cx}
                y={Y_HID + HID_NODE / 2 + 14}
                textAnchor="middle"
              >
                {nr.fact.to}
              </text>
            </g>
          );
        })}

        {/* Out: what the firing neurons add. */}
        {Array.from(mem.out, (v, d) => (
          <Node
            key={d}
            cx={inX(d)}
            cy={Y_OUT}
            size={IN_NODE}
            fill={value(v / bOut)}
          />
        ))}
      </svg>

      <div className="tf-sources">
        <div className="tf-source">
          <span className="tf-source__from">From attention</span>
          <span className="tf-source__what">
            {context.length > 0
              ? context.map((c) => c.word).join(", ")
              : "mostly itself"}
          </span>
        </div>
        <div className="tf-source">
          <span className="tf-source__from">From the fully connected layers</span>
          <FactReadout
            model={model}
            word={word}
            x1={x1}
            x2={x2}
            headline={headline}
            nudge={nudge}
          />
        </div>
      </div>
    </div>
  );
}

/** The other words this word took from, averaged over the heads: what
 *  attention mixed in from the sentence. Itself excluded; 5% or more. Shown
 *  as words only — a percentage averaged over heads would disagree with the
 *  single-head percentages in panel 1. */
function fromSentence(run: BlockRun, i: number): { word: string; w: number }[] {
  const n = run.tokens.length;
  const avg = Array.from(
    { length: n },
    (_, k) =>
      run.heads.reduce((s, h) => s + h.weights[i]![k]!, 0) / run.heads.length,
  );
  return avg
    .map((w, k) => ({ word: run.tokens[k]!, w, k }))
    .filter((d) => d.k !== i && d.w >= 0.05)
    .sort((a, b) => b.w - a.w)
    .slice(0, 3);
}

function FactReadout({
  model,
  word,
  x1,
  x2,
  headline,
  nudge,
}: {
  model: Model;
  word: string;
  x1: Float32Array;
  x2: Float32Array;
  headline: number | null;
  /** The strongest neuron when none fires strongly enough to recall a fact. */
  nudge: number | null;
}) {
  if (headline === null) {
    const to = nudge === null ? null : factNeurons(model)[nudge]!.fact.to;
    return (
      <span className="tf-source__what">
        {to
          ? `small nudges only, the largest toward ${to}`
          : `${word} passes through as it came`}
      </span>
    );
  }
  const fact = factNeurons(model)[headline]!.fact;
  const to = factVector(model, fact.to);
  const f = (v: number) => v.toFixed(2).replace("-", "−");
  const before = cosine(x1, to);
  const after = cosine(x2, to);
  const still = nearest(model, x2, 1)[0]!.word;
  return (
    <span className="tf-source__what">
      <b className="tf-source__fact">{fact.to}</b>
      <span className="tf-source__tag">from outside the sentence</span> {word}{" "}
      moves from {f(before)} to <b>{f(after)}</b> like {fact.to}, and stays
      nearest to {still}
    </span>
  );
}

function Node({
  cx,
  cy,
  size,
  fill,
  className = "tf-map__node",
}: {
  cx: number;
  cy: number;
  size: number;
  fill: string;
  className?: string;
}) {
  const r = size * 0.36;
  return (
    <rect
      className={className}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={r}
      ry={r}
      style={{ fill }}
    />
  );
}

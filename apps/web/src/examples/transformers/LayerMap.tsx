// The layer, as a map — drawn once at the top so every panel can point at it.
//
// A semi-traditional network drawing, read top to bottom: rows of neurons
// joined by connections, widening in the middle and narrowing again, the way
// the digit recognizer is drawn. The one non-traditional part is the
// attention block, which is not a row of neurons but a grid of pairs — so it
// is drawn as the grids the attention page built, one per head, side by side.
// All the heads read the same input and their outputs fold through W_O into
// ONE vector before the memory: the heads are parallel to each other, not to
// the memory, and the drawing has to make that unmissable. Everything is live for the
// selected word: the top row is its embedding, the middle row is how well it
// each fact neuron's weighted sum came to (the ones that fired are outlined), the
// bottom row is the block's output.
//
// Two curved skips down the left carry the word itself past each sublayer to
// a "+": that is the residual connection, and drawing it as a bypass is what
// makes the add & norm panel's point visible before it is made.
//
// Stages run down the centre; each one's caption, and the numbered marker
// matching its panel below, sit in the gutter to the right. Marker and caption
// together are a link to that panel, so the map doubles as the page's contents.

import { useNavigate } from "react-router-dom";
import { LEARNED_NEG, LEARNED_POS, value } from "../shared/palette.js";
import { MiniGrid, Strip } from "./draw.js";
import { factNeurons, type BlockRun, type Model } from "./transformer.js";

interface Props {
  model: Model;
  run: BlockRun;
  row: number;
}

const W = 500;
// Room above the input row for the embedding strip, and below the output row
// for its counterpart.
const DY = 44;
const H = 536 + DY + 40;
const CX = 150; // horizontal centre of the rows — the flow runs down it
const NODE_GAP = 11;
const NODE = 8; // neuron side; rounded squares, as the digit recognizer draws them
const HID_NODE = 8; // the memory's hidden neurons: one per fact
const Y_IN = 34 + DY;
const ATT_Y = 62 + DY; // attention box, top edge
const ATT_H = 124; // attention box height
const ATT_W = 196; // and width: wide enough for the heads side by side
const HEAD_S = 50; // one head's grid
const HEAD_GAP = 13;
const HEAD_Y = ATT_Y + 28; // top of the head grids
const WO_Y = ATT_Y + 96; // top of the W_O bar the heads fold into
const WO_W = 66;
const WO_H = 16;
const Y_PLUS1 = 216 + DY;
const Y_A = 254 + DY;
const Y_HID = 340 + DY;
const Y_B = 426 + DY;
const Y_PLUS2 = 460 + DY;
const Y_OUT = 510 + DY;
// The embedding strips: one cell per number, each cell directly above (or
// below) the neuron that holds it, so the strip and the row read as the same
// vector in two drawings — the strip being the form word2vec introduced.
const EMB_T = 16; // strip thickness
const EMB_IN_Y = Y_IN - 16 - EMB_T; // top edge of the input strip
const EMB_OUT_Y = Y_OUT + 16; // top edge of the output strip
const SKIP_X = 18; // the channel the two residual arcs run down
const FRAME_X = 46;
const FRAME_W = 208;
const FRAME_TOP = ATT_Y - 14;
const FRAME_BOT = (Y_PLUS2 + Y_OUT) / 2;
const MARK_X = 268; // the gutter: numbered markers, then captions
const CAP_X = 282;

function rowX(count: number, gap: number) {
  const span = (count - 1) * gap;
  return (i: number) => CX - span / 2 + i * gap;
}

export function LayerMap({ model, run, row }: Props) {
  const navigate = useNavigate();
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const eDim = model.eDim;
  const E = run.E[i]!;
  const x1 = run.x1[i]!;
  const memOut = run.memory[i]!.out;
  const act = run.memory[i]!.activation;
  const match = run.memory[i]!.match;
  const x2 = run.x2[i]!;
  const neurons = factNeurons(model);
  const hidden = neurons.length;
  const xE = rowX(eDim, NODE_GAP);
  const xH = rowX(hidden, (eDim * NODE_GAP) / hidden);
  const bound = (v: Float32Array) => Math.max(...Array.from(v, Math.abs)) || 1;
  const bE = bound(E);
  const b1 = bound(x1);
  const bB = bound(memOut);
  const b2 = bound(x2);
  const bM = bound(match);
  const wBound = Math.max(...neurons.map((nr) => bound(nr.w)));
  const vBound = Math.max(...neurons.map((nr) => bound(nr.v)));
  const nHeads = run.heads.length;
  const headsW = nHeads * HEAD_S + (nHeads - 1) * HEAD_GAP;
  const headX = (k: number) => CX - headsW / 2 + k * (HEAD_S + HEAD_GAP);

  return (
    <div className="tf-figwrap">
      <svg
        className="tf-fig tf-map"
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        // Not role="img": that would hide the stage links inside from
        // assistive tech.
        role="group"
        aria-label={`One transformer layer for ${word}, read top to bottom: its embedding enters, passes through ${run.heads.length} attention heads side by side whose outputs are folded into one vector by W O, is added back to itself and normalised, passes through a two-layer memory, is added back again and normalised, and leaves. A language model repeats this block in series N times.`}
      >
        <defs>
          <marker
            id="tf-map-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0,0.5 L8,4 L0,7.5 Z" className="tf-map__head" />
          </marker>
        </defs>

        {/* the frame: one block, which a language model repeats in series */}
        <rect
          className="tf-map__repeat"
          x={FRAME_X}
          y={FRAME_TOP}
          width={FRAME_W}
          height={FRAME_BOT - FRAME_TOP}
          rx={12}
        />
        {/* Step 5 lives on the counting parameters page ("Make it
            bigger!"): how many of these blocks real models run in series. */}
        <a
          className="tf-map__link"
          href="/examples/parameter-budget"
          aria-label="Step 5: blocks in series, on the counting parameters page"
          onClick={(e) => {
            e.preventDefault();
            navigate("/examples/parameter-budget");
          }}
        >
          <Marker x={MARK_X} y={FRAME_BOT} n={5} />
          <text className="tf-map__nx" x={CAP_X} y={FRAME_BOT + 3.5}>
            repeat in series × N
          </text>
        </a>

        {/* connections, drawn first so nodes sit on top */}
        <g className="tf-map__wires">
          {neurons.map((nr, hIdx) =>
            Array.from({ length: eDim }, (_, d) => (
              <line
                key={`a-${hIdx}-${d}`}
                x1={xE(d)}
                y1={Y_A}
                x2={xH(hIdx)}
                y2={Y_HID}
                style={wire(nr.w[d]! / wBound, 0.15, 0.6)}
              />
            )),
          )}
          {neurons.map((nr, hIdx) =>
            Array.from({ length: eDim }, (_, d) => (
              <line
                key={`b-${hIdx}-${d}`}
                x1={xH(hIdx)}
                y1={Y_HID}
                x2={xE(d)}
                y2={Y_B}
                style={
                  act[hIdx]! > 0
                    ? wire(nr.v[d]! / vBound, 0.3, 0.7)
                    : wire(nr.v[d]! / vBound, 0.06, 0.2)
                }
              />
            )),
          )}
        </g>

        {/* input row */}
        <text className="fig-label" x={CAP_X} y={EMB_IN_Y + EMB_T / 2 + 3}>
          embedding: <tspan className="fig-word--key">{word}</tspan>
        </text>
        <Strip
          v={E}
          bound={bE}
          x={xE(0) - NODE_GAP / 2}
          y={EMB_IN_Y}
          cell={NODE_GAP}
          thick={EMB_T}
        />
        <EmbLinks
          xs={Array.from(E, (_, d) => xE(d))}
          y1={EMB_IN_Y + EMB_T + 1}
          y2={Y_IN - NODE / 2 - 1}
        />
        <text className="fig-label" x={CAP_X} y={Y_IN + 3}>
          in
        </text>
        {Array.from(E, (v, d) => (
          <Node key={d} cx={xE(d)} cy={Y_IN} size={NODE} fill={value(v / bE)} />
        ))}
        <line
          className="tf-map__flow"
          x1={CX}
          y1={Y_IN + 8}
          x2={CX}
          y2={ATT_Y - 4}
          markerEnd="url(#tf-map-arrow)"
        />

        {/* attention block: the heads side by side, folded by W_O */}
        <rect
          className="tf-box"
          x={CX - ATT_W / 2}
          y={ATT_Y}
          width={ATT_W}
          height={ATT_H}
          rx={8}
        />
        {run.heads.map((hd, k) => {
          const hx = headX(k);
          const hcx = hx + HEAD_S / 2;
          return (
            <g key={k}>
              {/* every head reads the same input */}
              <line
                className="tf-map__fan"
                x1={CX}
                y1={ATT_Y + 2}
                x2={hcx}
                y2={HEAD_Y - 13}
              />
              <text
                className="tf-map__headlabel"
                x={hcx}
                y={HEAD_Y - 4}
                textAnchor="middle"
              >
                head {k + 1}
              </text>
              <MiniGrid
                weights={hd.weights}
                x={hx}
                y={HEAD_Y}
                size={HEAD_S}
                activeRow={i}
              />
              {/* and every head's output goes to the same W_O */}
              <line
                className="tf-map__fan"
                x1={hcx}
                y1={HEAD_Y + HEAD_S + 2}
                x2={CX - WO_W / 2 + ((k + 0.5) * WO_W) / nHeads}
                y2={WO_Y - 1}
              />
            </g>
          );
        })}
        <rect
          className="tf-map__wo"
          x={CX - WO_W / 2}
          y={WO_Y}
          width={WO_W}
          height={WO_H}
          rx={3}
        />
        <text
          className="tf-map__wolabel"
          x={CX}
          y={WO_Y + WO_H / 2 + 3.5}
          textAnchor="middle"
        >
          W
          <tspan dy="2.5" fontSize="7">
            O
          </tspan>
        </text>
        <a
          className="tf-map__link"
          href="#tf-heads"
          aria-label="Go to step 1: multi-headed attention"
        >
          <Marker x={MARK_X} y={ATT_Y + ATT_H / 2} n={1} />
          <text className="tf-map__cap" x={CAP_X} y={ATT_Y + ATT_H / 2 + 3}>
            Multi-headed attention
          </text>
        </a>
        <line
          className="tf-map__flow"
          x1={CX}
          y1={ATT_Y + ATT_H + 4}
          x2={CX}
          y2={Y_PLUS1 - 12}
          markerEnd="url(#tf-map-arrow)"
        />

        {/* skip 1 and the first plus */}
        <path
          className="tf-map__skip"
          d={`M ${xE(0) - 8} ${Y_IN} C ${SKIP_X} ${Y_IN}, ${SKIP_X} ${Y_PLUS1}, ${CX - 12} ${Y_PLUS1}`}
          markerEnd="url(#tf-map-arrow)"
        />
        <circle className="tf-map__plus" cx={CX} cy={Y_PLUS1} r={10} />
        <text
          className="tf-map__plussign"
          x={CX}
          y={Y_PLUS1 + 4}
          textAnchor="middle"
        >
          +
        </text>
        <a
          className="tf-map__link"
          href="#tf-addnorm"
          aria-label="Go to step 2: add and norm"
        >
          <Marker x={MARK_X} y={Y_PLUS1} n={2} />
          <text className="tf-map__cap" x={CAP_X} y={Y_PLUS1 + 3.5}>
            add &amp; norm
          </text>
        </a>
        <line
          className="tf-map__flow"
          x1={CX}
          y1={Y_PLUS1 + 12}
          x2={CX}
          y2={Y_A - 8}
          markerEnd="url(#tf-map-arrow)"
        />

        {/* the memory: two layers */}
        {Array.from(x1, (v, d) => (
          <Node key={d} cx={xE(d)} cy={Y_A} size={NODE} fill={value(v / b1)} />
        ))}
        {/* Every fact neuron computes its weighted sum; only those past the
            bias fire. Colour is the sum, signed; an outline and a larger node
            mark the neurons that fired. */}
        {Array.from(match, (m, hIdx) => (
          <Node
            key={hIdx}
            className={`tf-map__node tf-map__node--hidden${act[hIdx]! > 0 ? " tf-map__node--open" : ""}`}
            cx={xH(hIdx)}
            cy={Y_HID}
            size={act[hIdx]! > 0 ? HID_NODE + 1.2 : HID_NODE}
            fill={value(m / bM)}
          />
        ))}
        {Array.from(memOut, (v, d) => (
          <Node key={d} cx={xE(d)} cy={Y_B} size={NODE} fill={value(v / bB)} />
        ))}
        <a
          className="tf-map__link"
          href="#tf-memory"
          aria-label="Go to step 3: the memory"
        >
          <Marker x={MARK_X} y={Y_HID} n={3} />
          <text className="tf-map__cap" x={CAP_X} y={Y_HID - 3}>
            Fully connected layers
          </text>
        </a>
        <line
          className="tf-map__flow"
          x1={CX}
          y1={Y_B + 8}
          x2={CX}
          y2={Y_PLUS2 - 12}
          markerEnd="url(#tf-map-arrow)"
        />

        {/* skip 2 and the second plus */}
        <path
          className="tf-map__skip"
          d={`M ${xE(0) - 8} ${Y_A} C ${SKIP_X} ${Y_A}, ${SKIP_X} ${Y_PLUS2}, ${CX - 12} ${Y_PLUS2}`}
          markerEnd="url(#tf-map-arrow)"
        />
        <circle className="tf-map__plus" cx={CX} cy={Y_PLUS2} r={10} />
        <text
          className="tf-map__plussign"
          x={CX}
          y={Y_PLUS2 + 4}
          textAnchor="middle"
        >
          +
        </text>
        <a
          className="tf-map__link"
          href="#tf-addnorm2"
          aria-label="Go to step 4: add and norm again"
        >
          <Marker x={MARK_X} y={Y_PLUS2} n={4} />
          <text className="tf-map__cap" x={CAP_X} y={Y_PLUS2 + 3.5}>
            add &amp; norm
          </text>
        </a>
        <line
          className="tf-map__flow"
          x1={CX}
          y1={Y_PLUS2 + 12}
          x2={CX}
          y2={Y_OUT - 8}
          markerEnd="url(#tf-map-arrow)"
        />

        {/* output row */}
        <text className="fig-label" x={CAP_X} y={Y_OUT + 3}>
          out
        </text>
        {Array.from(x2, (v, d) => (
          <Node
            key={d}
            cx={xE(d)}
            cy={Y_OUT}
            size={NODE}
            fill={value(v / b2)}
          />
        ))}
        <EmbLinks
          xs={Array.from(x2, (_, d) => xE(d))}
          y1={Y_OUT + NODE / 2 + 1}
          y2={EMB_OUT_Y - 1}
        />
        <Strip
          v={x2}
          bound={b2}
          x={xE(0) - NODE_GAP / 2}
          y={EMB_OUT_Y}
          cell={NODE_GAP}
          thick={EMB_T}
        />
        <text className="fig-label" x={CAP_X} y={EMB_OUT_Y + EMB_T / 2 + 3}>
          embedding: <tspan className="fig-word--key">{word}</tspan>, in context
        </text>
        <text
          className="tf-map__skiplabel"
          x={SKIP_X - 4}
          y={(Y_IN + Y_PLUS1) / 2}
          textAnchor="middle"
          transform={`rotate(-90 ${SKIP_X - 4} ${(Y_IN + Y_PLUS1) / 2})`}
        >
          the word itself, carried past
        </text>
      </svg>
    </div>
  );
}

/** Short ticks joining each strip cell to its neuron: same number, two drawings. */
function EmbLinks({ xs, y1, y2 }: { xs: number[]; y1: number; y2: number }) {
  return (
    <g className="tf-map__emblinks">
      {xs.map((x, d) => (
        <line key={d} x1={x} y1={y1} x2={x} y2={y2} />
      ))}
    </g>
  );
}

/**
 * A connection is a learned weight: sage or plum at full strength, with the
 * weight's size carried by opacity. Mixing a small weight toward the paper
 * AND fading it left the wires an unreadable grey.
 */
function wire(t: number, base: number, span: number) {
  return {
    stroke: t >= 0 ? LEARNED_POS : LEARNED_NEG,
    opacity: base + span * Math.min(1, Math.abs(t)),
  };
}

/**
 * A neuron. Drawn as a heavily-rounded square rather than a circle, matching
 * the digit recognizer's nodes, so a row of neurons reads the same across
 * every example on the site.
 */
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
  return (
    <rect
      className={className}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      rx={size * 0.36}
      ry={size * 0.36}
      style={{ fill }}
    />
  );
}

/** A numbered marker, matching the chips on the panel headings below. */
function Marker({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g className="tf-map__marker" transform={`translate(${x}, ${y})`}>
      <circle r={8} />
      <text y={3} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

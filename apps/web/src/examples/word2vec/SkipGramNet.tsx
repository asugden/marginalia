// The word2vec network, drawn in the house style.
//
// Spacing, node size and stroke weights are taken from the digit recognizer so
// the two figures read as the same kind of object: a generous first gap where
// the interesting fan-out happens, tighter gaps below, 25px nodes with rx 9,
// and 1.5px borders. Colours follow ../shared/palette.ts: connections are
// learned weights (sage positive, plum negative, width by magnitude), the
// hidden layer is computed (vermillion/cerulean), the bag is a probability
// (paper to vermillion) and the one-hot input is data as it arrived (ink).
// SVG so it stays crisp on a projector.
//
// What this figure has to carry that the digit recognizer does not:
//
//   - The waist. Wide at both ends, thin in the middle, and labelled, because
//     the bottleneck is the reason any of this produces meaning.
//   - Encoder and decoder as *named halves*, bracketed down the side, so that
//     discarding the decoder is a visible event rather than a number changing
//     in a table.
//   - The input word ruled out of the output layer. A bag of context never
//     contains the word itself, so predicting yourself is the degenerate
//     answer; greying it out makes the *other* predictions — the ones that
//     carry the lesson — the only ones on screen.
//
// Every connection is drawn: at eight words by eight hidden units there are
// only 128, so there is nothing to threshold and no detail slider to need.

import { useMemo } from "react";
import { input, magnitude, value } from "../shared/palette.js";
import { Strip } from "../transformers/draw.js";

export interface SkipGramNetProps {
  /** Words shown as input/output rows (a readable slice of the vocabulary). */
  shownWords: string[];
  /** Index into shownWords of the word currently fed in, or -1. */
  inputIndex: number;
  /** The hidden layer: the input word's embedding (drawn slice). */
  hidden: Float32Array | null;
  /** Output probability per shown word; the input word's entry is excluded. */
  outputs: number[] | null;
  /** Encoder weights, row-major [shownWords x hiddenDrawn]. */
  encoder: Float32Array | null;
  /** Decoder weights, row-major [shownWords x hiddenDrawn]. */
  decoder: Float32Array | null;
  /** Remove the decoder half and show the embedding in its place — the
   *  "throw it away" moment. */
  decoderDropped: boolean;
  /** Hovering a word in the INPUT row feeds it through the network.
   *
   *  Only the input row is interactive. Hovering the output row was tried and
   *  removed: an output node is a *prediction*, so making it swap the input
   *  underneath the reader made the figure appear to jump for no reason. */
  onHoverWord?: (i: number | null) => void;
}

// Geometry mirrors the digit recognizer exactly: 25px nodes at rx 9, 1.5px
// borders, and consistent 108px gaps between layers.
//
// The hidden row is packed at the MLP's 28.5px step rather than spread across
// the full width. That tight packing is what makes a layer read as a *layer*
// — a dense block of units — instead of eight lonely dots, and it also makes
// the waist visibly narrow, which is the whole point of the figure.
const W = 980;
const Y_IN = 156;
const Y_HID = 264; // gap 108, as in the MLP's lower layers
const Y_OUT = 372; // gap 108
const H = 468;
const GUTTER = 110;
// Where the encoder bracket ends and the decoder bracket begins. The dashed
// rule is drawn here too, so the split is one line in three places rather than
// three numbers that have to be kept in agreement by hand.
const SEAM_Y = Y_HID + 18;
// Node styling is copied verbatim from the digit recognizer so the figures are
// interchangeable at a glance. Input and output rows use its OUTPUT TILE spec;
// the hidden row uses its HIDDEN NEURON spec.
const TILE = 40; // MLP output tile size
const TILE_RX = 10; // MLP output tile corner radius
const TILE_STROKE = 2.25; // MLP output tile border
const TILE_BORDER = "#c9c2b8"; // MLP output tile border colour

const HNODE = 25; // MLP hidden neuron size
const HNODE_RX = 9; // MLP hidden neuron corner radius
const HNODE_STROKE = 2; // MLP hidden neuron border
const HNODE_BORDER = "#888888"; // MLP hidden neuron border colour

const HIDDEN_STEP = 28.5; // MLP hidden-layer spacing

// With the decoder removed, the embedding is redrawn where the bag was, in the
// strip form every later example uses for a word's vector (the transformer
// page's Strip, scaled up: one tall cell per number).
const EMB_CELL = 15;
const EMB_THICK = 27;

interface Pt {
  cx: number;
  cy: number;
}

function rowX(count: number, i: number, width: number, pad: number) {
  if (count === 1) return width / 2;
  const usable = width - 2 * pad;
  return pad + (usable * i) / (count - 1);
}

export function SkipGramNet({
  shownWords,
  inputIndex,
  hidden,
  outputs,
  encoder,
  decoder,
  decoderDropped,
  onHoverWord,
}: SkipGramNetProps) {
  const nShown = shownWords.length;
  const nHidden = hidden?.length ?? 8;

  const geo = useMemo(() => {
    const mk = (count: number, y: number): Pt[] =>
      Array.from({ length: count }, (_, i) => ({
        cx: rowX(count, i, W, GUTTER + 26),
        cy: y,
      }));
    // The hidden row is packed tight and centred on the span the input and
    // output rows occupy, not on the raw viewBox — otherwise the gutter pushes
    // it visibly off-centre.
    const inset = GUTTER + 26;
    const hiddenSpan = (nHidden - 1) * HIDDEN_STEP;
    const hiddenX0 = inset + (W - 2 * inset) / 2 - hiddenSpan / 2;
    const hiddenPts = Array.from({ length: nHidden }, (_, i) => ({
      cx: hiddenX0 + i * HIDDEN_STEP,
      cy: Y_HID,
    }));
    return {
      input: mk(nShown, Y_IN),
      hiddenPts,
      output: mk(nShown, Y_OUT),
    };
  }, [nShown, nHidden]);

  const maxOf = (M: Float32Array | null) => {
    if (!M) return 1;
    let m = 1e-6;
    for (let i = 0; i < M.length; i++) {
      const a = Math.abs(M[i]!);
      if (a > m) m = a;
    }
    return m;
  };
  const encMax = useMemo(() => maxOf(encoder), [encoder]);
  const decMax = useMemo(() => maxOf(decoder), [decoder]);

  const hiddenBound = useMemo(() => {
    if (!hidden) return 1;
    let b = 0;
    for (let i = 0; i < hidden.length; i++) {
      const a = Math.abs(hidden[i]!);
      if (a > b) b = a;
    }
    return b || 1;
  }, [hidden]);

  const outMax = outputs
    ? Math.max(...outputs.filter((_, i) => i !== inputIndex), 1e-6)
    : 1;

  return (
    <svg
      className="w2v-net"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Skip-gram network: one-hot input at the top, a narrow hidden layer that is the embedding, and a bag of context words at the bottom"
    >
      {/* Half brackets, naming encoder and decoder. */}
      <g className="w2v-net__half">
        <path
          d={`M ${GUTTER - 64} ${Y_IN - 20} h -10 V ${SEAM_Y - 2} h 10`}
          className="w2v-net__bracket"
        />
        <text
          className="w2v-net__halfname"
          transform={`translate(${GUTTER - 86}, ${(Y_IN + Y_HID) / 2}) rotate(-90)`}
          textAnchor="middle"
        >
          encoder
        </text>
      </g>

      <g
        className={`w2v-net__half${decoderDropped ? " w2v-net__half--dropped" : ""}`}
      >
        <path
          d={`M ${GUTTER - 64} ${SEAM_Y + 2} h -10 V ${Y_OUT + 34} h 10`}
          className="w2v-net__bracket"
        />
        <text
          className="w2v-net__halfname"
          transform={`translate(${GUTTER - 86}, ${(Y_HID + Y_OUT) / 2 + 12}) rotate(-90)`}
          textAnchor="middle"
        >
          decoder
        </text>
      </g>

      {/* Layer captions in the left gutter. */}
      <g className="w2v-net__labels" fontSize={11}>
        <text x={GUTTER - 20} y={Y_IN - 6} textAnchor="end">
          input
        </text>
        <text x={GUTTER - 20} y={Y_IN + 8} textAnchor="end" className="w2v-net__sublabel">
          one-hot
        </text>
        <text x={GUTTER - 20} y={Y_HID - 6} textAnchor="end">
          hidden
        </text>
        <text x={GUTTER - 20} y={Y_HID + 8} textAnchor="end" className="w2v-net__sublabel">
          the embedding
        </text>
        <text x={GUTTER - 20} y={Y_HID + 20} textAnchor="end" className="w2v-net__sublabel">
          the bottleneck
        </text>
        <text x={GUTTER - 20} y={Y_OUT - 6} textAnchor="end">
          output
        </text>
        <text x={GUTTER - 20} y={Y_OUT + 8} textAnchor="end" className="w2v-net__sublabel">
          {decoderDropped ? "the embedding" : "the bag"}
        </text>
      </g>

      {/* Encoder edges. */}
      <g>
        {encoder &&
          geo.input.map((a, r) =>
            geo.hiddenPts.map((b, c) => {
              const w = encoder[r * nHidden + c] ?? 0;
              const live = inputIndex >= 0 && r === inputIndex;
              return (
                <line
                  key={`e-${r}-${c}`}
                  x1={a.cx}
                  y1={a.cy + TILE / 2}
                  x2={b.cx}
                  y2={b.cy - HNODE / 2}
                  className={`w2v-net__edge${w >= 0 ? "" : " w2v-net__edge--neg"}`}
                  strokeWidth={0.4 + (Math.abs(w) / encMax) * 2.2}
                  opacity={inputIndex >= 0 ? (live ? 0.9 : 0.05) : 0.25}
                />
              );
            }),
          )}
      </g>

      {/* Decoder edges. */}
      <g>
        {decoder &&
          !decoderDropped &&
          geo.hiddenPts.map((a, c) =>
            geo.output.map((b, r) => {
              // The input word's own output node is out of play; so are its edges.
              if (r === inputIndex) return null;
              const w = decoder[r * nHidden + c] ?? 0;
              return (
                <line
                  key={`d-${c}-${r}`}
                  x1={a.cx}
                  y1={a.cy + HNODE / 2}
                  x2={b.cx}
                  y2={b.cy - TILE / 2}
                  className={`w2v-net__edge${w >= 0 ? "" : " w2v-net__edge--neg"}`}
                  strokeWidth={0.4 + (Math.abs(w) / decMax) * 2.0}
                  opacity={0.3}
                />
              );
            }),
          )}
      </g>

      {/* Input row. */}
      {geo.input.map((p, i) => (
        <g
          key={`in-${i}`}
          className="w2v-net__hit"
          onMouseEnter={() => onHoverWord?.(i)}
          onMouseLeave={() => onHoverWord?.(null)}
        >
          {/* A generous invisible target so the word, node and label all
              respond as one. */}
          <rect
            x={p.cx - 34}
            y={p.cy - TILE / 2 - 24}
            width={68}
            height={TILE + 34}
            fill="transparent"
          />
          <text
            className={`w2v-net__word${i === inputIndex ? " w2v-net__word--on" : ""}`}
            x={p.cx}
            y={p.cy - TILE / 2 - 9}
            textAnchor="middle"
          >
            {shownWords[i]}
          </text>
          <rect
            x={p.cx - TILE / 2}
            y={p.cy - TILE / 2}
            width={TILE}
            height={TILE}
            rx={TILE_RX}
            ry={TILE_RX}
            fill={i === inputIndex ? input(1) : "var(--surface)"}
            stroke={i === inputIndex ? "var(--ml-input-ink)" : TILE_BORDER}
            strokeWidth={i === inputIndex ? 3.5 : TILE_STROKE}
          />
          <text
            x={p.cx}
            y={p.cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="var(--font-mono, monospace)"
            fontSize={18}
            fontWeight={700}
            fill={i === inputIndex ? "#fff" : "var(--text-strong, #1c1917)"}
          >
            {i === inputIndex ? "1" : "0"}
          </text>
        </g>
      ))}

      {/* Hidden row: the embedding. */}
      {geo.hiddenPts.map((p, i) => {
        const v = hidden?.[i] ?? 0;
        return (
          <rect
            key={`h-${i}`}
            x={p.cx - HNODE / 2}
            y={p.cy - HNODE / 2}
            width={HNODE}
            height={HNODE}
            rx={HNODE_RX}
            ry={HNODE_RX}
            fill={value(v / hiddenBound)}
            stroke={HNODE_BORDER}
            strokeWidth={HNODE_STROKE}
          />
        );
      })}

      {/* With the decoder gone, the hidden layer IS the output: say so, and
          draw it the way the rest of the gallery draws a word's vector. */}
      {decoderDropped && hidden && (
        <g className="w2v-net__emb">
          <text className="w2v-net__embnote" x={W / 2} y={Y_OUT - 34} textAnchor="middle">
            The output becomes the hidden layer. We will represent embeddings as
          </text>
          <Strip
            v={hidden}
            bound={hiddenBound}
            x={W / 2 - (hidden.length * EMB_CELL) / 2}
            y={Y_OUT - 10}
            cell={EMB_CELL}
            thick={EMB_THICK}
          />
          {inputIndex >= 0 && (
            <text className="w2v-net__word" x={W / 2} y={Y_OUT + EMB_THICK + 8} textAnchor="middle">
              {shownWords[inputIndex]}
            </text>
          )}
        </g>
      )}

      {/* Output row: the bag, with the input word ruled out. */}
      {!decoderDropped && geo.output.map((p, i) => {
        const isSelf = i === inputIndex;
        const prob = outputs?.[i] ?? 0;
        const t = isSelf ? 0 : prob / outMax;
        return (
          <g key={`out-${i}`}>
            <rect
              className={isSelf ? "w2v-net__node--excluded" : ""}
              x={p.cx - TILE / 2}
              y={p.cy - TILE / 2}
              width={TILE}
              height={TILE}
              rx={TILE_RX}
              ry={TILE_RX}
              fill={isSelf ? "var(--surface)" : magnitude(t, 95)}
              stroke={TILE_BORDER}
              strokeWidth={TILE_STROKE}
            />
            <text
              className={`w2v-net__word${isSelf ? " w2v-net__word--excluded" : ""}`}
              x={p.cx}
              y={p.cy + TILE / 2 + 16}
              textAnchor="middle"
            >
              {shownWords[i]}
            </text>
            {!isSelf && prob > 0.015 && (
              <text
                className="w2v-net__pct"
                x={p.cx}
                y={p.cy + TILE / 2 + 29}
                textAnchor="middle"
              >
                {(prob * 100).toFixed(0)}%
              </text>
            )}
            {isSelf && (
              <text
                className="w2v-net__excluded"
                x={p.cx}
                y={p.cy + TILE / 2 + 29}
                textAnchor="middle"
              >
                itself
              </text>
            )}
          </g>
        );
      })}

      {/* The seam between the two halves. It sits where the encoder and decoder
          brackets meet, so the line and the brackets tell the same story — and
          it is the line the reader watches everything below fall away from.
          The layer it separates is named in the gutter, not here. */}
      <line
        x1={GUTTER - 14}
        y1={SEAM_Y}
        x2={W - 20}
        y2={SEAM_Y}
        className="w2v-net__waistline"
      />
    </svg>
  );
}

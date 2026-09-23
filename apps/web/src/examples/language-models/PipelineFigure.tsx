// The whole model, left to right, as one pass: the text so far, the
// tokenizer's IDs, an embedding row per ID, the transformer blocks, the fully
// connected layer that widens each token's vector to one number per token in
// the vocabulary, the probabilities, and the draw. The loop underneath is the
// point: the drawn token joins the text and the whole pass runs again.
//
// Shapes are gpt-oss-120b's: 36 blocks, a 2,880-number vector per token and
// an output of 201,088. Embedding cells and neurons are structure here, not
// values, so they are drawn in the neutral figure greys; the probability bars
// are this step's own numbers, on the computed scale.

import type { Token } from "./tokens.js";
import { OUTPUT_WIDTH } from "./tokens.js";

const W = 960;
const H = 236;
const MID = 92;
const ROWS = [MID - 24, MID, MID + 24];

interface Props {
  tokens: Token[];
  /** This step's top probabilities, once the model has run. */
  probs: number[] | null;
  drawn: Token | null;
  ran: boolean;
}

export function PipelineFigure({ tokens, probs, drawn, ran }: Props) {
  const last = tokens.slice(-3);
  const shown = ROWS.slice(3 - last.length);

  return (
    <svg
      className="lm-pipe"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`One pass of the model: ${tokens.length} tokens in, a tokenizer, embeddings, 36 transformer blocks, a fully connected layer with ${OUTPUT_WIDTH.toLocaleString()} outputs, probabilities, and one token drawn and added to the text.`}
    >
      <defs>
        <marker id="lm-pipe-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0.5 L8,4 L0,7.5 Z" className="lm-arrowhead" />
        </marker>
        <marker id="lm-pipe-arrow-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0.5 L8,4 L0,7.5 Z" className="lm-arrowhead lm-arrowhead--on" />
        </marker>
      </defs>

      {/* Text so far: its last three tokens. */}
      {tokens.length > 3 && (
        <text className="fig-word" x={82} y={ROWS[0]! - 22} textAnchor="end">
          …
        </text>
      )}
      {last.map((t, i) => (
        <text key={i} className="fig-word" x={82} y={shown[i]! + 4} textAnchor="end">
          {t.text.trim() || t.text}
        </text>
      ))}
      <Caption x={60} label="text so far" sub={`${tokens.length} tokens`} />

      <Arrow x1={96} x2={132} />

      {/* Tokenizer: one ID per token. */}
      {last.map((t, i) => (
        <g key={i}>
          <rect className="lm-pipe__chip" x={140} y={shown[i]! - 9} width={62} height={18} rx={4} />
          <text className="fig-num" x={171} y={shown[i]! + 4} textAnchor="middle">
            {t.id}
          </text>
        </g>
      ))}
      <Caption x={171} label="tokenizer" sub="text → ids" />

      <Arrow x1={210} x2={244} />

      {/* Embedding: a row per ID, plus its position. */}
      {shown.map((y, i) => (
        <g key={i}>
          {Array.from({ length: 8 }, (_, c) => (
            <rect key={c} className="lm-pipe__cell" x={252 + c * 11} y={y - 7} width={11} height={14} />
          ))}
        </g>
      ))}
      <Caption x={296} label="embedding" sub="a row per id, + position" />

      <Arrow x1={348} x2={386} />

      {/* Transformer blocks, in series. */}
      {[3, 2, 1, 0].map((k) => (
        <rect key={k} className="lm-pipe__block" x={396 + k * 7} y={MID - 34 + k * 7 - 10} width={100} height={62} rx={6} />
      ))}
      <text className="fig-num" x={446} y={MID - 9} textAnchor="middle">
        × 36
      </text>
      <Caption x={458} label="transformer blocks" sub="36 in series" />

      <Arrow x1={526} x2={564} />

      {/* The final fully connected layer: narrow in, very wide out. */}
      <FullyConnected x0={580} x1={650} />
      <Caption x={615} label="fully connected" sub={`2,880 → ${OUTPUT_WIDTH.toLocaleString()}`} />

      <Arrow x1={672} x2={704} />

      {/* Probabilities. */}
      {Array.from({ length: 5 }, (_, i) => {
        const y = MID - 36 + i * 16;
        const p = probs?.[i] ?? 0;
        return (
          <g key={i}>
            <rect className="lm-pipe__track" x={714} y={y} width={90} height={10} rx={2} />
            {probs && <rect className="lm-pipe__prob" x={714} y={y} width={Math.max(1.5, p * 90)} height={10} rx={2} />}
          </g>
        );
      })}
      <Caption x={759} label="probabilities" sub="top five of 201,088" />

      <Arrow x1={814} x2={846} />

      {/* Draw one token. */}
      <rect
        className={`lm-pipe__drawn${drawn ? " lm-pipe__drawn--on" : ""}`}
        x={856}
        y={MID - 14}
        width={82}
        height={28}
        rx={6}
      />
      <text className={`fig-word${drawn ? " fig-on" : ""}`} x={897} y={MID + 4} textAnchor="middle">
        {drawn ? drawn.text.trim() || drawn.text : "?"}
      </text>
      <Caption x={897} label="draw" sub="one token" />

      {/* The loop: the drawn token joins the text, and the pass runs again. */}
      <path
        className={`lm-pipe__loop${drawn ? " lm-pipe__loop--on" : ""}`}
        d={`M 897 ${H - 58} V ${H - 30} H 60 V ${H - 58}`}
        markerEnd={`url(#${drawn ? "lm-pipe-arrow-on" : "lm-pipe-arrow"})`}
      />
      <text className="fig-note" x={W / 2} y={H - 10} textAnchor="middle">
        {ran ? "Add the token to the text and run the whole pass again." : "Each new token is one full pass, left to right."}
      </text>
    </svg>
  );
}

function Caption({ x, label, sub }: { x: number; label: string; sub: string }) {
  return (
    <>
      <text className="fig-label" x={x} y={MID + 64} textAnchor="middle">
        {label}
      </text>
      <text className="fig-label-sub" x={x} y={MID + 77} textAnchor="middle">
        {sub}
      </text>
    </>
  );
}

function Arrow({ x1, x2 }: { x1: number; x2: number }) {
  return <line className="lm-series" x1={x1} y1={MID} x2={x2} y2={MID} markerEnd="url(#lm-pipe-arrow)" />;
}

function FullyConnected({ x0, x1 }: { x0: number; x1: number }) {
  const ins = [MID - 21, MID - 7, MID + 7, MID + 21];
  const outs = Array.from({ length: 8 }, (_, i) => MID - 42 + i * 12);
  return (
    <g>
      {ins.map((a) => outs.map((b) => <line key={`${a}-${b}`} className="lm-pipe__edge" x1={x0 + 5} y1={a} x2={x1 - 4} y2={b} />))}
      {ins.map((y) => (
        <rect key={y} className="fig-neuron lm-pipe__neuron" x={x0 - 5} y={y - 5} width={10} height={10} rx={3.3} />
      ))}
      {outs.map((y) => (
        <rect key={y} className="fig-neuron fig-neuron--small lm-pipe__neuron" x={x1 - 4} y={y - 4} width={8} height={8} rx={2.6} />
      ))}
      <text className="fig-tick" x={x1 + 10} y={MID + 3} textAnchor="middle">
        ⋮
      </text>
    </g>
  );
}

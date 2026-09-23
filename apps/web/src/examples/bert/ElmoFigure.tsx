// ELMo, drawn beside BERT.
//
// ELMo (Peters et al., 2018) was the contextual embedding before BERT, and it
// was a recurrent network: one LSTM reads the sentence left to right, another
// reads it right to left, and a word's vector is the two states stacked. The
// figure is the recurrent example's Pac-Man twice, running in opposite
// directions along the same sentence, meeting at the chosen word — against
// BERT's grid, where every word reaches the chosen word directly.
//
// A schematic, not a run: there is no trained ELMo on this page and no numbers
// are shown. The strips are drawn as outlines.

import { Link } from "react-router-dom";
import { PacMan } from "../rnn/Corridor.js";

const COL = 68;
const X0 = 60;

export function ElmoFigure({ tokens, at }: { tokens: string[]; at: number }) {
  const n = tokens.length;
  const w = X0 + n * COL + 40;
  // Room for the stacked caption when the chosen word is near the right end.
  const wAll = Math.max(w, X0 + at * COL + COL / 2 + 230);
  const colX = (k: number) => X0 + k * COL + COL / 2;
  const yFwd = 62;
  const yBwd = 116;
  const yWordE = 168;
  const yBert = 262;
  const yWordB = yBert + 42;
  const h = yWordB + 14;

  return (
    <div className="tf-figwrap">
      <svg className="tf-fig bt-elmo" viewBox={`0 0 ${wAll} ${h}`} width={wAll} height={h} role="img" aria-label={`ELMo: two recurrent networks read the sentence in opposite directions and meet at ${tokens[at]}; BERT: every word attends to ${tokens[at]} directly.`}>
        {/* ── ELMo ── */}
        <text className="bt-elmo__title" x={0} y={14}>
          ELMo, 2018
        </text>
        <text className="fig-label-sub" x={0} y={yFwd + 4} textAnchor="start">
          →
        </text>
        <text className="fig-label-sub" x={0} y={yBwd + 4} textAnchor="start">
          ←
        </text>
        {/* tracks */}
        <rect className="rn-track" x={X0 - 10} y={yFwd - 14} width={n * COL + 20} height={28} rx={14} />
        <rect className="rn-track" x={X0 - 10} y={yBwd - 14} width={n * COL + 20} height={28} rx={14} />
        {tokens.map((t, k) => {
          const x = colX(k);
          const isAt = k === at;
          return (
            <g key={`${t}-${k}`}>
              {/* forward: eaten up to `at`, pellets beyond */}
              {k > at && <circle className="rn-dot" cx={x} cy={yFwd} r={3.5} />}
              {k < at && <circle className="rn-dot" cx={x} cy={yBwd} r={3.5} />}
              {/* the state each direction carries at this word, as an outline */}
              {k <= at && <rect className={`bt-elmo__state${isAt ? " bt-elmo__state--on" : ""}`} x={x - 4} y={yFwd - 34} width={8} height={18} rx={1.5} />}
              {k >= at && <rect className={`bt-elmo__state${isAt ? " bt-elmo__state--on" : ""}`} x={x - 4} y={yBwd + 16} width={8} height={18} rx={1.5} />}
              <text className={`rn-word${isAt ? " rn-word--now" : ""}`} x={x} y={yWordE + 12} textAnchor="middle">
                {t}
              </text>
              {isAt && (
                <>
                  <line className="bt-elmo__join" x1={x - 4} y1={yFwd - 16} x2={x - 4} y2={yBwd + 16} />
                  <line className="bt-elmo__join" x1={x + 4} y1={yFwd - 16} x2={x + 4} y2={yBwd + 16} />
                  <text className="tf-stack__cap" x={x + 10} y={(yFwd + yBwd) / 2 + 3} textAnchor="start">
                    ← both states, stacked: the word's vector
                  </text>
                </>
              )}
            </g>
          );
        })}
        <g style={{ transform: `translate(${colX(at)}px, ${yFwd}px)` }}>
          <PacMan x={0} y={0} open={0.5} r={11} />
        </g>
        <g style={{ transform: `translate(${colX(at)}px, ${yBwd}px) scale(-1, 1)` }}>
          <PacMan x={0} y={0} open={0.5} r={11} />
        </g>
        <text className="tf-stack__cap" x={X0} y={yFwd - 40} textAnchor="start">
          what the forward reader carries at each word
        </text>
        <text className="tf-stack__cap" x={X0} y={yBwd + 46} textAnchor="start">
          what the backward reader carries at each word
        </text>

        {/* ── BERT ── */}
        <text className="bt-elmo__title" x={0} y={yBert - 50}>
          BERT, later in 2018
        </text>
        {tokens.map((t, k) => {
          const x = colX(k);
          const isAt = k === at;
          if (isAt) return null;
          const to = colX(at);
          const lift = 18 + Math.abs(k - at) * 6;
          return (
            <path
              key={`arc-${k}`}
              className={k < at ? "bt-mask__arc bt-mask__arc--left" : "bt-mask__arc bt-mask__arc--right"}
              d={`M ${x} ${yBert - 6} Q ${(x + to) / 2} ${yBert - lift} ${to} ${yBert - 8}`}
            />
          );
        })}
        {tokens.map((t, k) => (
          <text key={`b-${t}-${k}`} className={`rn-word${k === at ? " rn-word--now" : ""}`} x={colX(k)} y={yBert + 8} textAnchor="middle">
            {t}
          </text>
        ))}
        <text className="tf-stack__cap" x={colX(at)} y={yWordB} textAnchor="middle">
          every word, directly, in every one of 12 blocks
        </text>
      </svg>
      <p className="tf-readout">
        <b>ELMo</b> — Embeddings from Language Models, February 2018 — was the contextual
        embedding before BERT, and it is a <Link to="/examples/rnn">recurrent network</Link>: two
        LSTMs, one reading the sentence forwards and one backwards, each trained to guess the
        next word in its direction. A word's vector is the two states stacked. It gets both
        sides, but each reader has only <i>its</i> side when it reaches <b>{tokens[at]}</b>, and
        the two never meet until they are stacked at the end. BERT's word reaches every other word
        directly, on both sides, in every block. That is the difference the paper meant by
        “deeply bidirectional”, and the name is a nod to the lineage: Sesame Street's ELMo came
        first.
      </p>
    </div>
  );
}

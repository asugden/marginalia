// "The word moved" — attention as motion in space.
//
// This figure exists because naming the three roles (query, key, value) gives
// a student vocabulary but no intuition. The intuition is that a token starts
// at one place in space, absorbs context, and ends up somewhere else — nearer
// the words it attended to. That is what attention is *for*, and it is
// invisible in a table of numbers.
//
// So: project the value vectors and the head's output into 2D and draw the
// journey. The arrow from a token's own V to its output is the thing to look
// at. For a noun in these sentences the arrow points firmly at its adjectives.
//
// The projection is PCA over the vectors being shown, so the axes have no
// independent meaning and the caption says so. What is faithful is the
// *relative* arrangement: attending to a word pulls you toward it, and the
// cosine readout beside the plot is computed in the full 16 dimensions, not
// from the picture.

import { useMemo } from "react";
import { projectTo2D } from "../shared/embeddings/embeddings.js";
import type { AttentionRun } from "./attention.js";
import { cosine } from "./attention.js";

interface Props {
  run: AttentionRun;
  /** The token whose journey is drawn. */
  row: number;
  /** Output recomputed with a value zeroed, when that demo is active. */
  outOverride?: Float32Array | null;
}

const W = 460;
const H = 300;
const PAD = 34;

export function MovementPlot({ run, row, outOverride }: Props) {
  const i = Math.min(row, run.tokens.length - 1);
  const out = outOverride ?? run.out[i]!;

  // Project every token's value vector plus this token's output together, so
  // they share one coordinate frame and the arrow is meaningful.
  const { points, outPoint } = useMemo(() => {
    const all = [...run.V, out];
    const proj = projectTo2D(all, run.V[0]?.length ?? 0);
    const xs = proj.map((p) => p.x);
    const ys = proj.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = (x: number) =>
      PAD + ((x - minX) / (maxX - minX || 1)) * (W - PAD * 2);
    const sy = (y: number) =>
      H - PAD - ((y - minY) / (maxY - minY || 1)) * (H - PAD * 2);
    const scaled = proj.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    return {
      points: scaled.slice(0, run.V.length),
      outPoint: scaled[scaled.length - 1]!,
    };
  }, [run.V, out]);

  const weights = run.weights[i]!;
  const selfPoint = points[i]!;

  // Rank the other tokens by how much this one attends to them; the top two
  // get labelled prominently because they are the story.
  const ranked = weights
    .map((w, j) => ({ w, j }))
    .filter((x) => x.j !== i)
    .sort((a, b) => b.w - a.w);
  const top = new Set(ranked.slice(0, 2).map((x) => x.j));

  const selfSim = cosine(out, run.V[i]!);
  const topJ = ranked[0]?.j ?? i;
  const topSim = cosine(out, run.V[topJ]!);

  return (
    <div className="at-move">
      <svg
        className="at-move__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Where the output for ${run.tokens[i]} lands relative to every token's value vector`}
      >
        {/* Faint pull lines from each attended token toward the output. Width
            follows the attention weight, so the picture shows what is doing
            the pulling. */}
        {weights.map((w, j) => {
          if (j === i || w < 0.02) return null;
          const p = points[j]!;
          return (
            <line
              key={`pull-${j}`}
              className="at-move__pull"
              x1={p.x}
              y1={p.y}
              x2={outPoint.x}
              y2={outPoint.y}
              strokeWidth={0.5 + w * 5}
              opacity={0.15 + w * 0.5}
            />
          );
        })}

        {/* The journey: from the token's own value to the head's output. */}
        <defs>
          <marker
            id="at-move-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="at-move__arrowhead" />
          </marker>
        </defs>
        <line
          className="at-move__journey"
          x1={selfPoint.x}
          y1={selfPoint.y}
          x2={outPoint.x}
          y2={outPoint.y}
          markerEnd="url(#at-move-arrow)"
        />

        {/* Every token's value vector. */}
        {points.map((p, j) => {
          const isSelf = j === i;
          const isTop = top.has(j);
          return (
            <g key={`pt-${j}`}>
              <circle
                className={`at-move__dot${isSelf ? " at-move__dot--self" : ""}${
                  isTop ? " at-move__dot--top" : ""
                }`}
                cx={p.x}
                cy={p.y}
                r={isSelf || isTop ? 5 : 3.5}
              />
              <text
                className={`at-move__label${
                  isSelf || isTop ? " at-move__label--on" : ""
                }`}
                x={p.x}
                y={p.y - 9}
                textAnchor="middle"
              >
                {run.tokens[j]}
              </text>
            </g>
          );
        })}

        {/* The output. */}
        <circle
          className="at-move__out"
          cx={outPoint.x}
          cy={outPoint.y}
          r={6.5}
        />
        <text
          className="at-move__outlabel"
          x={outPoint.x}
          y={outPoint.y + 19}
          textAnchor="middle"
        >
          output
        </text>
      </svg>

      <div className="at-move__readout">
        <p className="at-move__lead">
          <b>{run.tokens[i]}</b> began at its own value vector and moved here.
        </p>
        <dl className="at-move__stats">
          <div>
            <dt>similarity to its own vector</dt>
            <dd className={selfSim < 0.3 ? "at-move__stat--low" : undefined}>
              {selfSim.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt>similarity to the value of {run.tokens[topJ]}</dt>
            <dd className={topSim > 0.5 ? "at-move__stat--high" : undefined}>
              {topSim.toFixed(2)}
            </dd>
          </div>
        </dl>
        <p className="at-move__note">
          Measured in all {run.V[0]?.length ?? 0} dimensions
        </p>
      </div>
    </div>
  );
}

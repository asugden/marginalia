// A tree diagram, shared by all three tree examples.
//
// Notation: the node holds a plain-English *question* and the two edges are
// always labelled "no" and "yes". Binary and continuous splits therefore render
// identically — "Has feathers?" and "Ear length over 7.7 cm?" are both just
// questions — and no threshold arithmetic leaks into the picture. The place
// where the two kinds of split genuinely differ is the search behind them, and
// that belongs in the gain chart, not here.
//
// A leaf shows what it predicts plus how confident it has any right to be: the
// class mix that landed there as a stacked bar, or for regression the mean and
// the spread. Pure leaves look pure; a leaf that is 4-to-3 looks like one. The
// bar carries that on its own, so no "% pure" caption restates it in words a
// reader has not met yet, and no "gain" figure either: gain scores a contest
// that is already over by the time a tree is drawn, and the gain chart shows it
// properly, next to the losers.
//
// Edge *width* encodes how many rows flow down that branch, so the diagram reads
// as data dividing rather than as an abstract graph. Width is sqrt-scaled:
// linear width would make the depth-4 branches, where a reader looks hardest,
// vanish to nothing. Sqrt keeps them visible at the cost of widths no longer
// summing exactly at a split — worth it, since the exact count is printed too.
//
// Edge *colour* is blue for no and red for yes, matching negative/positive in
// the neural-network examples. That is why the class palette avoids both.

import { Fragment } from "react";
import {
  formatNumber,
  splitQuestion,
  type Dataset,
  type TreeNode,
} from "./cart.js";
import { CLASS_PALETTE, EDGE_BOTH, EDGE_NO, EDGE_YES } from "./palette.js";

export interface TreeViewProps {
  dataset: Dataset;
  root: TreeNode;
  /** Node ids to draw as selected. */
  selected?: Set<string>;
  /** Node ids to dim, for "this branch is not what we're looking at". */
  dimmed?: Set<string>;
  onPickNode?: (node: TreeNode) => void;
  /** Thumbnail mode: no text, just shape and leaf colour. Used by the forest. */
  compact?: boolean;
  /** Extra label under the root, e.g. "tree 7" or "round 3". */
  caption?: string;
}

const BOX_W = 150;
const BOX_H = 46;

/** Class-mix bar height. Tall enough to read as a bar, not as a border. */
const BAR_H = 11;
const C_BAR_H = 3;

/** Edge width in px for a branch carrying every row, and the floor below which
 *  a branch would stop reading as a line at all. */
const EDGE_W_MAX = 9;
const EDGE_W_MIN = 1.2;
const GAP_X = 18;
const LEVEL_H = 92;
const PAD = 14;

const C_BOX_W = 22;
const C_BOX_H = 9;
const C_GAP_X = 4;
const C_LEVEL_H = 20;

interface Placed {
  node: TreeNode;
  x: number;
  y: number;
}

/** Classic tidy-ish layout: leaves get sequential slots, internal nodes sit
 *  above the midpoint of their children. Good enough for the depth-4 trees
 *  these examples grow, and it keeps the code readable. */
function layout(root: TreeNode, boxW: number, gapX: number, levelH: number) {
  const placed: Placed[] = [];
  let nextLeafSlot = 0;
  const slot = boxW + gapX;

  const walk = (node: TreeNode): number => {
    const y = PAD + node.depth * levelH;
    if (!node.left || !node.right) {
      const x = PAD + nextLeafSlot * slot;
      nextLeafSlot++;
      placed.push({ node, x, y });
      return x;
    }
    const lx = walk(node.left);
    const rx = walk(node.right);
    const x = (lx + rx) / 2;
    placed.push({ node, x, y });
    return x;
  };
  walk(root);

  let maxX = 0;
  let maxY = 0;
  for (const p of placed) {
    maxX = Math.max(maxX, p.x + boxW);
    maxY = Math.max(maxY, p.y + BOX_H);
  }
  return { placed, width: maxX + PAD, height: maxY + PAD };
}

export function TreeView({
  dataset,
  root,
  selected,
  dimmed,
  onPickNode,
  compact = false,
  caption,
}: TreeViewProps) {
  const boxW = compact ? C_BOX_W : BOX_W;
  const boxH = compact ? C_BOX_H : BOX_H;
  const { placed, width, height } = layout(
    root,
    boxW,
    compact ? C_GAP_X : GAP_X,
    compact ? C_LEVEL_H : LEVEL_H,
  );
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  const regression = dataset.classes === undefined;
  const captionH = caption ? 18 : 0;

  return (
    <svg
      className={"tree" + (compact ? " tree--compact" : "")}
      viewBox={`0 0 ${width} ${height + captionH}`}
      // Always render at natural size and let the containing figure scroll.
      // Fitting a wide tree to its container instead would shrink the text to
      // nothing, which is the one thing a tree diagram cannot afford; a compact
      // thumbnail is scaled down by CSS instead, where there is no text to lose.
      width={width}
      height={height + captionH}
      role="img"
      aria-label="Decision tree diagram"
    >
      {/* Edges first, so boxes sit on top of them.
          Each split draws as a shared trunk plus one arm per side. The trunk
          carries *both* answers, so it is purple and as wide as the two arms
          together — drawing it as two overlapping coloured paths would just
          show whichever was painted last and would understate its width. */}
      {placed.map(({ node, x, y }) => {
        if (!node.left || !node.right) return null;
        const x1 = x + boxW / 2;
        const y1 = y + boxH;
        const lp = byId.get(node.left.id);
        const rp = byId.get(node.right.id);
        if (!lp || !rp) return null;
        const midY = (y1 + lp.y) / 2;
        const wOf = (n: TreeNode) => {
          const share = root.rows.length ? n.rows.length / root.rows.length : 0;
          return Math.max(EDGE_W_MIN, Math.sqrt(share) * EDGE_W_MAX);
        };
        const wl = wOf(node.left);
        const wr = wOf(node.right);
        const bothDim =
          dimmed?.has(node.left.id) && dimmed?.has(node.right.id);
        return (
          <Fragment key={`${node.id}-edges`}>
            {(["left", "right"] as const).map((side) => {
              const child = node[side]!;
              const cp = side === "left" ? lp : rp;
              const x2 = cp.x + boxW / 2;
              const faded = dimmed?.has(child.id);
              return (
                <Fragment key={`${node.id}-${side}`}>
                  <path
                    d={`M${x1} ${midY} H${x2} V${cp.y}`}
                    className={"tree__edge" + (faded ? " is-dim" : "")}
                    stroke={side === "left" ? EDGE_NO : EDGE_YES}
                    strokeWidth={compact ? undefined : side === "left" ? wl : wr}
                  />
                  {!compact && (
                    <text
                      x={(x1 + x2) / 2}
                      y={midY - 4}
                      className={"tree__edge-label" + (faded ? " is-dim" : "")}
                      textAnchor="middle"
                    >
                      {side === "left" ? "no" : "yes"}
                    </text>
                  )}
                </Fragment>
              );
            })}
            {/* Trunk last, so the arms' rounded joins cannot creep over it: the
                purple must read as one unbroken segment carrying both answers. */}
            <path
              d={`M${x1} ${y1} V${midY}`}
              className={"tree__edge" + (bothDim ? " is-dim" : "")}
              stroke={EDGE_BOTH}
              strokeWidth={compact ? undefined : wl + wr}
            />
            {/* A cap over the junction where all three strokes meet. Their
                square ends overlap raggedly there; one purple disc, sized to
                the widest of the three, resolves it into a single joint. */}
            {!compact && (
              <circle
                cx={x1}
                cy={midY}
                r={(wl + wr) / 2}
                className={"tree__joint" + (bothDim ? " is-dim" : "")}
                fill={EDGE_BOTH}
              />
            )}
          </Fragment>
        );
      })}

      {placed.map(({ node, x, y }) => {
        const isLeaf = !node.left || !node.right;
        const faded = dimmed?.has(node.id);
        const on = selected?.has(node.id);
        const n = node.rows.length;
        return (
          <g
            key={node.id}
            className={
              "tree__node" +
              (isLeaf ? " tree__node--leaf" : "") +
              (on ? " is-on" : "") +
              (faded ? " is-dim" : "") +
              (onPickNode ? " is-pickable" : "")
            }
            onClick={onPickNode ? () => onPickNode(node) : undefined}
          >
            <rect x={x} y={y} width={boxW} height={boxH} rx={compact ? 2 : 6} />

            {/* Class mix as a stacked bar along the bottom of the box — the
                honest picture of how settled this node's answer is. */}
            {!regression && node.counts && (
              <g>
                {node.counts.reduce<{ acc: number; out: JSX.Element[] }>(
                  (state, count, ci) => {
                    if (count === 0) return state;
                    const w = (count / n) * boxW;
                    state.out.push(
                      <rect
                        key={ci}
                        x={x + state.acc}
                        y={y + boxH - (compact ? C_BAR_H : BAR_H)}
                        width={w}
                        height={compact ? C_BAR_H : BAR_H}
                        fill={CLASS_PALETTE[ci % CLASS_PALETTE.length]}
                      />,
                    );
                    return { acc: state.acc + w, out: state.out };
                  },
                  { acc: 0, out: [] },
                ).out}
              </g>
            )}

            {!compact && (
              <>
                {isLeaf ? (
                  <>
                    <text x={x + 9} y={y + 19} className="tree__leaf-name">
                      {regression
                        ? `${formatNumber(Math.round(node.prediction * 10) / 10)} ${
                            dataset.target?.unit ?? ""
                          }`
                        : dataset.classes![node.prediction]}
                    </text>
                    <text x={x + 9} y={y + 31} className="tree__meta">
                      {n} {n === 1 ? "row" : "rows"}
                    </text>
                  </>
                ) : (
                  <>
                    <text x={x + 9} y={y + 19} className="tree__question">
                      {splitQuestion(
                        dataset.features[node.split!.featureIndex]!,
                        node.split!.threshold,
                      )}
                    </text>
                    <text x={x + 9} y={y + 31} className="tree__meta">
                      {n} rows
                    </text>
                  </>
                )}
              </>
            )}
          </g>
        );
      })}

      {caption && (
        <text x={PAD} y={height + 12} className="tree__caption">
          {caption}
        </text>
      )}
    </svg>
  );
}

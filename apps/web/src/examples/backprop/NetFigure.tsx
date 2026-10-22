// The network drawn for panels 4 and 5. One component, several states:
//
//   path     edges and neurons on a highlighted path are drawn dark; the
//            rest fade (panel 4)
//   done     neurons whose gradient is found show it under their output,
//            and the weights into them switch from learned colour (sage /
//            plum) to their gradient (vermillion / cerulean)
//   ready    neurons that can be clicked next carry a dashed ring
//   edgeTip  each weight's own working, on hover (a native SVG title)

import type { ReactNode } from "react";
import { learned, value } from "../shared/palette.js";
import { ERR_X, ERR_Y, NET_H, NET_W, NODE_H, NODE_W, ROW_Y, TILE_H, TILE_W, nameOf, pos, type Run } from "./net.js";
import { fmt, signClass } from "./ui.js";

/** A part of the network that can be clicked: the error, or neuron (l, j). */
export type NodeId = "error" | `${number}-${number}`;
export const nid = (l: number, j: number): NodeId => `${l}-${j}`;

export interface NetFigureProps {
  run: Run;
  /** Neurons (and "error") whose gradient is known. */
  done?: Set<NodeId>;
  /** Neurons that can be clicked now. */
  ready?: Set<NodeId>;
  selected?: NodeId | null;
  onPick?: (id: NodeId) => void;
  /** Edge keys `${l}-${k}-${j}` (into neuron k of layer l, from j) to draw dark. */
  path?: Set<string>;
  /** Neurons to draw dark (with path). */
  pathNodes?: Set<NodeId>;
  edgeTip?: (l: number, k: number, j: number) => string | null;
  className?: string;
  width?: number;
  children?: ReactNode;
}

export function NetFigure(p: NetFigureProps) {
  const { run } = p;
  const done = p.done ?? new Set<NodeId>();
  const faded = (key: string) => !!p.path && !p.path.has(key);
  const nodeFaded = (id: NodeId) => !!p.pathNodes && !p.pathNodes.has(id);
  const nL = run.layers.length;
  // Each layer's edges against its own largest value, for contrast.
  const maxW = (l: number) => Math.max(1e-9, ...run.layers[l]!.flatMap((n) => n.w.map((w) => Math.abs(w.val))));
  const maxG = (l: number) => Math.max(1e-9, ...run.layers[l]!.flatMap((n) => n.w.map((w) => Math.abs(w.grad))));
  const maxO = Math.max(1e-9, ...run.layers.flatMap((L) => L.map((n) => Math.abs(n.o.val))));

  return (
    <svg
      className={`bp-net ${p.className ?? ""}`}
      viewBox={`0 0 ${NET_W} ${NET_H}`}
      width={p.width ?? NET_W}
      height={((p.width ?? NET_W) * NET_H) / NET_W}
      role="img"
      aria-label="A network: three inputs, hidden layers A–D and E–H, one output y, and the error below it."
    >
      {(["inputs", "hidden 1", "hidden 2", "output"] as const).map((t, r) => (
        <text key={t} x={4} y={ROW_Y[r]} className="fig-label" dominantBaseline="middle">
          {t}
        </text>
      ))}

      {/* Weights. */}
      {run.layers.map((layer, l) =>
        layer.map((nr, k) =>
          nr.w.map((w, j) => {
            const a = pos(l, j);
            const b = pos(l + 1, k);
            const key = `${l}-${k}-${j}`;
            const asGrad = done.has(nid(l, k));
            const t = asGrad ? w.grad / maxG(l) : w.val / maxW(l);
            const tip = p.edgeTip?.(l, k, j);
            const dark = p.path?.has(key);
            return (
              <g key={key} className={faded(key) ? "bp-net__faded" : undefined}>
                <line
                  x1={a.x}
                  y1={a.y + (l === 0 ? TILE_H / 2 : NODE_H / 2)}
                  x2={b.x}
                  y2={b.y - NODE_H / 2}
                  style={{ stroke: dark ? "var(--text-strong)" : asGrad ? value(t) : learned(t) }}
                  strokeWidth={dark ? 3.5 : 0.8 + 3.2 * Math.abs(t)}
                  strokeLinecap="round"
                />
                {tip && (
                  <line
                    x1={a.x}
                    y1={a.y + (l === 0 ? TILE_H / 2 : NODE_H / 2)}
                    x2={b.x}
                    y2={b.y - NODE_H / 2}
                    className="bp-net__edgehit"
                  >
                    <title>{tip}</title>
                  </line>
                )}
              </g>
            );
          }),
        ),
      )}
      <line
        x1={ERR_X}
        y1={ROW_Y[3]! + NODE_H / 2}
        x2={ERR_X}
        y2={ERR_Y - 22}
        className={`bp-net__lossline${nodeFaded("error") ? " bp-net__faded" : ""}`}
      />

      {run.inputs.map((x, i) => {
        const c = pos(0, i);
        return (
          <g key={`x${i}`} transform={`translate(${c.x - TILE_W / 2} ${c.y - TILE_H / 2})`} className={p.pathNodes ? "bp-net__faded" : undefined}>
            <rect width={TILE_W} height={TILE_H} rx={9} className="fig-tile bp-net__tile" />
            <text x={TILE_W / 2} y={TILE_H / 2} className="fig-num" textAnchor="middle" dominantBaseline="central">
              x{i + 1} = {fmt(x.val, 2)}
            </text>
          </g>
        );
      })}

      {run.layers.map((layer, l) =>
        layer.map((nr, j) => {
          const c = pos(l + 1, j);
          const id = nid(l, j);
          const isDone = done.has(id);
          const isReady = p.ready?.has(id);
          const off = l < nL - 1 && nr.n.val <= 0;
          return (
            <g
              key={id}
              transform={`translate(${c.x - NODE_W / 2} ${c.y - NODE_H / 2})`}
              className={[
                "bp-net__neuron",
                isReady ? "is-ready" : "",
                p.selected === id ? "is-selected" : "",
                nodeFaded(id) ? "bp-net__faded" : "",
                p.pathNodes?.has(id) ? "is-path" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={isReady || isDone ? () => p.onPick?.(id) : undefined}
            >
              <rect width={NODE_W} height={NODE_H} rx={15} className="fig-neuron" style={{ fill: value(nr.o.val / maxO, 35) }} />
              <text x={-5} y={-5} className="fig-label" textAnchor="end">
                <tspan className="fig-word fig-word--key">{nameOf(l, j)}</tspan>
              </text>
              <text x={NODE_W / 2} y={17} className="fig-num" textAnchor="middle">
                {off ? "off · 0" : fmt(nr.o.val, 2)}
              </text>
              <text x={NODE_W / 2} y={34} className={`fig-num ${isDone ? signClass(nr.o.grad) : "bp-blank"}`} textAnchor="middle">
                {isDone ? `grad ${fmt(nr.o.grad, 2)}` : "grad ·"}
              </text>
            </g>
          );
        }),
      )}

      <g
        transform={`translate(${ERR_X - 80} ${ERR_Y - 22})`}
        className={[
          "bp-net__neuron",
          p.ready?.has("error") ? "is-ready" : "",
          p.selected === "error" ? "is-selected" : "",
          nodeFaded("error") ? "bp-net__faded" : "",
          p.pathNodes?.has("error") ? "is-path" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={p.ready?.has("error") || done.has("error") ? () => p.onPick?.("error") : undefined}
      >
        <rect width={160} height={44} rx={8} className="bp-net__errbox" />
        <text x={80} y={17} className="fig-num" textAnchor="middle">
          error {fmt(run.loss.val, 3)}
        </text>
        <text x={80} y={34} className={`fig-num ${done.has("error") ? "bp-pos" : "bp-blank"}`} textAnchor="middle">
          {done.has("error") ? "grad 1" : "grad ·"}
        </text>
      </g>
      {p.children}
    </svg>
  );
}

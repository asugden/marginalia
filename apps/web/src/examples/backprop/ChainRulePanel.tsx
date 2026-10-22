// Panel 4: the chain rule, with no numbers.
//
// One question: the derivative of the error with respect to one first-layer
// weight (input x2 into neuron B). Between that weight and the error sit three
// layers: hidden 1 (just B, on this path), hidden 2 (four neurons) and the
// output. Each starts closed, drawn as part of one grey block. Clicking a
// layer opens it, and the expression under the figure breaks apart there:
//
//   hidden 1 or the output   between layers: the question splits into two
//                            derivatives side by side, which multiply
//   hidden 2                 within a layer: B reaches the next layer
//                            through four neurons, so the question splits
//                            into four routes, one row each, which add
//
// Every derivative is a block reading "derivative of A with respect to B".
// Blocks belonging to one route take that route's colour, on the figure and
// in the expression; blocks every route shares stay ink, outside the
// brackets. Clicking an open layer closes it again, so the order is the
// reader's.

import { useMemo, useState } from "react";
import { Button } from "../../components/index.js";
import { CHAIN_RULE_PANEL } from "./content.js";
import { nameOf, run0 } from "./net.js";
import { Panel } from "./ui.js";

/** The first-layer weight followed: from input x2 into neuron B. */
const INPUT = 1;
const NEURON = 1;

/** One colour per hidden-2 route (general data-mark hues, docs/style.md §11:
 *  categories, not values, so never sage, plum or the accent). */
const ROUTE = ["var(--purple-600)", "var(--amber-600)", "var(--blue-600)", "var(--green-600)"];

type Row = "h1" | "h2" | "out";

const W = 560;
const H = 440;
const CX = 280;
const Y_W = 34; // the input tile
const Y_ROW: Record<Row, number> = { h1: 130, h2: 225, out: 320 };
const Y_ERR = 400;
const ROW_H = 70;
const K_X = [140, 233, 327, 420];
const NODE = 40;

interface Factor {
  of: string;
  by: string;
  /** Route index, or null for a derivative every route shares. */
  route: number | null;
}

export function ChainRulePanel() {
  const run = useMemo(() => run0(), []);
  const [open, setOpen] = useState<Record<Row, boolean>>({ h1: false, h2: false, out: false });
  const [last, setLast] = useState<Row | null>(null);

  const B = nameOf(0, NEURON);
  const ks = run.layers[1]!.map((_, k) => nameOf(1, k));
  const off = run.layers[1]!.map((n) => n.n.val <= 0);
  const w = `the weight x${INPUT + 1}→${B}`;

  const toggle = (r: Row) => {
    setOpen((o) => ({ ...o, [r]: !o[r] }));
    setLast(r);
  };

  // The expression, built from what is open. Read from the error back to the
  // weight: derivative of the later thing with respect to the earlier one.
  const top = open.out ? "y" : "the error";
  const bottom = open.h1 ? B : w;
  const leftShared: Factor[] = open.out ? [{ of: "the error", by: "y", route: null }] : [];
  const rightShared: Factor[] = open.h1 ? [{ of: B, by: w, route: null }] : [];
  const single: Factor = { of: top, by: bottom, route: null };
  const rows: Factor[][] = ks.map((k, i) => [
    { of: top, by: k, route: i },
    { of: k, by: bottom, route: i },
  ]);

  const caption = last == null ? CHAIN_RULE_PANEL.start : last === "h2" ? CHAIN_RULE_PANEL.within : CHAIN_RULE_PANEL.between;

  return (
    <Panel title={CHAIN_RULE_PANEL.title} standfirst={CHAIN_RULE_PANEL.standfirst} note={CHAIN_RULE_PANEL.note}>
      <div className="bp-controls">
        <Button
          size="sm"
          variant="subtle"
          disabled={!open.h1 && !open.h2 && !open.out}
          onClick={() => {
            setOpen({ h1: false, h2: false, out: false });
            setLast(null);
          }}
        >
          {CHAIN_RULE_PANEL.reset}
        </Button>
        <span className="bp-rule-caption">{caption}</span>
      </div>

      <div className="bp-rule">
        <PathFigure open={open} onToggle={toggle} B={B} ks={ks} off={off} inputName={`x${INPUT + 1}`} />

        <div className="bp-expr" aria-live="polite">
          <div className="bp-expr__lhs">
            <Block f={{ of: "the error", by: w, route: null }} />
            <span className="bp-expr__op">=</span>
          </div>
          <div className="bp-expr__rhs">
            {leftShared.map((f, i) => (
              <span key={`l${i}`} className="bp-expr__group">
                <Block f={f} />
                <span className="bp-expr__op">×</span>
              </span>
            ))}
            {open.h2 ? (
              <span className="bp-expr__routes">
                {rows.map((row, i) => (
                  <span key={i} className={`bp-expr__route${off[i] ? " is-off" : ""}`}>
                    {i > 0 && <span className="bp-expr__op bp-expr__op--plus">+</span>}
                    <Block f={row[0]!} />
                    <span className="bp-expr__op">×</span>
                    <Block f={row[1]!} />
                    {off[i] && <span className="bp-expr__off">{ks[i]} {CHAIN_RULE_PANEL.off}</span>}
                  </span>
                ))}
              </span>
            ) : (
              <Block f={single} />
            )}
            {rightShared.map((f, i) => (
              <span key={`r${i}`} className="bp-expr__group">
                <span className="bp-expr__op">×</span>
                <Block f={f} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Block({ f }: { f: Factor }) {
  return (
    <span
      className={`bp-block${f.route == null ? " bp-block--shared" : ""}`}
      style={f.route == null ? undefined : { borderColor: ROUTE[f.route], background: `color-mix(in srgb, ${ROUTE[f.route]} 12%, var(--surface))` }}
    >
      <span className="bp-block__small">{CHAIN_RULE_PANEL.derivativeOf}</span>
      <span className="bp-block__main">{f.of}</span>
      <span className="bp-block__small">{CHAIN_RULE_PANEL.withRespectTo}</span>
      <span className="bp-block__main">{f.by}</span>
    </span>
  );
}

/** The path from the weight to the error, drawn top to bottom. Closed layers
 *  are grey blocks (adjacent ones merge into one); open ones show their
 *  neurons. Lines run behind the blocks. */
function PathFigure({
  open,
  onToggle,
  B,
  ks,
  off,
  inputName,
}: {
  open: Record<Row, boolean>;
  onToggle: (r: Row) => void;
  B: string;
  ks: string[];
  off: boolean[];
  inputName: string;
}) {
  const rows: Row[] = ["h1", "h2", "out"];
  const label: Record<Row, string> = { h1: "hidden 1", h2: "hidden 2", out: "output" };
  // Runs of closed layers, merged into single blocks.
  const runs: Row[][] = [];
  rows.forEach((r) => {
    if (open[r]) return;
    const prev = runs[runs.length - 1];
    if (prev && rows.indexOf(prev[prev.length - 1]!) === rows.indexOf(r) - 1) prev.push(r);
    else runs.push([r]);
  });
  const routeColor = (i: number) => (open.h2 ? ROUTE[i]! : "var(--border-strong)");
  const xB = CX;
  const xY = CX;

  return (
    <svg className="bp-rule__fig" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="The path from one weight to the error, through hidden 1, hidden 2 and the output. Click a layer to open it.">
      {/* Lines first: weight → B → each hidden-2 neuron → y → error. */}
      <line x1={xB} y1={Y_W + 16} x2={xB} y2={Y_ROW.h1 - NODE / 2} className="bp-rule__line bp-rule__line--weight" />
      {/* Closed, hidden 2 is one block, so its four routes draw as one line;
          opened, they fan out to its neurons. */}
      {K_X.map((kx, i) => {
        const x = open.h2 ? kx : CX;
        return (
        <g key={i}>
          <line x1={xB} y1={Y_ROW.h1 + NODE / 2} x2={x} y2={Y_ROW.h2 - NODE / 2} style={{ stroke: routeColor(i) }} className="bp-rule__line" />
          <line x1={x} y1={Y_ROW.h2 + NODE / 2} x2={xY} y2={Y_ROW.out - NODE / 2} style={{ stroke: routeColor(i) }} className="bp-rule__line" />
        </g>
        );
      })}
      <line x1={xY} y1={Y_ROW.out + NODE / 2} x2={CX} y2={Y_ERR - 18} className="bp-rule__line" />

      {/* The input and its weight, which is what the question is about. */}
      <rect x={CX - 26} y={Y_W - 16} width={52} height={32} rx={8} className="fig-tile bp-net__tile" />
      <text x={CX} y={Y_W} className="fig-num" textAnchor="middle" dominantBaseline="central">
        {inputName}
      </text>
      <text x={CX + 12} y={(Y_W + Y_ROW.h1) / 2 - 6} className="fig-label">
        <tspan className="fig-word fig-word--key">the weight</tspan>
      </text>

      {/* Open layers: their neurons. */}
      {open.h1 && <Node x={xB} y={Y_ROW.h1} name={B} onClick={() => onToggle("h1")} />}
      {open.h2 &&
        K_X.map((x, i) => (
          <Node key={i} x={x} y={Y_ROW.h2} name={ks[i]!} color={ROUTE[i]} faded={off[i]} onClick={() => onToggle("h2")} />
        ))}
      {open.out && <Node x={xY} y={Y_ROW.out} name="y" onClick={() => onToggle("out")} />}

      {/* Closed layers: grey blocks, one per run, each layer still clickable. */}
      {runs.map((run) => {
        const y0 = Y_ROW[run[0]!] - ROW_H / 2;
        const y1 = Y_ROW[run[run.length - 1]!] + ROW_H / 2;
        return (
          <g key={run.join("-")}>
            <rect x={100} y={y0 + 4} width={W - 200} height={y1 - y0 - 8} rx={14} className="bp-rule__block" />
            <text x={CX} y={(y0 + y1) / 2} className="fig-label" textAnchor="middle" dominantBaseline="middle">
              {run.length === 3 ? "the rest of the network" : run.map((r) => label[r]).join(" + ")}
            </text>
          </g>
        );
      })}

      {/* Layer names in the gutter, and a hit area per layer. */}
      {rows.map((r) => (
        <g key={r}>
          <text x={8} y={Y_ROW[r]} className="fig-label" dominantBaseline="middle">
            {label[r]}
          </text>
          {!open[r] && (
            <rect
              x={0}
              y={Y_ROW[r] - ROW_H / 2}
              width={W}
              height={ROW_H}
              className="bp-rule__hit"
              role="button"
              aria-label={`Open ${label[r]}`}
              onClick={() => onToggle(r)}
            />
          )}
        </g>
      ))}

      <rect x={CX - 50} y={Y_ERR - 18} width={100} height={36} rx={8} className="bp-net__errbox" />
      <text x={CX} y={Y_ERR} className="fig-num" textAnchor="middle" dominantBaseline="central">
        the error
      </text>
    </svg>
  );
}

function Node({
  x,
  y,
  name,
  color,
  faded = false,
  onClick,
}: {
  x: number;
  y: number;
  name: string;
  color?: string;
  faded?: boolean;
  onClick: () => void;
}) {
  return (
    <g className={`bp-rule__node${faded ? " is-off" : ""}`} onClick={onClick} role="button" aria-label={`Close ${name}'s layer`}>
      <rect x={x - NODE / 2} y={y - NODE / 2} width={NODE} height={NODE} rx={13} className="fig-neuron" style={color ? { stroke: color } : undefined} />
      <text x={x} y={y} className="fig-num" textAnchor="middle" dominantBaseline="central">
        {name}
      </text>
    </g>
  );
}

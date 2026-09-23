// The idea, before the arithmetic: what attention does, told as a
// conversation.
//
// Every figure after this one is numbers. A reader who meets Q · K first has
// no picture of what the dot product is for, so this panel gives the picture
// with no numbers at all: each word of the first sentence asks a question
// (its query), announces what it is (its key) and has something to hand over
// (its value), written as a line of speech. Beside the words sits the
// comparison matrix in its 3Blue1Brown form — a circle per pair, sized by how
// well that row's question fits that column's answer — so the grid below is
// already familiar when it arrives with numbers in it.
//
// The speech is written for the words of the first shipped sentence, and is
// the one designed thing here. The circles are not: their areas are that
// sentence's real attention weights from ./head.json, so the pattern is the
// same one the attention matrix below prints as percentages.

import { useMemo, useState } from "react";
import { Card } from "../../components/index.js";
import { VALUE_POS } from "../shared/palette.js";
import { runAttention, type Head } from "./attention.js";

/** What each word says, in the three roles. Keyed by word so a change to the
 *  shipped sentences degrades to blank bubbles rather than wrong ones. */
const LINES: Record<string, { asks: string; is: string; gives: string }> = {
  a: {
    asks: "Nothing to ask",
    is: "I'm an article",
    gives: "one of something",
  },
  soggy: {
    asks: "Nothing to ask",
    is: "I describe food",
    gives: "wet and limp",
  },
  greasy: {
    asks: "Nothing to ask",
    is: "I describe food",
    gives: "oily and slick",
  },
  pierogi: {
    asks: "Anyone describing a food?",
    is: "I'm a food",
    gives: "a dumpling",
  },
  conquered: {
    asks: "Nothing to ask",
    is: "I'm an action",
    gives: "won, took over",
  },
  the: {
    asks: "Nothing to ask",
    is: "I'm an article",
    gives: "a particular one",
  },
  crowded: {
    asks: "Nothing to ask",
    is: "I describe a place",
    gives: "full of people",
  },
  stadium: {
    asks: "Anyone describing a place?",
    is: "I'm a place",
    gives: "a big arena",
  },
};

// A weight at or above this counts as "this answer fits" for the prose and
// for which answers stay lit. Well clear of the head's stray 1–4% weights.
const FITS = 0.15;

const ROW_H = 32;
const BUB_H = 22;
const HEAD_H = 78; // header band: lane labels on the left, rotated words over the matrix
const WORD_R = 74; // right edge of the word column
const Q_X = 86;
const Q_W = 168;
const K_X = Q_X + Q_W + 14;
const K_W = 124;
const V_X = K_X + K_W + 14;
const V_W = 116;
const M_X = V_X + V_W + 30;
const CELL = 28;
const R_MAX = CELL / 2 - 2;

/** A speech bubble: a rounded box with a small tail at its lower left. */
function Bubble({
  x,
  y,
  w,
  text,
  className,
}: {
  x: number;
  y: number;
  w: number;
  text: string;
  className: string;
}) {
  const h = BUB_H;
  const r = 7;
  // Box with a tail between x+8 and x+16 on the bottom edge, pointing down-left.
  const d = [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `V${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `H${x + 16}`,
    `L${x + 5},${y + h + 5}`,
    `L${x + 9},${y + h}`,
    `H${x + r}`,
    `Q${x},${y + h} ${x},${y + h - r}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    "Z",
  ].join(" ");
  return (
    <g className={className}>
      <path className="at-idea__bubble" d={d} />
      <text
        className="fig-note at-idea__say"
        x={x + 9}
        y={y + h / 2}
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

/** "a and b", "a, b and c" — or, for phrases that already contain "and",
 *  "a, and b". */
function list(items: string[], sep = " and "): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${sep}${items[items.length - 1]}`;
}

export function IdeaPanel({ head }: { head: Head }) {
  const tokens = useMemo(() => head.sentences[0]!.split(" "), [head]);
  const run = useMemo(() => runAttention(head, tokens, false), [head, tokens]);
  const n = tokens.length;
  // Opens on the noun the head was fitted to demonstrate, as the page does.
  const [row, setRow] = useState(Math.min(3, n - 1));
  const [cell, setCell] = useState<{ i: number; j: number } | null>(null);

  const weights = run.weights[row]!;
  const fits = (j: number) => weights[j]! >= FITS;

  // Room on the right for the last column's word, which leans out at 45°.
  const w = M_X + n * CELL + 52;
  const h = HEAD_H + n * ROW_H + 8;
  const say = (t: string) => LINES[t] ?? { asks: "", is: "", gives: "" };

  const word = tokens[row]!;
  const others = weights
    .map((wt, j) => ({ wt, j }))
    .filter(({ wt, j }) => j !== row && wt >= FITS);

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">Attention, in theory</h2>
      <p className="at-sub">
        Let's understand the attention mechanism by considering adjectives and
        nouns. Together, they form a compound noun. The{" "}
        <b>soggy greasy pierogi</b> is a single object, made more specific by
        the adjectives. Although English presents it as three words, it
        represents one thing. Separately, consider the word "it". The same word
        is reused often, but refers to different things. To What did it refer?
        Attention solves this problem.
        <br />
        <br />
        The idea is to create three separate variants of each word: a question
        (or query), a nametag (or key), and a takeaway (or value). We are going
        to anthropomorphize a model in this example, imagining what role the
        keys, queries, and values play for a real sentence.
      </p>

      <div className="at-grid__scroll">
        <svg
          className="at-idea"
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          role="img"
          aria-label={`Each word of "${head.sentences[0]}" with the question it asks, what it says it is, and what it hands over, beside a grid of circles sized by how well each question fits each answer.`}
        >
          {/* ── Lane labels ── */}
          {(
            [
              [Q_X, "query", "what it looks for"],
              [K_X, "key", "what it says it is"],
              [V_X, "value", "what it hands over"],
            ] as const
          ).map(([x, name, sub]) => (
            <g key={name}>
              <text className="fig-label" x={x} y={HEAD_H - 22}>
                {name}
              </text>
              <text className="fig-label-sub" x={x} y={HEAD_H - 9}>
                {sub}
              </text>
            </g>
          ))}
          <text className="fig-label" x={M_X} y={12}>
            query × key
          </text>
          <text className="fig-label-sub" x={M_X} y={25}>
            how well they fit
          </text>

          {/* ── The matrix's columns: one per answering word ── */}
          {tokens.map((t, j) => {
            const cx = M_X + j * CELL + CELL / 2;
            const on = cell?.j === j;
            return (
              <text
                key={`col-${j}`}
                className={`fig-word${on ? " fig-on" : ""}`}
                transform={`translate(${cx - 2}, ${HEAD_H - 6}) rotate(-45)`}
              >
                {t}
              </text>
            );
          })}

          {/* ── One row per word: who it is, what it asks, says and gives,
              and how well its question fits every answer ── */}
          {tokens.map((t, i) => {
            const y = HEAD_H + i * ROW_H;
            const mid = y + ROW_H / 2;
            const sel = i === row;
            const lines = say(t);
            // Answers stay lit when they fit the followed question.
            const answerCls = fits(i) ? "" : "fig-dim";
            return (
              <g
                key={`row-${i}`}
                className="at-idea__row"
                onClick={() => setRow(i)}
              >
                <rect
                  className={`at-idea__band${sel ? " at-idea__band--on" : ""}`}
                  x={0}
                  y={y}
                  width={w}
                  height={ROW_H}
                />
                <text
                  className={`fig-word${sel ? " fig-on" : ""}`}
                  x={WORD_R}
                  y={mid}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {t}
                </text>
                <Bubble
                  x={Q_X}
                  y={mid - BUB_H / 2 - 2}
                  w={Q_W}
                  text={lines.asks}
                  className={sel ? "at-idea__asker" : "fig-dim"}
                />
                <Bubble
                  x={K_X}
                  y={mid - BUB_H / 2 - 2}
                  w={K_W}
                  text={lines.is}
                  className={answerCls}
                />
                <Bubble
                  x={V_X}
                  y={mid - BUB_H / 2 - 2}
                  w={V_W}
                  text={lines.gives}
                  className={answerCls}
                />
                {tokens.map((_, j) => {
                  const cx = M_X + j * CELL + CELL / 2;
                  const wt = run.weights[i]![j]!;
                  const r = R_MAX * Math.sqrt(wt);
                  return (
                    <g
                      key={`c-${j}`}
                      className={sel ? undefined : "fig-dim"}
                      onMouseEnter={() => setCell({ i, j })}
                      onMouseLeave={() => setCell(null)}
                    >
                      <rect
                        className="at-idea__cell"
                        x={M_X + j * CELL}
                        y={mid - CELL / 2}
                        width={CELL}
                        height={CELL}
                      />
                      {r >= 1 && (
                        <circle cx={cx} cy={mid} r={r} fill={VALUE_POS} />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="at-idea__readout">
        <b>{word}</b>{" "}
        {others.length > 0 ? (
          <>
            asks “{say(word).asks}” {list(others.map((o) => tokens[o.j]!))}{" "}
            {others.length > 1 ? "answer" : "answers"} best, so {word} takes in
            mostly what {others.length > 1 ? "they hand" : "it hands"} over:{" "}
            {list(
              others.map((o) => say(tokens[o.j]!).gives),
              ", and ",
            )}
            . It leaves as a {list(others.map((o) => tokens[o.j]!))} {word}.
          </>
        ) : (
          <>
            has nothing to ask, so no other word's answer fits better than its
            own, and it mostly keeps what it already was.
          </>
        )}
      </p>
    </Card>
  );
}

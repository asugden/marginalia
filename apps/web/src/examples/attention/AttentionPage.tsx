// The attention example (/examples/attention).
//
// Attention first, transformers second. The usual presentation builds the
// transformer block and arrives at attention as one of its parts, which makes
// attention look like an implementation detail of an architecture. It is the
// other way round: attention is the idea, and a transformer is what you get
// when you stack it with feed-forward layers students have already met.
//
// One scrolling page, not a slideshow. An earlier draft was a nine-step
// walkthrough; it separated things that only make sense together — the
// sentence and the grid it produces, the raw scores and their softmax — and
// it pushed the quadratic-cost payoff behind eight clicks. Everything here is
// visible at once and everything reacts:
//
//   1. The sentence and the n x n grid it produces, in one figure. The grid's
//      edges carry the computation that feeds it, laid out like the layers of
//      the convolutional example: across the top each word's E is pushed
//      through W_K to give its key; down the side the same E's are pushed
//      through W_Q to give the queries. Hovering a cell lights its lineage.
//   2. A softmax toggle on the grid itself, so "raw dot products" and "weights
//      that sum to 1" are two states of one figure rather than two steps.
//   3. The value, directly after the grid, in the grid's own visual grammar:
//      word → E → × W_V → V, then × weight, then the lines of a weighted sum
//      converging on the output. Zero one value and the output moves while
//      the weights do not.
//   4. The cost, at the bottom, where the grid above has already made "every
//      cell is a dot product" concrete.
//
// Masking is deliberately absent: it needs the generation story to make sense,
// and this page is about the mechanism. Training is its own example.
//
// Every number comes from ./head.json via ./attention.ts. See ./README.md for
// what is real (the embeddings, the arithmetic) and what was designed (the
// behaviour the head was fitted to produce).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "./attention.css";
import {
  cosine,
  dot,
  loadHead,
  runAttention,
  type AttentionRun,
  type Head,
  type RawHead,
} from "./attention.js";
import { AttentionGrid, type HoveredVector } from "./AttentionGrid.js";
import { CostPanel } from "./CostPanel.js";
import { MatrixMultiply } from "./MatrixMultiply.js";
import { MovementPlot } from "./MovementPlot.js";
import { PositionPanel } from "./PositionPanel.js";
import { ValueLane } from "./ValueLane.js";
import { VectorChip } from "./VectorChip.js";

const HEAD_URL = "/examples/attention/head.json";

export function AttentionPage() {
  const [head, setHead] = useState<Head | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ i: number; j: number } | null>(
    null,
  );
  const [hoveredVector, setHoveredVector] = useState<HoveredVector | null>(
    null,
  );
  // Defaults to raw scores: the grid should first read as "one dot product
  // per pair", and softmax should be something the student turns ON and sees
  // change, rather than a transformation that already happened.
  const [softmaxOn, setSoftmaxOn] = useState(false);
  const [zeroedValue, setZeroedValue] = useState<number | null>(null);
  const [costTokens, setCostTokens] = useState(8);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(HEAD_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`head ${r.status}`);
        return r.json();
      })
      .then((raw: RawHead) => setHead(loadHead(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const tokens = useMemo(
    () => (head ? head.sentences[sentenceIndex]!.split(" ") : []),
    [head, sentenceIndex],
  );

  const run = useMemo(
    () => (head ? runAttention(head, tokens, false) : null),
    [head, tokens],
  );

  // The noun the fitted head was built to demonstrate — index 3 in every
  // shipped sentence. Used as the default focus so the page opens on the row
  // that shows the behaviour.
  const featuredRow = 3;

  const selectedRow = activeRow ?? featuredRow;

  // The output recomputed with one token's value vector zeroed. Shows that
  // killing V changes the output while leaving the attention pattern intact.
  const outWithZeroed = useMemo(() => {
    if (!run || zeroedValue === null) return null;
    const vDim = run.V[0]?.length ?? 0;
    return run.weights.map((row) => {
      const o = new Float32Array(vDim);
      for (let j = 0; j < row.length; j++) {
        if (j === zeroedValue) continue;
        const w = row[j]!;
        const v = run.V[j]!;
        for (let d = 0; d < vDim; d++) o[d]! += w * v[d]!;
      }
      return o;
    });
  }, [run, zeroedValue]);

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link
            to="/examples"
            className="app-lockup-link"
            aria-label="Examples"
          >
            <Wordmark size="sm" />
          </Link>
          <span className="mnist-crumb">Examples</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="mnist-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Attention</h1>
            <p className="mnist-lede">
              Attention is the key to a transformer layer, and thereby key to
              large language models and most cutting-edge neural networks. It
              solves the problems of learning the relationships between inputs,
              in this case words.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">
              Couldn't load the attention head ({loadError}).
            </p>
          )}

          {!head && !loadError && (
            <div className="mnist-loading">Loading attention head…</div>
          )}

          {head && run && (
            <>
              {/* ── The sentence and the grid it produces, in one view ── */}
              <Card className="at-main" padding="md">
                <div className="at-main__head">
                  <div>
                    <h2 className="at-h2">The attention matrix</h2>
                    <p className="at-sub">
                      In the case of words, attention computes how much each
                      word relates to and affects each other word. The input
                      sentence runs along the top and down the side. Each word
                      is <Link to="/examples/word2vec">embedded</Link>{" "}
                      individually (to a vector of length {head.eDim} we call
                      E). The same vector is used any time the word is found.
                      <br />
                      <br />
                      Attention depends on converting our input vectors E into
                      two different versions, the <b>key</b> and the{" "}
                      <b>query</b>. You can think of the query as the question
                      "what am I looking for?". The key is the name tag or "what
                      do I say I am?" The important differentiator between the
                      two is that the keys compete against each other to answer
                      the query (via <Link to="/examples/softmax">softmax</Link>
                      ).
                      <br />
                      <br />
                      In detail, the embedding vector is multiplied by the
                      learned key matrix (W<sub>K</sub>) to become a key vector,
                      represented along the top. The same vector is multiplied
                      by the learned query matrix (W
                      <sub>Q</sub>) to become a query vector, represented along
                      the side. Each entry in the matrix is the dot product of
                      the two vectors with a softmax across the rows when
                      showing weights.
                    </p>
                    {/* <p className="at-figurenote">
                      Rows ask, columns answer. Hover any strip to see its
                      numbers.
                    </p> */}
                  </div>
                  <div className="at-sentences">
                    {head.sentences.map((s, i) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={i === sentenceIndex ? "primary" : "subtle"}
                        onClick={() => {
                          setSentenceIndex(i);
                          setActiveRow(null);
                          setActiveCell(null);
                          setHoveredVector(null);
                          setZeroedValue(null);
                        }}
                      >
                        {s.split(" ").slice(1, 3).join(" ")}…
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="at-gridwrap">
                  <div className="at-gridbar">
                    <div className="at-pipeline">
                      <span
                        className={`at-pipeline__item${!softmaxOn ? " at-pipeline__item--on" : ""}`}
                      >
                        Q · K
                      </span>
                      <span className="at-pipeline__arrow">→</span>
                      <span
                        className={`at-pipeline__item${softmaxOn ? " at-pipeline__item--on" : ""}`}
                      >
                        ÷ √d, then softmax
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={softmaxOn ? "primary" : "subtle"}
                      onClick={() => setSoftmaxOn((v) => !v)}
                    >
                      {softmaxOn ? "Showing weights" : "Showing raw scores"}
                    </Button>
                  </div>

                  <AttentionGrid
                    head={head}
                    run={run}
                    stage={softmaxOn ? "weights" : "scores"}
                    activeRow={activeRow}
                    activeCell={activeCell}
                    hoveredVector={hoveredVector}
                    onHoverCell={setActiveCell}
                    onHoverVector={setHoveredVector}
                    onSelectRow={(i) => setActiveRow(i)}
                    masked={false}
                  />

                  <p className="at-gridnote">
                    {softmaxOn ? (
                      <>
                        The soft max function normalizes each row to a
                        probability, such that they sum to 1. Look at the{" "}
                        <b>{run.tokens[featuredRow]}</b> row: the emphasis is on
                        its two adjectives. That behavior was learned by the
                        neural network.
                      </>
                    ) : (
                      <>
                        These are the combinations of the query and key vectors
                        (in the form of dot products). The values can be
                        negative. Toggle "showing raw scores" to see them
                        normalized.
                      </>
                    )}
                  </p>
                </div>
              </Card>

              {/* ── The value: what actually gets passed along ── */}
              <ValuesPanel
                head={head}
                run={run}
                row={selectedRow}
                zeroed={zeroedValue}
                onZero={setZeroedValue}
                outZeroed={outWithZeroed}
                onSelectRow={(i) => setActiveRow(i)}
              />

              {/* ── What attention did to this word ── */}
              <Card className="at-panel" padding="md">
                <h2 className="at-h2">How this word changed</h2>
                <p className="at-sub">
                  Attention moves each query word (in this case{" "}
                  {run.tokens[selectedRow]}) towards the matching key words from
                  the matrix. Exactly how is shown below. The amount it moves is
                  associated with the matrix weights. You can see an arrow from
                  where the word meaning started to where it was adjusted by
                  attention. It's easiest to see as a noun takes on the meanings
                  of neighboring adjectives.
                </p>
                {/* The same choice as clicking a word on the grid, repeated
                    here so nobody has to scroll up to change it. */}
                <div
                  className="at-wordpick"
                  role="group"
                  aria-label="Choose the word to follow"
                >
                  {run.tokens.map((t, i) => (
                    <Button
                      key={`${t}-${i}`}
                      size="sm"
                      variant={selectedRow === i ? "primary" : "subtle"}
                      onClick={() => setActiveRow(i)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
                <MovementPlot
                  run={run}
                  row={selectedRow}
                  outOverride={outWithZeroed?.[selectedRow] ?? null}
                />
              </Card>

              <QKVPanel head={head} run={run} row={selectedRow} />

              {/* ── The cost ── */}
              <CostPanel n={costTokens} onChange={setCostTokens} />

              {/* ── Now, transformers ── */}
              <Card className="at-panel" padding="md">
                <h2 className="at-h2">One additional detail: word positions</h2>
                <p className="at-sub">
                  So far, our attention model does not represent the relative
                  positions of the words. With very long text, that would be
                  problematic. In the examples above, we have ignored position
                  because they're so short. In practice, we actually label the
                  embedding of each word with an abstract representation of its
                  position.
                </p>
                <PositionPanel run={run} row={selectedRow} />
                <p className="at-panel__note">
                  The head on this page was fitted without positions, so this
                  shows the input it <i>would</i> receive rather than a re-run.
                  Real encodings use more hands, turning far more slowly, so
                  they can count to thousands of words; the newest models turn
                  the hands inside the attention step instead of adding them
                  to the word. The idea is the same.
                </p>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Where Q, K and V come from — the step students most often recite without
 *  understanding. The point being made is that the three MATRICES are the
 *  learned parameters and the three VECTORS are not. */
function QKVPanel({
  head,
  run,
  row,
}: {
  head: Head;
  run: AttentionRun;
  row: number;
}) {
  const [keyIdx, setKeyIdx] = useState(1);
  const [proj, setProj] = useState<"Q" | "K" | "V">("Q");
  const i = Math.min(row, run.tokens.length - 1);
  const j = Math.min(keyIdx, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const q = run.Q[i]!;
  const k = run.K[j]!;
  const terms = Array.from(q, (v, d) => v * k[d]!);
  const total = dot(q, k);
  const paramCount = head.qkDim * head.eDim * 2 + head.vDim * head.eDim;

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">Where do Q, K, and V come from?</h2>
      <p className="at-sub">
        The core to attention is three matrices which are{" "}
        <Link to="/examples/training">learned by the neural network</Link>. Each
        matrix begins as a set of random numbers. These are updated via
        "backpropagation", the learning method for neural networks, which is
        used to incrementally update the matrices during training. <br />
        <br />
        Here we show how each of the matrices are used with attention. The
        embedding mechanism, W<sub>E</sub>, is learned upstream. W<sub>Q</sub>,
        W<sub>K</sub>, and W<sub>V</sub> are learned as a part of the attention
        mechanism. These learned values are simply multiplied together to get
        the vectors that represent a word's meaning.
      </p>

      <div className="at-mmtabs">
        {(["Q", "K", "V"] as const).map((which) => (
          <Button
            key={which}
            size="sm"
            variant={proj === which ? "primary" : "subtle"}
            onClick={() => setProj(which)}
          >
            W<sub>{which}</sub> · E → {which}
          </Button>
        ))}
      </div>

      <MatrixMultiply
        E={run.E[i]!}
        W={proj === "Q" ? head.Wq : proj === "K" ? head.Wk : head.Wv}
        rows={proj === "V" ? head.vDim : head.qkDim}
        cols={head.eDim}
        out={proj === "Q" ? run.Q[i]! : proj === "K" ? run.K[i]! : run.V[i]!}
        symbol={proj}
        token={word}
        question={
          proj === "Q"
            ? "The query asks: what am I looking for?"
            : proj === "K"
              ? "The key answers: what do I offer?"
              : "The value carries: what do I pass on?"
        }
      />
    </Card>
  );
}

/** The value: the third matrix, and the weighted sum it feeds. Sits directly
 *  after the grid because the grid only answers "how much"; this answers
 *  "of what". The zero-it-out demonstration lives here: the output moves,
 *  the weight cells do not. */
function ValuesPanel({
  head,
  run,
  row,
  zeroed,
  onZero,
  outZeroed,
  onSelectRow,
}: {
  head: Head;
  run: AttentionRun;
  row: number;
  zeroed: number | null;
  onZero: (i: number | null) => void;
  outZeroed: Float32Array[] | null;
  onSelectRow: (i: number) => void;
}) {
  const [hovered, setHovered] = useState<HoveredVector | null>(null);
  const i = Math.min(row, run.tokens.length - 1);
  const word = run.tokens[i]!;
  const weights = run.weights[i]!;
  const baseline = run.out[i]!;
  const modified = outZeroed?.[i] ?? null;
  const drift = modified ? cosine(baseline, modified) : 1;

  // The two words that carry most of the weight, for the prose.
  const top = weights
    .map((w, j) => ({ w, j }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 2);
  const topShare = top.reduce((acc, t) => acc + t.w, 0);

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">The value: attention's output</h2>
      <p className="at-sub">
        The key-query matrix determines <i>how much</i> one word should affect
        another. But, <i>what</i> does it mean to "affect"? The learned value
        matrix (W<sub>V</sub>) is that answer.
        <br />
        <br />
        The same embedding vector E that became a key and a query now becomes a
        value. Each value vector is adjusted by the weight to become an additive
        change for the query word.
      </p>

      <ValueLane
        head={head}
        run={run}
        row={i}
        zeroed={zeroed}
        outOverride={modified}
        hovered={hovered}
        onHover={setHovered}
        onZero={onZero}
        onSelectRow={onSelectRow}
      />

      <p
        className={`at-panel__note${zeroed !== null ? " at-panel__note--alert" : ""}`}
      >
        {zeroed !== null ? (
          <>
            With <b>{run.tokens[zeroed]}</b>'s value zeroed out,{" "}
            {Math.abs(1 - drift) < 0.01
              ? "the output is unchanged."
              : "the output shifted."}
          </>
        ) : (
          <>Click a vector to zero it out.</>
        )}
      </p>
    </Card>
  );
}

/** The hovered strip, spelled out: every number in the vector, and where the
 *  vector came from. Replaces the hover popover the E chips used to carry now
 *  that the vectors live on the grid's edges. */
function VectorDetail({
  run,
  hovered,
  out,
}: {
  run: AttentionRun;
  hovered: HoveredVector;
  /** The output with a value zeroed, when one is; shown in place of run.out. */
  out?: Float32Array | null;
}) {
  const { kind, index } = hovered;
  const word = run.tokens[index]!;
  const vector =
    kind === "E"
      ? run.E[index]!
      : kind === "Q"
        ? run.Q[index]!
        : kind === "K"
          ? run.K[index]!
          : kind === "V"
            ? run.V[index]!
            : (out ?? run.out[index]!);

  return (
    <div className="at-cell-detail">
      <div className="at-cell-detail__head">
        <span className="at-vec__sym">
          {kind}
          <sub>{word}</sub>
        </span>
        {kind === "E" ? (
          <>
            {" "}
            — the embedding for <b>{word}</b>: {vector.length} numbers, looked
            up from a table, identical in every sentence this word appears in.
          </>
        ) : kind === "Q" ? (
          <>
            {" "}
            = W<sub>Q</sub> · E<sub>{word}</sub> — the query for <b>{word}</b>:{" "}
            {vector.length} numbers saying what it is looking for.
          </>
        ) : kind === "K" ? (
          <>
            {" "}
            = W<sub>K</sub> · E<sub>{word}</sub> — the key for <b>{word}</b>:{" "}
            {vector.length} numbers saying what it offers.
          </>
        ) : kind === "V" ? (
          <>
            {" "}
            = W<sub>V</sub> · E<sub>{word}</sub> — the value for <b>{word}</b>:{" "}
            {vector.length} numbers it hands over once picked.
          </>
        ) : (
          <>
            {" "}
            = Σ weight × V — the head's output for <b>{word}</b>:{" "}
            {vector.length} numbers, what it becomes after reading its context.
          </>
        )}
      </div>
      <div className="at-chip__nums">
        {Array.from(vector, (v, d) => (
          <span key={d} className="at-chip__num">
            {v >= 0 ? "+" : "−"}
            {Math.abs(v).toFixed(2)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The hovered cell, explained. */
function CellDetail({
  run,
  cell,
  showWeight,
}: {
  run: AttentionRun;
  cell: { i: number; j: number };
  showWeight: boolean;
}) {
  const { i, j } = cell;
  const qWord = run.tokens[i]!;
  const kWord = run.tokens[j]!;
  const raw = run.scores[i]![j]!;
  const scaled = run.scaled[i]![j]!;
  const weight = run.weights[i]![j]!;

  return (
    <div className="at-cell-detail">
      <div className="at-cell-detail__head">
        <b>{qWord}</b> asks about <b>{kWord}</b>
      </div>
      <div className="at-cell-detail__row">
        <VectorChip
          symbol="Q"
          subscript={qWord}
          vector={run.Q[i]!}
          numericCount={6}
        />
        <span className="at-cell-detail__op">·</span>
        <VectorChip
          symbol="K"
          subscript={kWord}
          vector={run.K[j]!}
          numericCount={6}
        />
      </div>
      <dl className="at-cell-detail__stats">
        <div>
          <dt>dot product</dt>
          <dd>{raw.toFixed(2)}</dd>
        </div>
        <div>
          <dt>÷ √d</dt>
          <dd>{scaled.toFixed(2)}</dd>
        </div>
        <div>
          <dt>after softmax</dt>
          <dd className={showWeight ? "at-cell-detail__hi" : undefined}>
            {(weight * 100).toFixed(1)}%
          </dd>
        </div>
      </dl>
    </div>
  );
}

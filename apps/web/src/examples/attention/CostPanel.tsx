// Why attention gets expensive — the point of the whole page, made felt
// rather than stated.
//
// The old version of this panel showed a slider and two counters, one linear
// and one quadratic. That is the fact, but nobody feels a number getting
// bigger. This version makes the same point in three beats, none of which
// needs the reader to know what a matrix is:
//
//   1. The handshake. Words on a circle, every pair joined by a line, and a
//      button that adds one word. The new word's lines draw in red: it has to
//      read every word already there, and every one of them has to read it.
//      The unit of intuition becomes "what one more word costs", which is the
//      thing n² never conveys as a formula.
//   2. The speck. Pick a real text — a message, this page, a novel — and see
//      its grid with the 8 × 8 grid from the top of the page drawn inside it
//      at true relative scale. The grid the student has been studying shrinks
//      to a fleck, then to less than a pixel.
//   3. Feel it. The browser really performs the computations for the chosen
//      size, with a stopwatch. Two thousand words is a blink; twenty thousand
//      visibly slows down. A novel is not run: its time is extrapolated from
//      what was just measured, and the caption says so.
//
// Vocabulary: every cell of the grid is "one computation: one word reading
// another". The words "dot product" do not appear in this file on purpose.
// They are the right name and the wrong door — a reader who does not know
// them should still be able to walk through this panel.

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "../../components/index.js";

interface Props {
  /** How many words are on the handshake circle. */
  n: number;
  onChange: (n: number) => void;
}

/** Real texts to compare against. Token counts are round numbers; the
 *  captions call them words, which is close enough for the point. */
const TEXTS = [
  { label: "this sentence", n: 8 },
  { label: "a text message", n: 30 },
  { label: "this web page", n: 2_000 },
  { label: "a long chat", n: 20_000 },
  { label: "a novel", n: 100_000 },
] as const;

/** Largest size the browser is asked to actually compute. Above this the
 *  time is extrapolated from a measured run. */
const MAX_LIVE = 20_000;
const DIM = 8; // components per word in the live computation, as in the head
const MIN_WORDS = 2;
const MAX_WORDS = 40;
const BASE_WORDS = 8;

export function CostPanel({ n, onChange }: Props) {
  const [textIdx, setTextIdx] = useState(2);
  const text = TEXTS[textIdx]!;

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">Attention is the limiting factor</h2>
      <p className="at-sub">
        The fundamental limitation to LLMs is the size of the context window.
        Because every word must be compared with every other word, the memory
        required scales with the length of the context window squared (O(n
        <sup>2</sup>)).
      </p>

      <Handshake n={n} onChange={onChange} />
      <Speck textIdx={textIdx} onPick={setTextIdx} />
      <Stopwatch text={text} />
    </Card>
  );
}

/* ── 1. The handshake ─────────────────────────────────────────────── */

const CIRCLE = 300;
const RADIUS = 122;

function Handshake({ n, onChange }: Props) {
  const cx = CIRCLE / 2;
  const cy = CIRCLE / 2;
  const pos = (k: number) => {
    const a = (k / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + RADIUS * Math.cos(a), y: cy + RADIUS * Math.sin(a) };
  };
  const points = Array.from({ length: n }, (_, k) => pos(k));
  // The most recently added word is the story; it is "new" whenever the
  // student has grown the circle past the sentence.
  const newest = n > BASE_WORDS ? n - 1 : -1;
  const total = n * n;
  const nextCost = 2 * n + 1;

  return (
    <section className="at-cost__beat at-cost__beat--first">
      <div className="at-cost__beathead">
        <span className="at-cost__step">1</span>
        <h3 className="at-cost__h3">Every word is compared to every word</h3>
      </div>

      <div className="at-cost__hand">
        <svg
          className="at-cost__circle"
          viewBox={`0 0 ${CIRCLE} ${CIRCLE}`}
          role="img"
          aria-label={`${n} words arranged in a circle, every pair joined by a line; ${total} computations in all`}
        >
          {points.map((p, a) =>
            points.slice(a + 1).map((q, off) => {
              const b = a + off + 1;
              const isNew = a === newest || b === newest;
              return (
                <line
                  key={`${a}-${b}`}
                  className={`at-cost__edge${isNew ? " at-cost__edge--new" : ""}`}
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                />
              );
            }),
          )}
          {points.map((p, k) => (
            <g key={`n-${k}`}>
              <circle
                className={`at-cost__node${k === newest ? " at-cost__node--new" : ""}`}
                cx={p.x}
                cy={p.y}
                r={k === newest ? 6 : 4.5}
              />
              {n <= 16 && (
                <text
                  className="at-cost__nodelabel"
                  x={
                    cx +
                    (RADIUS + 14) *
                      Math.cos((k / n) * Math.PI * 2 - Math.PI / 2)
                  }
                  y={
                    cy +
                    (RADIUS + 14) *
                      Math.sin((k / n) * Math.PI * 2 - Math.PI / 2)
                  }
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {k + 1}
                </text>
              )}
            </g>
          ))}
        </svg>

        <div className="at-cost__handside">
          <div className="at-cost__count">
            <div className="at-cost__counter">
              <span className="at-cost__label">words</span>
              <span className="at-cost__value">{n}</span>
            </div>
            <div className="at-cost__counter at-cost__counter--hot">
              <span className="at-cost__label">computations</span>
              <span className="at-cost__value">{total.toLocaleString()}</span>
              <span className="at-cost__growth">
                {n} × {n}
              </span>
            </div>
            <div className="at-cost__counter">
              <span className="at-cost__label">next word adds</span>
              <span className="at-cost__value">+{nextCost}</span>
              <span className="at-cost__growth">
                the following, +{nextCost + 2}
              </span>
            </div>
          </div>

          <div className="at-cost__buttons">
            <Button
              size="sm"
              variant="primary"
              disabled={n >= MAX_WORDS}
              onClick={() => onChange(Math.min(MAX_WORDS, n + 1))}
            >
              Add a word
            </Button>
            <Button
              size="sm"
              variant="subtle"
              disabled={n <= MIN_WORDS}
              onClick={() => onChange(Math.max(MIN_WORDS, n - 1))}
            >
              Remove a word
            </Button>
            <Button
              size="sm"
              variant="subtle"
              disabled={n === BASE_WORDS}
              onClick={() => onChange(BASE_WORDS)}
            >
              Back to {BASE_WORDS}
            </Button>
          </div>

          <p className="at-cost__p">
            Each cell of the matrix at the top of the page is one comparison
            between words. The lines here represent these comparisons. Each
            added word must be compared to all of the previous and itself, and
            the total grows as <b>words × words</b>.
            {n >= MAX_WORDS && (
              <>
                {" "}
                At {MAX_WORDS} words, less than many sentences, the lines are
                already imperceptible.
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 2. The speck ─────────────────────────────────────────────────── */

const SQ = 300;
const SQ_PAD = 10;

function Speck({
  textIdx,
  onPick,
}: {
  textIdx: number;
  onPick: (i: number) => void;
}) {
  const text = TEXTS[textIdx]!;
  // True relative scale of the 8-word grid inside this text's grid.
  const scale = BASE_WORDS / text.n;
  const smallSide = SQ * scale;
  const tiny = smallSide < 6;

  return (
    <section className="at-cost__beat">
      <div className="at-cost__beathead">
        <span className="at-cost__step">2</span>
        <h3 className="at-cost__h3">The matrix at the top is a speck</h3>
      </div>

      <div className="at-cost__presets" role="group" aria-label="Pick a text">
        {TEXTS.map((t, i) => (
          <Button
            key={t.label}
            size="sm"
            variant={i === textIdx ? "primary" : "subtle"}
            onClick={() => onPick(i)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="at-cost__speck">
        <svg
          className="at-cost__speckfig"
          viewBox={`0 0 ${SQ + SQ_PAD * 2} ${SQ + SQ_PAD * 2}`}
          role="img"
          aria-label={`The ${text.n.toLocaleString()} by ${text.n.toLocaleString()} grid for ${text.label}, with the 8 by 8 grid from the top of the page drawn inside it at true scale`}
        >
          <rect
            className="at-cost__bigsq"
            x={SQ_PAD}
            y={SQ_PAD}
            width={SQ}
            height={SQ}
          />
          {/* Grid lines only while there are few enough to see. */}
          {text.n <= 64 &&
            Array.from({ length: text.n - 1 }, (_, k) => {
              const d = SQ_PAD + ((k + 1) * SQ) / text.n;
              return (
                <g key={k}>
                  <line
                    className="at-cost__gridline"
                    x1={d}
                    y1={SQ_PAD}
                    x2={d}
                    y2={SQ_PAD + SQ}
                  />
                  <line
                    className="at-cost__gridline"
                    x1={SQ_PAD}
                    y1={d}
                    x2={SQ_PAD + SQ}
                    y2={d}
                  />
                </g>
              );
            })}

          {/* The 8 x 8 grid, drawn full size and scaled down by CSS so the
              zoom animates between texts. */}
          <g transform={`translate(${SQ_PAD}, ${SQ_PAD})`}>
            <g
              className="at-cost__small"
              style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}
            >
              {Array.from({ length: BASE_WORDS }, (_, r) =>
                Array.from({ length: BASE_WORDS }, (_, c) => (
                  <rect
                    key={`${r}-${c}`}
                    className="at-cost__smallcell"
                    x={(c * SQ) / BASE_WORDS + 2}
                    y={(r * SQ) / BASE_WORDS + 2}
                    width={SQ / BASE_WORDS - 4}
                    height={SQ / BASE_WORDS - 4}
                    rx={3}
                  />
                )),
              )}
            </g>
          </g>

          {tiny && (
            <g className="at-cost__pointer">
              <line
                x1={SQ_PAD + 70}
                y1={SQ_PAD + 70}
                x2={SQ_PAD + 4}
                y2={SQ_PAD + 4}
              />
              <circle cx={SQ_PAD + 2} cy={SQ_PAD + 2} r={4} />
              <text
                x={SQ_PAD + 76}
                y={SQ_PAD + 80}
                className="at-cost__pointerlabel"
              >
                your 8-word grid
              </text>
              <text
                x={SQ_PAD + 76}
                y={SQ_PAD + 93}
                className="at-cost__pointerlabel at-cost__pointerlabel--sub"
              >
                {smallSide < 1.5
                  ? "smaller than one pixel"
                  : `about ${smallSide.toFixed(0)} pixels wide`}
              </text>
            </g>
          )}
        </svg>

        <div className="at-cost__speckside">
          <div className="at-cost__count">
            <div className="at-cost__counter">
              <span className="at-cost__label">{text.label}</span>
              <span className="at-cost__value">{text.n.toLocaleString()}</span>
              <span className="at-cost__growth">words</span>
            </div>
            <div className="at-cost__counter at-cost__counter--hot">
              <span className="at-cost__label">computations</span>
              <span className="at-cost__value">
                {(text.n * text.n).toLocaleString()}
              </span>
              <span className="at-cost__growth">
                {text.n.toLocaleString()} × {text.n.toLocaleString()}
              </span>
            </div>
          </div>
          <p className="at-cost__p">
            The whole square is the matrix for <b>{text.label}</b>. The red
            cells at the top-left corner are the 8 x 8 matrix from the top of
            this page at the appropriate scale.{" "}
            {text.n === BASE_WORDS
              ? "For this sentence the two are the same matrix."
              : text.n <= 64
                ? "The original matrix is a tiny fraction of a huge number of comparisons."
                : tiny
                  ? "The original matrix is imperceptible. This shows how complex modern LLMs are."
                  : "It is a tiny fraction of this huge matrix."}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── 3. Feel it ───────────────────────────────────────────────────── */

interface Run {
  n: number;
  ms: number;
}

function Stopwatch({ text }: { text: (typeof TEXTS)[number] }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0); // rows done
  const [elapsed, setElapsed] = useState(0); // ms, live while running
  const [last, setLast] = useState<Run | null>(null);
  const [best, setBest] = useState<Run | null>(null); // largest completed run
  const cancel = useRef<{ stop: boolean }>({ stop: false });
  const sink = useRef(0);

  useEffect(() => () => void (cancel.current.stop = true), []);

  const canRun = text.n <= MAX_LIVE;

  const start = () => {
    cancel.current.stop = true;
    const token = { stop: false };
    cancel.current = token;
    const N = text.n;
    // Random vectors, DIM components each, like the head's keys and queries.
    const vecs = new Float32Array(N * DIM);
    for (let i = 0; i < vecs.length; i++) vecs[i] = Math.random() * 2 - 1;
    setRunning(true);
    setProgress(0);
    setElapsed(0);
    setLast(null);

    // About two million computations per chunk keeps the bar moving. Each
    // chunk waits for a paint frame before starting, so the bar actually
    // draws; only the time spent inside the chunks is counted, so those
    // pauses do not inflate the reading.
    const rowsPerChunk = Math.max(1, Math.floor(2_000_000 / N));
    let busy = 0;
    let row = 0;

    const step = () => {
      if (token.stop) return;
      const t0 = performance.now();
      const end = Math.min(N, row + rowsPerChunk);
      let acc = 0;
      for (let i = row; i < end; i++) {
        const oi = i * DIM;
        for (let j = 0; j < N; j++) {
          const oj = j * DIM;
          let s = 0;
          for (let d = 0; d < DIM; d++) s += vecs[oi + d]! * vecs[oj + d]!;
          acc += s;
        }
      }
      sink.current += acc;
      row = end;
      busy += performance.now() - t0;
      setProgress(row);
      setElapsed(busy);
      if (row < N) {
        requestAnimationFrame(() => setTimeout(step, 0));
      } else {
        const ms = busy;
        const run = { n: N, ms };
        setRunning(false);
        setLast(run);
        // Latest run at the largest size wins, so a re-run replaces its
        // predecessor instead of being ignored.
        setBest((b) => (b === null || N >= b.n ? run : b));
      }
    };
    requestAnimationFrame(() => setTimeout(step, 0));
  };

  // Computations per millisecond from the largest run so far, for the
  // extrapolation. A small run is dominated by overhead, so prefer the big one.
  const rate = best ? (best.n * best.n) / Math.max(best.ms, 1) : null;
  const novel = TEXTS[TEXTS.length - 1]!;
  const novelMs = rate ? (novel.n * novel.n) / rate : null;

  const pct = text.n > 0 ? Math.round((progress / text.n) * 100) : 0;

  return (
    <section className="at-cost__beat">
      <div className="at-cost__beathead">
        <span className="at-cost__step">3</span>
        <h3 className="at-cost__h3">Intuition</h3>
      </div>

      <p className="at-cost__p">
        We can perform these computations in your browser to give you an
        intuitive understanding of how inefficiently this scales. Remember that
        large LLMs are using massive GPUs to perform these computations quickly.
        Click to perform <b>{(text.n * text.n).toLocaleString()}</b>{" "}
        computations for <b>{text.label}</b>.
      </p>

      <div className="at-cost__clockrow">
        <Button
          size="sm"
          variant="primary"
          disabled={running || !canRun}
          onClick={start}
        >
          {canRun
            ? `Compute ${text.n.toLocaleString()} × ${text.n.toLocaleString()}`
            : `Too big to run here`}
        </Button>
        <div className="at-cost__clock">
          <span className="at-cost__time">
            {fmt(running ? elapsed : (last?.ms ?? 0))}
          </span>
          <span className="at-cost__timelabel">
            {running
              ? `${pct}% — row ${progress.toLocaleString()} of ${text.n.toLocaleString()}`
              : last
                ? `for ${last.n.toLocaleString()} words, on this machine`
                : "on this machine"}
          </span>
        </div>
      </div>
      <div className="at-cost__bar" aria-hidden="true">
        <div
          className="at-cost__fill"
          style={{ width: `${running ? pct : last ? 100 : 0}%` }}
        />
      </div>

      <p className="at-cost__p at-cost__p--muted">
        {!canRun && rate === null && (
          <>
            A novel is {(novel.n * novel.n).toLocaleString()} computations — too
            many to run in a web page. Run one of the smaller texts first and
            this page will estimate the novel from what it measures.
          </>
        )}
        {!canRun && novelMs !== null && (
          <>
            From the run you just did, <b>{novel.label}</b> would take about{" "}
            <b>{fmt(novelMs)}</b> on this machine — for <b>one</b> attention
            head of <b>one</b> layer. A real model has dozens of layers with
            dozens of heads each, and does all of this again for every word it
            writes.
          </>
        )}
        {canRun && last && (
          <>
            {last.n <= 100
              ? "Impossibly tiny examples are fast. System prompts can run in the thousands of words."
              : "This is still fast, but ten times the words is one hundred times the computations."}
            {novelMs !== null && (
              <>
                {" "}
                At this rate, <b>{novel.label}</b> would take roughly{" "}
                <b>{fmt(novelMs)}</b>.
              </>
            )}
          </>
        )}
        {canRun && !last && !running && <></>}
      </p>
    </section>
  );
}

function fmt(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 90) return `${s.toFixed(s < 10 ? 1 : 0)} s`;
  const m = s / 60;
  if (m < 90) return `${m.toFixed(m < 10 ? 1 : 0)} min`;
  const h = m / 60;
  return `${h.toFixed(h < 10 ? 1 : 0)} h`;
}

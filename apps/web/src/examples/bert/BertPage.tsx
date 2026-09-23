// The BERT example (/examples/bert).
//
// Short by design. The transformers example built the block; the word
// embeddings example built the idea of a word as a vector. BERT is what you
// get when you stack the first and point it at the second: a word no longer
// has ONE vector, it has one per sentence it appears in. This page shows that
// happening on the same tiny block, then says how such a model is trained
// (fill in the blank, from both sides) and how it is used afterwards (a small
// task-specific layer on top). Nothing here re-explains attention, heads,
// residuals or the memory; it links to them.
//
// The arc, panel by panel:
//
//   0. Where the first vector comes from — pieces, not words, and three
//      tables added (token + position + segment).
//   1. One vector per word, or one per use? The same word through the block
//      in four sentences.
//   2. Before BERT: ELMo, a recurrent network reading both ways.
//   3. How it learns — fill in the blank, which is CBOW's direction, not
//      skip-gram's, and why that is the direction that yields a per-use vector.
//   4. Then reuse it.
//
// Every strip is computed live from the transformers example's heads.json.
// The difference one block makes to a repeated word is small — a few percent
// — and the page says so: BERT stacks twelve or twenty-four of these and the
// differences compound. Masked-word prediction is drawn, not faked: this
// block was never trained to fill blanks, so no guesses are shown. ELMo is a
// schematic; there is no trained ELMo here.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import "../attention/attention.css";
import "../transformers/transformers.css";
import "./bert.css";
import {
  cosine,
  fetchModel,
  runBlock,
  type BlockRun,
  type Model,
  type RawHeads,
} from "../transformers/transformer.js";
import { Strip, maxAbs } from "../transformers/draw.js";
import "../rnn/rnn.css";
import { ElmoFigure } from "./ElmoFigure.js";
import { EmbeddingIntro } from "./EmbeddingIntro.js";
import { ObjectiveFigure } from "./ObjectiveFigure.js";


export function BertPage() {
  const [model, setModel] = useState<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchModel(ctrl.signal)
      .then(setModel)
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const runs = useMemo(
    () => (model ? model.sentences.map((s) => runBlock(model, s.split(" "))) : []),
    [model],
  );

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/examples" className="app-lockup-link" aria-label="Examples">
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
            <h1>BERT</h1>
            <p className="mnist-lede">
              Take the block from the{" "}
              <Link to="/examples/transformers">transformers</Link> example,
              stack twelve of them, and train the stack on one job: fill in a
              missing word using the words on both sides. What comes out
              changes what a <Link to="/examples/word2vec">word embedding</Link>{" "}
              is. A word no longer has one vector. It has one for every
              sentence it appears in. BERT was not the first to do this — ELMo,
              earlier the same year, did it with a{" "}
              <Link to="/examples/rnn">recurrent network</Link> — but it is the
              one that stuck, and this page ends by saying why.
            </p>
          </div>

          {loadError && <p className="mnist-error">Couldn't load the heads ({loadError}).</p>}
          {!model && !loadError && <div className="mnist-loading">Loading…</div>}

          {model && runs.length > 0 && (
            <>
              <Card className="at-panel" padding="md">
                <h2 className="at-h2">Where the first vector comes from</h2>
                <p className="at-sub">
                  The transformers example started from word vectors it was
                  handed. BERT has to make its own, and the input to block 1 is
                  built in two moves: the text is cut into <b>pieces</b>, and
                  each piece's vector is the sum of <b>three lookups</b> — what
                  it is, where it sits, and which sentence it belongs to.
                </p>
                <EmbeddingIntro model={model} />
              </Card>
              <ContextPanel model={model} runs={runs} />
              <ElmoPanel model={model} />
              <MaskPanel model={model} />
              <ReusePanel />
            </>
          )}

          <footer className="mnist-foot">
            <p>
              The block here is the transformers example's, run live on its
              four sentences. It was fitted for legibility, not trained on
              text, so the contextual differences it produces are small and
              real; a trained BERT's are large. No fill-in-the-blank guesses
              are shown because this block was never trained to make them.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ── 1. One vector per word, or one per use? ──────────────────────── */

function ContextPanel({ model, runs }: { model: Model; runs: BlockRun[] }) {
  // Words that appear in more than one sentence: the only ones that can show
  // the effect.
  const shared = useMemo(() => {
    const seen = new Map<string, number[]>();
    model.sentences.forEach((s, si) => {
      for (const w of new Set(s.split(" "))) {
        seen.set(w, [...(seen.get(w) ?? []), si]);
      }
    });
    return [...seen.entries()].filter(([, v]) => v.length > 1).map(([w]) => w);
  }, [model]);
  const [word, setWord] = useState(shared[0] ?? "the");

  const uses = model.sentences
    .map((s, si) => ({ si, toks: s.split(" ") }))
    .filter((u) => u.toks.includes(word))
    .map((u) => {
      const i = u.toks.indexOf(word);
      const run = runs[u.si]!;
      return { ...u, i, E: run.E[i]!, attn: run.attn[i]!, x2: run.x2[i]! };
    });
  const attnBound = maxAbs(uses.map((u) => u.attn));
  const x2Bound = maxAbs(uses.map((u) => u.x2));
  const eBound = maxAbs(uses.map((u) => u.E));

  // Pairwise similarity of the "after one block" vectors: how much context
  // moved them apart.
  const pairs: { a: number; b: number; attn: number; x2: number }[] = [];
  for (let a = 0; a < uses.length; a++) {
    for (let b = a + 1; b < uses.length; b++) {
      pairs.push({
        a,
        b,
        attn: cosine(uses[a]!.attn, uses[b]!.attn),
        x2: cosine(uses[a]!.x2, uses[b]!.x2),
      });
    }
  }
  const minX2 = Math.min(...pairs.map((p) => p.x2));
  const minAttn = Math.min(...pairs.map((p) => p.attn));

  const CELL = 6;
  const len = model.eDim * CELL;
  const x0 = 350;
  const gap = 70;
  const w = x0 + 3 * len + 2 * gap + 10;
  const rowH = 44;
  const h = 40 + uses.length * rowH;

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">One vector per word, or one per use?</h2>
      <p className="at-sub">
        A word embedding gives <b>{word}</b> one vector, the same in every
        sentence it ever appears in — that is the whole design, and it is why
        a lookup table is enough to store it. Send the sentence through a
        transformer block and <b>{word}</b> comes out different each time,
        because it read a different sentence. Pick a word that appears in more
        than one of our sentences:
      </p>
      <div className="at-wordpick" role="group" aria-label="Choose a repeated word">
        {shared.map((wd) => (
          <Button key={wd} size="sm" variant={wd === word ? "primary" : "subtle"} onClick={() => setWord(wd)}>
            {wd}
          </Button>
        ))}
      </div>

      <div className="tf-figwrap">
        <svg
          className="tf-fig"
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          role="img"
          aria-label={`${word} in ${uses.length} sentences: the same embedding each time, a different vector after one transformer block.`}
        >
          <text className="fig-label" x={x0} y={22}>
            the embedding
          </text>
          <text className="fig-label" x={x0 + len + gap} y={22}>
            took from context
          </text>
          <text className="fig-label" x={x0 + 2 * (len + gap)} y={22}>
            after one block
          </text>
          {uses.map((u, r) => {
            const y = 40 + r * rowH;
            return (
              <g key={u.si}>
                <text className="bt-sentence" x={x0 - 12} y={y + 8} textAnchor="end">
                  {u.toks.map((t, k) => (
                    <tspan key={k} className={k === u.i ? "bt-sentence__hit" : undefined}>
                      {k > 0 ? " " : ""}
                      {t}
                    </tspan>
                  ))}
                </text>
                <Strip v={u.E} bound={eBound} x={x0} y={y} cell={CELL} thick={12} />
                <Strip v={u.attn} bound={attnBound} x={x0 + len + gap} y={y} cell={CELL} thick={12} />
                <Strip v={u.x2} bound={x2Bound} x={x0 + 2 * (len + gap)} y={y} cell={CELL} thick={12} />
              </g>
            );
          })}
        </svg>
      </div>

      <p className="tf-readout">
        The first column is identical in every row: that is what “one vector
        per word” means. The middle column is what <b>{word}</b> took from the
        words around it, and it differs from sentence to sentence — the least
        alike pair is only <b>{minAttn.toFixed(2)}</b> similar. The last column
        is <b>{word}</b> after one block: still mostly {word} (the least alike
        pair is <b>{minX2.toFixed(2)}</b> similar), but no longer the same
        vector twice. BERT stacks <b>twelve</b> of these blocks (twenty-four in
        the large version), and the differences compound until “bank” by a
        river and “bank” with a vault share a spelling and nothing else. That
        is a <b>contextual</b> embedding, and it is what the name stands for:
        Bidirectional Encoder Representations from Transformers.
      </p>
    </Card>
  );
}

/* ── 2. Before BERT: ELMo ──────────────────────────────────────────── */

function ElmoPanel({ model }: { model: Model }) {
  const [si, setSi] = useState(0);
  const toks = model.sentences[si]!.split(" ");
  const [at, setAt] = useState(3);
  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">Before BERT: a word read from both sides, by two readers</h2>
      <p className="at-sub">
        The idea that a word's vector should depend on its sentence is older
        than the transformer. The first system to do it at scale read the
        sentence the way the{" "}
        <Link to="/examples/rnn">recurrent network</Link> example does — one
        word at a time, carrying a state — and did it twice, once in each
        direction. Pick a word and compare how it reaches the rest of the
        sentence under the two designs.
      </p>
      <div className="at-sentences">
        {model.sentences.map((s, k) => (
          <Button key={s} size="sm" variant={k === si ? "primary" : "subtle"} onClick={() => { setSi(k); setAt(3); }}>
            {s.split(" ").slice(1, 3).join(" ")}…
          </Button>
        ))}
      </div>
      <div className="at-wordpick" role="group" aria-label="Choose the word to follow">
        {toks.map((t, k) => (
          <Button key={`${t}-${k}`} size="sm" variant={k === at ? "primary" : "subtle"} onClick={() => setAt(k)}>
            {t}
          </Button>
        ))}
      </div>
      <ElmoFigure tokens={toks} at={at} />
      <p className="at-panel__note">
        Peters et al., “Deep contextualized word representations” (2018):
        two layers of LSTM in each direction, trained as language models on a
        billion words, with a word's final vector a learned mix of the layers.
        ELMo's vectors were bolted onto existing task models as extra input;
        BERT replaced the task model with itself. The figure is a schematic —
        no ELMo is trained on this page.
      </p>
    </Card>
  );
}

/* ── 3. How it learns: fill in the blank ─────────────────────────── */

function MaskPanel({ model }: { model: Model }) {
  const [si, setSi] = useState(0);
  const toks = model.sentences[si]!.split(" ");
  const [masked, setMasked] = useState(3);
  const m = Math.min(masked, toks.length - 1);

  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">How it learns: fill in the blank, from both sides</h2>
      <p className="at-sub">
        Nobody labels the training text. The model is handed sentences with
        about one word in seven hidden, and its only job is to guess the
        hidden word. To do that well it has to understand everything around
        the blank — <b>on both sides</b>. That is the B in BERT, and it is the
        difference from a text generator, which may only look left. Click a
        word to hide it and see what the model would have to work from.
      </p>
      <div className="at-sentences">
        {model.sentences.map((s, k) => (
          <Button key={s} size="sm" variant={k === si ? "primary" : "subtle"} onClick={() => { setSi(k); setMasked(3); }}>
            {s.split(" ").slice(1, 3).join(" ")}…
          </Button>
        ))}
      </div>

      <div className="bt-mask">
        <div className="bt-mask__row">
          {toks.map((t, k) => (
            <button
              key={`${t}-${k}`}
              type="button"
              className={`bt-mask__word${k === m ? " bt-mask__word--hidden" : k < m ? " bt-mask__word--left" : " bt-mask__word--right"}`}
              onClick={() => setMasked(k)}
              aria-pressed={k === m}
            >
              {k === m ? "[MASK]" : t}
            </button>
          ))}
        </div>
        <svg className="bt-mask__arrows" viewBox={`0 0 ${toks.length * 100} 40`} preserveAspectRatio="none" aria-hidden="true">
          {toks.map((_, k) => {
            if (k === m) return null;
            const from = k * 100 + 50;
            const to = m * 100 + 50;
            return (
              <path
                key={k}
                className={k < m ? "bt-mask__arc bt-mask__arc--left" : "bt-mask__arc bt-mask__arc--right"}
                d={`M ${from} 36 Q ${(from + to) / 2} ${-20 + Math.abs(k - m) * 4} ${to} 34`}
              />
            );
          })}
        </svg>
        <p className="tf-readout">
          Hidden: <b>{toks[m]}</b>. The model sees{" "}
          <b>{m}</b> word{m === 1 ? "" : "s"} before the blank and{" "}
          <b>{toks.length - 1 - m}</b> after it, and every one of them flows
          into the blank's position through the attention grids you have seen.
          A left-to-right model would have only the{" "}
          {m === 0 ? "nothing at all" : `${m} on the left`}. Do this a few billion
          times and the vectors that make good guesses are vectors that carry
          meaning — no labels, no answer key, just text.
        </p>
      </div>
      <h3 className="rn-h3">This is CBOW's direction, not skip-gram's</h3>
      <p className="at-sub">
        The <Link to="/examples/word2vec">embeddings</Link> page trained
        word2vec one way round: a word goes in, its neighbours come out
        (<b>skip-gram</b>). word2vec shipped a second model that runs the
        other way: the neighbours go in, as an unordered bag, and the one
        word in the middle comes out. That is <b>CBOW</b>, the <i>continuous
        bag of words</i>. Fill-in-the-blank is CBOW's direction. Here are all
        three on the sentence above, with <b>{toks[m]}</b> as the word.
      </p>
      <ObjectiveFigure tokens={toks} at={m} />
      <p className="tf-readout">
        Follow the arrows. Skip-gram puts the word <i>in</i>, so the vector
        you keep afterwards is a row of the input table — one row per word,
        the same in every sentence, which is exactly the limit the previous
        panel was about. CBOW puts the <i>surroundings</i> in, so whatever
        the network builds at the blank is built from this sentence and no
        other. If what you want at the end is a vector for <b>this</b> use
        of <b>{toks[m]}</b>, the blank has to be where the word is, and the
        context has to be what goes in: the direction is forced by the goal.
        BERT keeps that direction and changes everything else about it: the
        bag becomes the whole sentence in order (the position vectors from
        the first panel), the average becomes twelve blocks of attention that
        weight each word differently, and the window of two becomes every
        word there is. The other route to context — predict the <i>next</i>{" "}
        word, as ELMo and the text generators do — can only ever put one side
        in.
      </p>
      <p className="at-panel__note">
        The original BERT also learned to say whether two sentences followed
        each other; later versions dropped that, having found the blanks did
        the work. No guesses are drawn here: this block was fitted to show
        attention, never trained to fill blanks, and a made-up answer would
        teach the wrong thing. The blanks are also why the segment and
        position tables have to exist: a bag needs neither.
      </p>
    </Card>
  );
}

/* ── 4. Then reuse it ─────────────────────────────────────────────── */

const TASKS = [
  { name: "sentiment", input: "a review", output: "positive / negative", reads: "cls" },
  { name: "spam", input: "an email", output: "spam / not spam", reads: "cls" },
  { name: "names & places", input: "a paragraph", output: "a tag on every word", reads: "words" },
  { name: "question answering", input: "a question + a passage", output: "where the answer starts and ends", reads: "words" },
] as const;

function ReusePanel() {
  const [task, setTask] = useState(0);
  const t = TASKS[task]!;
  return (
    <Card className="at-panel" padding="md">
      <h2 className="at-h2">Then reuse it</h2>
      <p className="at-sub">
        The point of the blanks was never the blanks. It was to end up with a
        stack that turns any sentence into good vectors. Once you have that,
        a new task needs only a <b>small new layer on top</b> and a little
        labelled data to tune the whole thing — hours, not the weeks the
        pre-training took. One trunk, many heads.
      </p>
      <div className="at-wordpick" role="group" aria-label="Choose a task">
        {TASKS.map((x, k) => (
          <Button key={x.name} size="sm" variant={k === task ? "primary" : "subtle"} onClick={() => setTask(k)}>
            {x.name}
          </Button>
        ))}
      </div>
      <div className="bt-reuse">
        <div className="bt-reuse__col">
          <span className="fig-label bt-reuse__cap">in</span>
          <span className="bt-reuse__box bt-reuse__box--in">{t.input}</span>
        </div>
        <span className="bt-reuse__arrow">→</span>
        <div className="bt-reuse__col">
          <span className="fig-note bt-reuse__cap">The same trunk, every time.</span>
          <span className="bt-reuse__box bt-reuse__box--trunk">
            12 transformer blocks
            <small>pre-trained once, on blanks</small>
          </span>
        </div>
        <span className="bt-reuse__arrow">→</span>
        <div className="bt-reuse__col">
          <span className="fig-note bt-reuse__cap">New for this task.</span>
          <span className="bt-reuse__box bt-reuse__box--head">
            one small layer
            <small>{t.reads === "cls" ? "reads the summary vector" : "reads every word's vector"}</small>
          </span>
        </div>
        <span className="bt-reuse__arrow">→</span>
        <div className="bt-reuse__col">
          <span className="fig-label bt-reuse__cap">out</span>
          <span className="bt-reuse__box bt-reuse__box--out">{t.output}</span>
        </div>
      </div>
      <p className="at-panel__note">
        BERT prepends a special first token to every input and trains its
        vector to summarise the whole sentence; whole-text tasks read that one
        vector, per-word tasks read all of them. Shapes, for scale: BERT-base
        is 12 blocks, 12 heads each, width 768, about 110 million parameters;
        BERT-large is 24 blocks, 16 heads, width 1,024, about 340 million.
        Both are encoders only — the left tower of the famous figure. What a
        <i>decoder</i> stack learns when it is trained to predict the next word
        instead is the large language models example.
      </p>
    </Card>
  );
}

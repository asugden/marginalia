// The transformers example (/examples/transformers).
//
// Picks up where the attention example stops. That page spent its length
// inside one attention head; this one treats the head as a finished part and
// builds the rest of the block around it:
//
//   1. The head, as a box. Words in, words out, computed from the attention
//      page's own head so the two pages agree.
//   2. Many heads at once, and W_O, the matrix that folds them together.
//      Three heads fitted to find three different relationships; switch any
//      off.
//   3. Add & norm. The word keeps itself and gains context; the numbers stay
//      in range.
//   4. The feed-forward layer as a memory of keys and values — where research
//      finds the facts — drawn as drawers that open for a word.
//   5. One block, stacked N times, with the shapes of real models and where
//      those numbers come from.
//   6. The figure from "Attention Is All You Need", redrawn and translated
//      box by box into the panels above. Our construction is its encoder.
//
// Masking and next-word prediction are deliberately left for the language
// models example. Every number here is computed live from ./heads.json via
// ./transformer.ts; see ./README.md for what is real and what was designed.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import "../attention/attention.css";
import "./transformers.css";
import { loadModel, runBlock, type Model, type RawHeads } from "./transformer.js";
import { HeadBox } from "./HeadBox.js";
import { LayerMap } from "./LayerMap.js";
import { MultiHead } from "./MultiHead.js";
import { AddNorm } from "./AddNorm.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { StackPanel } from "./StackPanel.js";
import { CanonicalFigure } from "./CanonicalFigure.js";

const HEADS_URL = "/examples/transformers/heads.json";

export function TransformersPage() {
  const [model, setModel] = useState<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  // The noun the heads were built around sits at index 3 in every sentence.
  const [row, setRow] = useState(3);
  const [muted, setMuted] = useState<Set<number>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(HEADS_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`heads ${r.status}`);
        return r.json();
      })
      .then((raw: RawHeads) => setModel(loadModel(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const tokens = useMemo(
    () => (model ? model.sentences[sentenceIndex]!.split(" ") : []),
    [model, sentenceIndex],
  );
  const run = useMemo(
    () => (model ? runBlock(model, tokens, muted) : null),
    [model, tokens, muted],
  );

  const toggleHead = (k: number) =>
    setMuted((m) => {
      const next = new Set(m);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const wordPick = run && (
    <div className="at-wordpick" role="group" aria-label="Choose the word to follow">
      {run.tokens.map((t, i) => (
        <Button
          key={`${t}-${i}`}
          size="sm"
          variant={row === i ? "primary" : "subtle"}
          onClick={() => setRow(i)}
        >
          {t}
        </Button>
      ))}
    </div>
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
            <h1>Transformers</h1>
            <p className="mnist-lede">
              The <Link to="/examples/attention">attention</Link> example built
              one attention head and looked inside it. A transformer is what
              you get when you treat that head as a finished part: run several
              at once, add what they find back onto each word, pass every word
              through a memory, and repeat the whole thing dozens of times.
              This page builds that block, one piece at a time, on the same
              sentences and the same head — and ends by decoding the famous
              diagram everyone has seen and few can read.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">Couldn't load the heads ({loadError}).</p>
          )}
          {!model && !loadError && <div className="mnist-loading">Loading heads…</div>}

          {model && run && (
            <>
              {/* ── The map: one layer, drawn once, pointed at throughout ── */}
              <Card className="at-panel" padding="md" id="tf-map">
                <div className="at-main__head">
                  <div>
                    <h2 className="at-h2">One layer, as a map</h2>
                    <p className="at-sub">
                      This is the whole thing, drawn the way networks are
                      usually drawn: columns of neurons, widening in the middle
                      and narrowing again. One part does not fit that shape —
                      attention is not a column of neurons but a grid of word
                      pairs, so it is drawn as the grid from the attention page.
                      The dashed arcs over the top carry the word itself past
                      each stage to a <b>+</b>. Every number is live for the
                      word you choose. The panels below build it left to right,
                      and each carries the number of its place on the map.
                    </p>
                  </div>
                  <div className="at-sentences">
                    {model.sentences.map((s, i) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={i === sentenceIndex ? "primary" : "subtle"}
                        onClick={() => {
                          setSentenceIndex(i);
                          setRow(3);
                        }}
                      >
                        {s.split(" ").slice(1, 3).join(" ")}…
                      </Button>
                    ))}
                  </div>
                </div>
                {wordPick}
                <LayerMap model={model} run={run} row={row} />
                <p className="tf-maplegend">
                  <a href="#tf-heads"><span className="tf-mapref">1</span>attention: the head, then many heads</a>
                  <a href="#tf-addnorm"><span className="tf-mapref">2</span>add &amp; norm</a>
                  <a href="#tf-memory"><span className="tf-mapref">3</span>the memory, two layers</a>
                  <a href="#tf-memory"><span className="tf-mapref">4</span>add &amp; norm again</a>
                  <a href="#tf-stack"><span className="tf-mapref">5</span>repeat</a>
                </p>
              </Card>

              {/* ── 1. The head as a box ── */}
              <Card className="at-panel" padding="md" id="tf-head">
                <div className="at-main__head">
                  <div>
                    <h2 className="at-h2"><span className="tf-mapref">1</span>The attention head, as one box</h2>
                    <p className="at-sub">
                      Everything the attention page did — the grid of how much
                      each word takes from each other, the values that say
                      what it takes — is now one object with words going in
                      and words coming out. Each word comes out as itself plus
                      some of the words it attended to. This box is the
                      attention page's head, number for number.
                    </p>
                  </div>
                </div>
                {wordPick}
                <HeadBox run={run} row={row} onSelectRow={setRow} />
              </Card>

              {/* ── 2. Many heads ── */}
              <Card className="at-panel" padding="md" id="tf-heads">
                <h2 className="at-h2"><span className="tf-mapref">1</span>Many heads at once</h2>
                <p className="at-sub">
                  One head can look for one kind of relationship. A transformer
                  layer runs several side by side, each with its own three
                  matrices, each reading the same sentence and free to find
                  something different. The three here were fitted to find
                  three different things. Every head produces its own output
                  for every word; those outputs are <b>stacked end to end</b>{" "}
                  and multiplied by one more learned matrix,{" "}
                  <b>
                    W<sub>O</sub>
                  </b>
                  , to get back to a single vector the width of the word. That
                  is the matrix the attention page's footnote promised: its
                  job is combining heads.
                </p>
                {wordPick}
                <MultiHead
                  model={model}
                  run={run}
                  row={row}
                  muted={muted}
                  onToggleHead={toggleHead}
                />
                <p className="at-panel__note">
                  Head 1 is the attention page's head. Heads 2 and 3 were
                  fitted the same way to different targets. Real heads are not
                  this tidy — a production model's heads each do several
                  overlapping things at once — but “several heads, several
                  relationships” is the right picture. W<sub>O</sub> here is a
                  fixed random matrix, not a fitted one: with no network around
                  it there is nothing to fit it against.
                </p>
              </Card>

              {/* ── 3. Add & norm ── */}
              <Card className="at-panel" padding="md" id="tf-addnorm">
                <h2 className="at-h2"><span className="tf-mapref">2</span>Add &amp; norm: keep the word, add what it learned</h2>
                <p className="at-sub">
                  Every layer in the networks you have met so far{" "}
                  <b>replaces</b> its input: multiply by the weights, pass the
                  result on, and what came in is gone. A transformer does
                  something different at the <b>+</b> on the map: it takes
                  what attention computed and <b>adds it to the word it was
                  given</b>. Below, the same word goes down both paths. Watch
                  the meter on the right.
                </p>
                <AddNorm model={model} run={run} row={row} which={1} />
                <p className="at-panel__note">
                  “Size” is the typical magnitude of the sixteen numbers.
                  Notice how small attention's contribution is next to the
                  word itself — that is typical, not a quirk of this page: a
                  word stays mostly itself and each layer nudges it — and how
                  the norm sets the size to one regardless. A real layer norm
                  also multiplies by a learned gain and adds a learned offset;
                  that changes nothing about the idea and is left out of the
                  drawing.
                </p>
              </Card>

              {/* ── 4. The memory ── */}
              <Card className="at-panel" padding="md" id="tf-memory">
                <h2 className="at-h2"><span className="tf-mapref">3</span>The other half: a memory for facts</h2>
                <p className="at-sub">
                  Half of every block is not attention at all. After the words
                  have read each other, each word — <b>alone, with no view of
                  the others</b> — passes through the same two-layer network
                  you met in the{" "}
                  <Link to="/examples/digit-recognizer">digit recognizer</Link>:
                  widen, threshold, narrow. Read row by row, that network is a
                  bank of drawers. Each drawer has a <b>key</b>, a pattern it
                  responds to, and a <b>value</b>, what it adds when it opens.
                  Present a word; the few drawers whose keys match open; their
                  values are added to the word. Researchers who took real
                  models apart found that this is where facts are kept: the
                  drawers that open for “Eiffel Tower” are what make “Paris”
                  likely later on, and editing those drawers edits the fact.
                </p>
                {wordPick}
                <MemoryPanel model={model} run={run} row={row} />
                <p className="at-sub tf-sub--after">
                  <span className="tf-mapref">4</span>…and then, exactly as
                  before, the result is added to the word and normalised.
                </p>
                <AddNorm model={model} run={run} row={row} which={2} />
                <p className="at-panel__note">
                  <b>This memory is designed, not learned.</b> Sixteen
                  dimensions of word vectors give nothing to train a real one
                  on, so it has one drawer per word this tiny model knows,
                  keyed on that word's embedding. A real layer has thousands of
                  drawers per block, keyed on patterns no single word names —
                  but they open, sum, and stay shut in exactly this way. The
                  research: Geva, Schuster, Berant &amp; Levy (2021),
                  “Transformer Feed-Forward Layers Are Key-Value Memories”;
                  Meng, Bau, Andonian &amp; Belinkov (2022), “Locating and
                  Editing Factual Associations in GPT”. The memory is also
                  where most of the parameters are: for a word of width d,
                  attention's four matrices hold about 4d² numbers and the
                  memory's two hold about 8d², two-thirds of the block.
                </p>
              </Card>

              {/* ── 5. Stack it ── */}
              <Card className="at-panel" padding="md" id="tf-stack">
                <h2 className="at-h2"><span className="tf-mapref">5</span>One block, then stack it</h2>
                <p className="at-sub">
                  Heads, add &amp; norm, memory, add &amp; norm: that is a
                  transformer block, and a transformer is the block repeated
                  with the output of one feeding the next. Every copy has its
                  own heads and its own drawers. The shapes of real models are
                  public for some and guessed at for others; here are both,
                  labelled.
                </p>
                <StackPanel />
              </Card>

              {/* ── 6. The canonical figure ── */}
              <Card className="at-panel" padding="md" id="tf-figure">
                <h2 className="at-h2">The famous figure, decoded</h2>
                <p className="at-sub">
                  This is the diagram from the 2017 paper that introduced the
                  transformer, redrawn. It is reproduced everywhere and read
                  almost nowhere, partly because it names its boxes after the
                  mathematics and partly because it draws more machine than a
                  modern language model has: two towers, for translating one
                  sequence into another. <b>Hover any box</b> to see what it
                  is in the language of this page, and where you watched it
                  happen. Everything this page built is the <b>left tower</b>
                  , the encoder. The right tower's extra pieces — the mask,
                  the arrows from encoder to decoder, the output layers — are
                  named here and built later.
                </p>
                <CanonicalFigure />
              </Card>
            </>
          )}

          <footer className="mnist-foot">
            <p>
              One transformer block, computed live in your browser on the same
              sentences and the same 16-dimensional word vectors as the
              attention example. Head 1 is that example's head; heads 2 and 3
              were fitted offline to find other relationships; W<sub>O</sub>{" "}
              and the memory's contents were designed rather than learned, and
              the page says where. The mechanism — stacking, folding, adding,
              normalising, keys opening drawers — is exact.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

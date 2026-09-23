// The word2vec example (/examples/word2vec).
//
// One scrolling page of live panels, in the same visual language as the digit
// recognizer (top-to-bottom network, red/blue signed weights, thresholded
// edges with a detail slider, layer captions in a left gutter) and the
// attention example (hoverable vectors, DS cards, a figure that reacts rather
// than a sequence of steps).
//
// The arc, and the reason for it:
//
//   1. The task. Predict a word's neighbours. Real training pairs from a real
//      sentence, so "what is it even learning from?" is answered concretely.
//   2. The network, with its waist. Vocabulary-wide at both ends, a few dozen
//      numbers in the middle. The bottleneck is drawn and named.
//   3. The forced discovery. Nothing told it about meaning; the shape of the
//      problem did. Words used in similar contexts must land in similar
//      places, because that is the only way through the waist.
//   4. Throw away the decoder. The thing we trained for was never the point —
//      the hidden layer is the product. This is the move students remember,
//      and it generalizes to autoencoders and self-supervision at large.
//   5. Now play. Similarity, neighbours, analogies that are allowed to fail,
//      and the one-vector-per-word limitation that motivates attention.
//
// Every neighbour, similarity and analogy comes from a real published
// embedding table reduced to 32 dimensions. See ./README.md for exactly what
// is real and what is a stand-in.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../mnist-mlp/digit-recognizer.css";
import {
  loadTable,
  type RawTable,
  type Table,
} from "../shared/embeddings/embeddings.js";
import { BagOfWordsFigure, type Occurrence } from "./BagOfWordsFigure.js";
import { SimilarityPanel } from "./SimilarityPanel.js";
import { SkipGramNet } from "./SkipGramNet.js";
import { SlotFigure, type Frame } from "./SlotFigure.js";
import {
  bagFor,
  cosine,
  encoderRows,
  forward,
  nearest,
  syntheticDecoder,
  vectorFor,
} from "./w2v.js";
import "./word2vec.css";
import { WordMap } from "./WordMap.js";
// The closing movement: what to do about a word the table does not have.
// It was its own example at /examples/fasttext until it became clear it is
// not a separate idea, only the answer to a wall this page runs into.
import { SubwordSection } from "../fasttext/SubwordSection.js";

const VECTORS_URL = "/examples/word2vec/vectors.json";

// Frames for the substitution box. Each is a slot plus a column of candidates,
// some of which fit and some of which do not. This is the distributional
// hypothesis in its original form: words that occur in the same environments
// tend to have similar meanings.
const FRAMES: Frame[] = [
  {
    before: "the",
    after: "rattled down the street",
    candidates: [
      { word: "trolley", fits: true },
      { word: "tram", fits: true },
      { word: "bus", fits: true },
      { word: "bread", fits: false },
      { word: "opinion", fits: false },
    ],
  },
  {
    before: "she ate the",
    after: "for breakfast",
    candidates: [
      { word: "bread", fits: true },
      { word: "cheese", fits: true },
      { word: "apple", fits: true },
      { word: "tunnel", fits: false },
      { word: "wednesday", fits: false },
    ],
  },
  {
    before: "they crossed the",
    after: "at dawn",
    candidates: [
      { word: "bridge", fits: true },
      { word: "river", fits: true },
      { word: "street", fits: true },
      { word: "coffee", fits: false },
      { word: "honest", fits: false },
    ],
  },
];

// A corpus, not a sentence. These are scattered occurrences of the target word
// drawn from different places, with an ellipsis standing in for the millions
// between them — students otherwise read "training data" as "one example".
const CORPUS: Record<string, Occurrence[]> = {
  trolley: [
    { before: ["the", "old"], target: "trolley", after: ["rattled", "down"] },
    {
      before: ["boarded", "a"],
      target: "trolley",
      after: ["near", "the"],
      gapBefore: true,
    },
    {
      before: ["every", "passing"],
      target: "trolley",
      after: ["stopped", "here"],
      gapBefore: true,
    },
  ],
  bread: [
    { before: ["fresh", "warm"], target: "bread", after: ["from", "the"] },
    {
      before: ["sliced", "the"],
      target: "bread",
      after: ["for", "breakfast"],
      gapBefore: true,
    },
    {
      before: ["bought", "cheap"],
      target: "bread",
      after: ["and", "cheese"],
      gapBefore: true,
    },
  ],
  river: [
    { before: ["the", "frozen"], target: "river", after: ["ran", "under"] },
    {
      before: ["along", "the"],
      target: "river",
      after: ["bank", "they"],
      gapBefore: true,
    },
    {
      before: ["crossed", "the"],
      target: "river",
      after: ["by", "bridge"],
      gapBefore: true,
    },
  ],
};

// The words the network figure shows. Chosen so the bag for any of them is
// visibly *other* words: transport, infrastructure, and food, three groups
// that a trained table separates.
const SHOWN = [
  "trolley",
  "tram",
  "bus",
  "bridge",
  "river",
  "street",
  "bread",
  "coffee",
];

// The 2D map. Fixed and curated so the layout is stable between visits and an
// instructor can point at the same clusters twice.
// How many hidden units the FIGURE draws. The arithmetic always runs over the
// table's full width — truncating to the drawn slice would throw away most of
// each word's information and flatten the softmax into noise.
const DRAWN_DIMS = 8;

const MAP_WORDS = [
  // transport
  "trolley",
  "tram",
  "bus",
  "train",
  "subway",
  "bicycle",
  "car",
  "truck",
  // infrastructure / places
  "bridge",
  "tunnel",
  "street",
  "river",
  "city",
  "station",
  "hillside",
  // food + drink
  "bread",
  "cheese",
  "coffee",
  "tea",
  "apple",
  "banana",
  "bakery",
  // people
  "doctor",
  "nurse",
  "teacher",
  "student",
  // cities + countries
  "paris",
  "london",
  "berlin",
  "france",
  "germany",
  "japan",
  // colours
  "red",
  "blue",
  "green",
  "yellow",
  // time
  "winter",
  "summer",
  "monday",
];

export function Word2VecPage() {
  const [table, setTable] = useState<Table | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [frameIndex, setFrameIndex] = useState(0);
  const [slotPick, setSlotPick] = useState(0);
  const [bagWord, setBagWord] = useState("trolley");
  const [windowSize, setWindowSize] = useState(1);

  const [netInput, setNetInput] = useState(0);
  const [decoderDropped, setDecoderDropped] = useState(false);
  const [mapWord, setMapWord] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(VECTORS_URL, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`vectors ${r.status}`);
        return r.json();
      })
      .then((raw: RawTable) => setTable(loadTable(raw)))
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, []);

  const frame = FRAMES[frameIndex]!;
  const occurrences = CORPUS[bagWord] ?? [];
  const bag = useMemo(
    () => bagFor(occurrences, windowSize),
    [occurrences, windowSize],
  );

  // The figure's weights. Encoder rows are the real embeddings; the decoder is
  // a deterministic stand-in, labelled as such on the page.
  const encoder = useMemo(
    () => (table ? encoderRows(table, SHOWN, table.dim) : null),
    [table],
  );
  const decoder = useMemo(
    () => (table ? syntheticDecoder(table, SHOWN, table.dim) : null),
    [table],
  );
  const run = useMemo(() => {
    if (!encoder || !decoder || !table) return null;
    return forward(encoder, decoder, table.dim, SHOWN.length, netInput);
  }, [encoder, decoder, table, netInput]);

  // The figure draws a slice of the hidden layer and of the weight matrices;
  // the numbers above were computed from all of them.
  const drawn = useMemo(() => {
    if (!run || !table) return null;
    const slice = (M: Float32Array) => {
      const out = new Float32Array(SHOWN.length * DRAWN_DIMS);
      for (let r = 0; r < SHOWN.length; r++)
        for (let c = 0; c < DRAWN_DIMS; c++)
          out[r * DRAWN_DIMS + c] = M[r * table.dim + c] ?? 0;
      return out;
    };
    return {
      hidden: run.hidden.slice(0, DRAWN_DIMS),
      encoder: encoder ? slice(encoder) : null,
      decoder: decoder ? slice(decoder) : null,
    };
  }, [run, table, encoder, decoder]);

  const paramCount = table ? table.words.length * table.dim : 0;

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
            <h1>Word Embeddings</h1>
            <p className="mnist-lede">
              Embeddings underlie all LLMs and nearly all recommendation
              engines, including those of Spotify, YouTube, TikTok, and more.
              One of the most important historical embeddings was Word2Vec,
              published by Google in 2013, followed by fastText (Facebook, now
              Meta) in 2016.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">
              Failed to load the embedding table ({loadError}).
            </p>
          )}
          {!table && !loadError && (
            <div className="mnist-loading">Loading embeddings…</div>
          )}

          {table && run && (
            <>
              {/* ── 1. Adjacency predicts meaning ── */}
              <Card className="w2v-panel" padding="md">
                <h2 className="w2v-h2">A linguistic theorem</h2>
                <p className="w2v-sub">
                  Linguists theorized that the context of a word defines its
                  meaning. If a word could be swapped into a sentence in which
                  its neighbors stayed the same, it should have a similar
                  meaning to the swapped target.
                </p>

                <p className="w2v-figurenote">
                  <b>Drag the column or click a word</b> to test swapping.
                </p>

                <SlotFigure
                  frame={frame}
                  selected={slotPick}
                  onSelect={setSlotPick}
                />

                <div className="w2v-controls w2v-controls--after">
                  {FRAMES.map((f, i) => (
                    <Button
                      key={f.before}
                      size="sm"
                      variant={i === frameIndex ? "primary" : "subtle"}
                      onClick={() => {
                        setFrameIndex(i);
                        setSlotPick(0);
                      }}
                    >
                      {f.before} ___ {f.after.split(" ").slice(0, 2).join(" ")}…
                    </Button>
                  ))}
                </div>
              </Card>

              {/* ── 2. Bag of words ── */}
              <Card className="w2v-panel" padding="md">
                <h2 className="w2v-h2">Turn this into features and labels</h2>
                <p className="w2v-sub">
                  This linguistic theorem suggests that if we could predict
                  neighbor words, we would understand language. That proposes a
                  set of features and labels. Our feature is a word and the
                  associated labels are the unordered neighbor words. We will
                  call this the <b>bag of words</b> we are predicting.
                </p>

                <div className="w2v-controls">
                  {Object.keys(CORPUS).map((w) => (
                    <Button
                      key={w}
                      size="sm"
                      variant={w === bagWord ? "primary" : "subtle"}
                      onClick={() => setBagWord(w)}
                    >
                      {w}
                    </Button>
                  ))}
                  <span className="w2v-spacer" />
                  <label className="w2v-inlinelabel" htmlFor="w2v-window">
                    context width
                  </label>
                  <input
                    id="w2v-window"
                    type="range"
                    min={1}
                    max={2}
                    step={1}
                    value={windowSize}
                    onChange={(e) =>
                      setWindowSize(parseInt(e.target.value, 10))
                    }
                    className="w2v-minislider"
                  />
                  <span className="w2v-inlineval">
                    ±{windowSize} word{windowSize > 1 ? "s" : ""}
                  </span>
                </div>

                <BagOfWordsFigure
                  word={bagWord}
                  occurrences={occurrences}
                  bag={bag}
                  windowSize={windowSize}
                />
              </Card>

              {/* ── 2 + 3. The network and its waist ── */}
              <Card className="w2v-panel" padding="md">
                <div className="w2v-panelhead">
                  <div>
                    <h2 className="w2v-h2">word2vec</h2>
                    <p className="w2v-sub">
                      This is the word2vec model during training. The input is
                      "one-hot encoded", meaning that the target word is set to
                      1 ("hot") and all other words are set to 0 ("cold").
                      <br />
                      <br />
                      In the center is a hidden{" "}
                      <Link to="/examples/deep-neural-network">
                        fully connected layer
                      </Link>{" "}
                      that feeds into the{" "}
                      <Link to="/examples/softmax">output</Link>. The output is
                      essentially the "bag", or the probability that each word
                      will be a neighbor.
                    </p>
                  </div>
                </div>

                <p className="w2v-figurenote">
                  <b>Hover a word in the top row</b> to feed it through the
                  network. This shows only eight words, while modern models have
                  a dictionary of 1M words/subwords and 300-dimensional hidden
                  layers.
                </p>

                <div className="w2v-netwrap">
                  <SkipGramNet
                    shownWords={SHOWN}
                    inputIndex={netInput}
                    hidden={drawn?.hidden ?? null}
                    outputs={run.outputs}
                    encoder={drawn?.encoder ?? null}
                    decoder={drawn?.decoder ?? null}
                    decoderDropped={decoderDropped}
                    onHoverWord={(i) => setNetInput(i ?? netInput)}
                  />
                </div>

                <div className="w2v-forced">
                  {/* The control rides the heading of the section that argues
                      for it, one line below the figure it changes — close
                      enough that pressing it does not scroll the effect out of
                      view, which is the one thing the reader has to watch. */}
                  <div className="w2v-forced__head">
                    <h3 className="w2v-h3">Now remove the decoder</h3>
                    <div className="w2v-netctl">
                      <Button
                        // Red while the decoder is still there, because the
                        // button is offering to cut something; grey once it is
                        // gone, because putting it back is just undo.
                        variant={decoderDropped ? "subtle" : "primary"}
                        size="sm"
                        onClick={() => setDecoderDropped((v) => !v)}
                      >
                        {decoderDropped ? "Return decoder" : "Remove decoder"}
                      </Button>
                      <span className="w2v-netctl__hint">
                        {decoderDropped
                          ? "showing the true output"
                          : "training mode"}
                      </span>
                    </div>
                  </div>
                  <p>
                    The key to embedding is that a fully connected layer is nothing more
                    than a set of numbers, otherwise known as a <b>vector</b>.
                    The final hidden layer feeds the prediction model, which
                    means that it contains the information necessary to predict
                    the neighbor words. We theorized above that successfully
                    predicting neighbor words requres understanding the{" "}
                    <i>inherent meaning</i> of the target word. The last hidden
                    layer feeds the prediction, and therefore{" "}
                    <b>the last hidden layer encodes the meaning of words</b>.
                    As such, we will cut off the decoder and use the values of
                    the hidden layer as a vector representing the input word.
                  </p>
                  <p>
                    This is an example of self-supervised learning. Create a
                    task to solve that allows the data to label itself. Those
                    labels are the key to training your primary model.
                  </p>
                </div>
              </Card>

              {/* ── The map ── */}
              <Card className="w2v-panel" padding="md">
                <h2 className="w2v-h2">Similar words move together</h2>
                <p className="w2v-sub">
                  We've plotted the words below in 2d (reduced in dimensions
                  from 300). Each word is a single point. Notice which words are
                  near each other. The model inherently learned that a tram is a
                  form of transportation and that bread and cheese make lunch.
                </p>
                <p className="w2v-figurenote">
                  <b>Click a word</b> to see its neighbors.
                </p>
                <WordMap
                  table={table}
                  words={MAP_WORDS}
                  selected={mapWord}
                  onSelect={setMapWord}
                />
              </Card>

              {/* ── 5. Play ── */}
              <SimilarityPanel table={table} />

              {/* ── The limitation that leads to attention ── */}
              <Card className="w2v-panel" padding="md">
                <h2 className="w2v-h2">Word vectors encode single meanings</h2>
                <p className="w2v-sub">
                  A limitation of word embedding is that a single word can only
                  be represented by one vector. For example, the nearest words
                  to <b>bass</b> are <i>guitar</i> and <i>trout</i>. Many words
                  lose their rarer meaning because of this. For <b>bank</b>, its
                  river meaning has been lost completely to finance.
                </p>
                <MuddleDemo table={table} />
              </Card>

              {/* ── The sequel: words the table never saw ── */}
              <SubwordSection />
            </>
          )}

          <footer className="mnist-foot">
            <p>
              Everything above is the embeddings of single words. The solution
              to most of the problems is to include multiple words, which is the
              beginning of LLMs.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}

/** The polysemy demo: one vector, two senses, visibly jumbled neighbours. */
function MuddleDemo({ table }: { table: Table }) {
  // Ordered so the first two actually demonstrate the mixing in this table,
  // and the last two demonstrate the other failure mode: a word whose rarer
  // sense has been swallowed entirely.
  const [word, setWord] = useState("bass");
  const words = ["bass", "bat", "rock", "bank"];

  // Two probe sets per ambiguous word; the neighbour list is scored against
  // both so the mixing is measured rather than asserted.
  const probes: Record<string, [string[], string[], string, string]> = {
    bass: [
      ["fish", "trout", "lake", "river"],
      ["guitar", "music", "band", "album"],
      "fish sense",
      "music sense",
    ],
    bat: [
      ["bird", "wings", "cave", "animal"],
      ["ball", "cricket", "game", "player"],
      "animal sense",
      "sport sense",
    ],
    rock: [
      ["stone", "rocks", "mountain", "cliff"],
      ["band", "album", "music", "song"],
      "stone sense",
      "music sense",
    ],
    bank: [
      ["river", "water", "shore", "stream"],
      ["money", "credit", "loans", "financial"],
      "river sense",
      "money sense",
    ],
  };

  const v = vectorFor(table, word);
  const neighbours = v ? nearest(table, v, 8, [word]) : [];
  const [setA, setB, labelA, labelB] = probes[word] ?? [[], [], "", ""];

  const score = (probe: string[]) => {
    if (!v) return 0;
    let total = 0;
    let n = 0;
    for (const p of probe) {
      const pv = vectorFor(table, p);
      if (!pv) continue;
      total += cosine(v, pv);
      n++;
    }
    return n ? total / n : 0;
  };
  const a = score(setA);
  const b = score(setB);

  return (
    <div className="w2v-muddle">
      <div className="w2v-controls">
        {words.map((w) => (
          <Button
            key={w}
            size="sm"
            variant={w === word ? "primary" : "subtle"}
            onClick={() => setWord(w)}
          >
            {w}
          </Button>
        ))}
      </div>

      <div className="w2v-muddle__body">
        <div className="w2v-muddle__list">
          <div className="w2v-muddle__label">
            nearest words to <b>{word}</b>
          </div>
          <div className="w2v-muddle__chips">
            {neighbours.map((n) => {
              const inA = setA.includes(n.word);
              const inB = setB.includes(n.word);
              return (
                <span
                  key={n.word}
                  className={`w2v-chip${inA ? " w2v-chip--a" : ""}${
                    inB ? " w2v-chip--b" : ""
                  }`}
                >
                  {n.word}
                  <span className="w2v-chip__score">{n.score.toFixed(2)}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="w2v-muddle__scores">
          <div className="w2v-muddle__row">
            <span>{labelA}</span>
            <b>{a.toFixed(2)}</b>
          </div>
          <div className="w2v-muddle__row">
            <span>{labelB}</span>
            <b>{b.toFixed(2)}</b>
          </div>
          <p className="w2v-muddle__verdict">
            {Math.abs(a - b) < 0.12 ? (
              <>
                Pulled roughly equally toward <b>both</b> senses. The vector
                represents both meanings.
              </>
            ) : Math.min(a, b) < 0.18 ? (
              <>
                The <b>{a > b ? labelB : labelA}</b> has been largely lost. The
                vector represents only the common meaning.
              </>
            ) : (
              <>
                Leans toward <b>{a > b ? labelA : labelB}</b>.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// The transformers example (/examples/transformers).
//
// Picks up where the attention example stops. That page spent its length
// inside one attention head; this one treats the head as a finished part and
// builds the rest of the block around it:
//
//   1. The head, as a box. Words in, words out, computed from the attention
//      page's own head so the two pages agree.
//   2. Many heads at once, and W_O, the matrix that folds them together.
//      Three heads fitted to find three different relationships.
//   3. Add & norm. The word keeps itself and gains context; the numbers stay
//      in range.
//   4. The feed-forward layer as a memory of keys and values — where research
//      finds the facts — drawn as a dense network of fact neurons.
//   5. (Step 5 on the map, blocks in series, lives on the large language
//      models page, with the shapes of real models.)
//   6. The figure from "Attention Is All You Need", redrawn and translated
//      box by box into the panels above. Our construction is its encoder.
//
// Masking and next-word prediction are deliberately left for the language
// models example. Every number here is computed live from ./heads.json via
// ./transformer.ts; see ./README.md for what is real and what was designed.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Wordmark } from "../../components/index.js";
import "../attention/attention.css";
import "../mnist-mlp/digit-recognizer.css";
import "../shared/figure.css";
import { AddNorm } from "./AddNorm.js";
import { CanonicalFigure } from "./CanonicalFigure.js";
import { HeadBox } from "./HeadBox.js";
import { LayerMap } from "./LayerMap.js";
import { MemoryPanel } from "./MemoryPanel.js";
import { MultiHead } from "./MultiHead.js";
import { fetchModel, runBlock, type Model } from "./transformer.js";
import "./transformers.css";

export function TransformersPage() {
  const [model, setModel] = useState<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  // The noun the heads were built around sits at index 3 in every sentence.
  const [row, setRow] = useState(3);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchModel(ctrl.signal)
      .then(setModel)
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
    () => (model ? runBlock(model, tokens) : null),
    [model, tokens],
  );

  // One control bar for the whole page, pinned as the reader scrolls — the
  // ensemble pages' technique. Every panel follows the same sentence and the
  // same word, so there is one place to change them rather than a copy of the
  // buttons above each figure.
  const controls = model && run && (
    <div
      className="tf-controls"
      role="group"
      aria-label="Choose the sentence and the word to follow"
    >
      <div className="tf-controls__row">
        <span className="tf-controls__label">Sentence</span>
        <div className="tf-controls__buttons">
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
      <div className="tf-controls__row">
        <span className="tf-controls__label">Word</span>
        <div className="tf-controls__buttons">
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
      </div>
    </div>
  );

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
        <div className="mnist-page tf-page">
          <div className="mnist-head">
            <p className="eyebrow">Interactive example</p>
            <h1>Transformers</h1>
            <p className="mnist-lede">
              <Link to="/examples/attention">Attention</Link> covered the most
              complex component of the transformer block, but now we need to put
              it in context. The attention example we saw before was a "head",
              and multiple heads plus a few more layers complete the
              transformer.
            </p>
          </div>

          {loadError && (
            <p className="mnist-error">
              Couldn't load the heads ({loadError}).
            </p>
          )}
          {!model && !loadError && (
            <div className="mnist-loading">Loading heads…</div>
          )}

          {model && run && (
            <>
              {/* The bar is sticky within this wrapper only: it stays pinned
                  through the panels that follow the chosen word (the map
                  through the memory) and scrolls away with them. From the
                  stack panel down nothing depends on the word, so a pinned
                  bar would just be in the way. */}
              <div className="tf-followed">
                {controls}

                {/* ── The map: one layer, drawn once, pointed at throughout ── */}
                <Card className="at-panel" padding="md" id="tf-map">
                  <div className="at-main__head">
                    <div>
                      <h2 className="at-h2">Complete transformer map</h2>
                      <p className="at-sub">
                        Here is a map of a complete transformer. We covered{" "}
                        <Link to="/examples/attention">attention</Link> or step
                        1 in a previous example. The changes that we compute are
                        added to any word (e.g. pierogi) and then passed through
                        a fully connected network. The result of that network is
                        added again. That is one transformer block; a{" "}
                        <Link to="/examples/language-models">
                          large language model
                        </Link>{" "}
                        repeats it in series.
                      </p>
                    </div>
                  </div>
                  <LayerMap model={model} run={run} row={row} />
                </Card>

                {/* ── 1. The head as a box ── */}
                <Card className="at-panel" padding="md" id="tf-head">
                  <div className="at-main__head">
                    <div>
                      <h2 className="at-h2">
                        <span className="tf-mapref">1</span>Attention callback
                      </h2>
                      <p className="at-sub">
                        Consider the entirety of attention (with keys, queries,
                        and values) as a single operation. The result is each
                        input word updated with some of its context.
                      </p>
                    </div>
                  </div>
                  <HeadBox run={run} row={row} onSelectRow={setRow} />
                </Card>

                {/* ── 2. Many heads ── */}
                <Card className="at-panel" padding="md" id="tf-heads">
                  <h2 className="at-h2">
                    <span className="tf-mapref">1</span>Multi-headed attention
                  </h2>
                  <p className="at-sub">
                    The abstract question asked by keys and queries (called an
                    "attention head") examines a single kind of relationship.
                    Similar to multiple convolutional kernels, most transformer
                    networks run multiple heads side-by-side. Each head has its
                    own{" "}
                    <b>
                      W<sub>K</sub>
                    </b>
                    ,{" "}
                    <b>
                      W<sub>Q</sub>
                    </b>
                    , and{" "}
                    <b>
                      W<sub>V</sub>
                    </b>
                    , but they operate off of the same embeddings. Each head's
                    outputs are stacked end-to-end and multiplied by one more
                    learned matrix,{" "}
                    <b>
                      W<sub>O</sub>
                    </b>
                    , to return to the same size of a single word embedding.
                    <br />
                    <br />
                    We have labeled attention heads using phrases like
                    "adjectives -&gt; noun", but{" "}
                    <b>
                      these are human interpretations of a black box process
                    </b>
                    .
                  </p>
                  <MultiHead model={model} run={run} row={row} />
                </Card>

                {/* ── 3. Add & norm ── */}
                <Card className="at-panel" padding="md" id="tf-addnorm">
                  <h2 className="at-h2">
                    <span className="tf-mapref">2</span>Add and normalize
                  </h2>
                  <p className="at-sub">
                    Ironically, most layers in neural networks fully transform
                    the previous layer. The previous layer is multiplied by
                    weights and then passed through an{" "}
                    <Link to="/examples/activation-function">
                      activation function
                    </Link>
                    . In contrast, the two processes performed by a transformer{" "}
                    <b>adjust</b> embeddings rather than transform them. The
                    changes are offsets that are added. These offsets applied
                    layer after layer would let a word's embedding drift. To fix
                    that, we normalize word-by-word to a mean of 0 and a
                    standard deviation of 1.
                  </p>
                  <AddNorm model={model} run={run} row={row} which={1} />
                  <p className="at-panel__note">
                    Note: layer norm in a traditional model learns two
                    additional parameters, gain and offset, that allows better
                    performance.
                  </p>
                </Card>

                {/* ── 4. The memory ── */}
                <Card className="at-panel" padding="md" id="tf-memory">
                  <h2 className="at-h2">
                    <span className="tf-mapref">3</span>Fully connected layers
                  </h2>
                  <p className="at-sub">
                    The attention component of the transformer updates words via
                    their context, but does not update them via their content.
                    This has been labeled "communicate, then compute." To update
                    each word via its own content, we use the same type of{" "}
                    <Link to="/examples/deep-neural-network">
                      fully connected
                    </Link>{" "}
                    network that we saw previously. (The transformer paper
                    calls it the feed-forward network: two fully connected
                    layers applied to each word on its own.)
                    <br />
                    <br />
                    Recent research (see note 1) has shown that this is where
                    the model stores facts. For example, a sentence about
                    Michael Jordan will have the concept of basketball added to
                    it via these layers. Perhaps surprisingly, this is where the
                    vast majority of parameters of a large language model live.
                  </p>
                  <MemoryPanel
                    model={model}
                    run={run}
                    row={row}
                  />
                  <p className="at-sub tf-sub--after" id="tf-addnorm2">
                    <span className="tf-mapref">4</span>Then the result is added
                    to the word and normalised, exactly as in{" "}
                    <a href="#tf-addnorm">step 2</a>.
                  </p>
                  <p className="at-panel__note">
                    Note 1: Geva, Schuster, Berant &amp; Levy (2021),
                    “Transformer Feed-Forward Layers Are Key-Value Memories”;
                    Meng, Bau, Andonian &amp; Belinkov (2022), “Locating and
                    Editing Factual Associations in GPT”.
                    <br />
                    Note 2: this is the only example that was generated by hand
                    rather than by a real model. At the scale of any large
                    language model, it is not as simple as the idea of "Polish"
                    or "subway". That kind of information will be contained
                    across many neurons.
                  </p>
                </Card>
              </div>

              {/* ── 6. The canonical figure ── */}
              <Card className="at-panel" padding="md" id="tf-figure">
                <h2 className="at-h2">Attention figure, decoded</h2>
                <p className="at-sub">
                  The famous figure from the 2017 paper "Attention is all you
                  need" is commonly reproduced, but it can be difficult to
                  understand. First, it is read from bottom to top. Second, it
                  considers a decoder for the specific problem of language
                  translation. The tranformer blocks used in most neural
                  networks today are just the encoder side. Hover over each
                  section to see how it links to the ideas discussed above.
                </p>
                <CanonicalFigure />
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

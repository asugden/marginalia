// The part students actually play with: type two words, get a number; type a
// word, get its neighbours; try an analogy and watch it work or fail.
//
// The analogy demo is deliberately honest. The famous king − man + woman =
// queen trick is usually presented having quietly excluded the three input
// words from the answer — and without that exclusion the nearest vector to the
// result is very often just `king` again. Here the exclusion is a visible
// toggle, the top five are shown with their scores rather than one confident
// answer, and students are invited to try their own analogies and watch most
// of them come out mushy. That is a truer lesson than the party trick.

import { useMemo, useState } from "react";
import { Button, Card } from "../../components/index.js";
import {
  analogy,
  cosine,
  nearest,
  vectorFor,
  type Table,
} from "../shared/embeddings/embeddings.js";

const PAIR_PRESETS: Array<[string, string]> = [
  ["cat", "dog"],
  ["cat", "bread"],
  ["paris", "london"],
  ["paris", "coffee"],
  ["king", "queen"],
  ["hot", "cold"],
];

const ANALOGY_PRESETS: Array<[string, string, string, string]> = [
  ["king", "man", "woman", "the one everybody shows you"],
  ["paris", "france", "italy", "capitals — usually works"],
  ["walked", "walk", "swim", "verb tense — often works"],
  ["bigger", "big", "small", "comparatives — sometimes works"],
  ["coffee", "cup", "bread", "a stretch — watch it struggle"],
];

export function SimilarityPanel({ table }: { table: Table }) {
  const [a, setA] = useState("cat");
  const [b, setB] = useState("dog");
  const [probe, setProbe] = useState("trolley");
  const [an, setAn] = useState<[string, string, string]>([
    "king",
    "man",
    "woman",
  ]);
  const [excludeInputs, setExcludeInputs] = useState(true);

  const va = vectorFor(table, a);
  const vb = vectorFor(table, b);
  const sim = va && vb ? cosine(va, vb) : null;

  const vp = vectorFor(table, probe);
  const neighbours = useMemo(
    () => (vp ? nearest(table, vp, 8, [probe]) : []),
    [table, vp, probe],
  );

  const [x, y, z] = an;
  const vx = vectorFor(table, x);
  const vy = vectorFor(table, y);
  const vz = vectorFor(table, z);
  const analogyResults = useMemo(() => {
    if (!vx || !vy || !vz) return [];
    const result = analogy(vx, vy, vz);
    return nearest(table, result, 5, excludeInputs ? [x, y, z] : []);
  }, [table, vx, vy, vz, x, y, z, excludeInputs]);

  return (
    <Card className="w2v-panel" padding="md">
      <h2 className="w2v-h2">Test it out</h2>
      <p className="w2v-sub">
        Try it with your own words. Note that we've loaded a small subset of
        only <a href=""></a> {table.words.length.toLocaleString()}-word
        vocabulary. Missing words will be solved by fastText below.
      </p>

      {/* ── Two words, one number ── */}
      <div className="w2v-play">
        <h3 className="w2v-h3">How similar are two words?</h3>
        <div className="w2v-simrow">
          <WordInput
            value={a}
            onChange={setA}
            table={table}
            label="first word"
          />
          <span className="w2v-simrow__vs">vs</span>
          <WordInput
            value={b}
            onChange={setB}
            table={table}
            label="second word"
          />
          <div className="w2v-simscore">
            {sim === null ? (
              <span className="w2v-simscore__miss">not in vocabulary</span>
            ) : (
              <>
                <span className="w2v-simscore__val">{sim.toFixed(3)}</span>
                <span className="w2v-simscore__bar">
                  <span
                    className="w2v-simscore__fill"
                    style={{ width: `${Math.max(0, sim) * 100}%` }}
                  />
                </span>
                <span className="w2v-simscore__gloss">
                  {sim > 0.75
                    ? "nearly interchangeable"
                    : sim > 0.5
                      ? "clearly related"
                      : sim > 0.25
                        ? "loosely related"
                        : "unrelated"}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="w2v-controls">
          {PAIR_PRESETS.map(([p, q]) => (
            <Button
              key={`${p}-${q}`}
              size="sm"
              variant={p === a && q === b ? "primary" : "subtle"}
              onClick={() => {
                setA(p);
                setB(q);
              }}
            >
              {p} / {q}
            </Button>
          ))}
        </div>
        <p className="w2v-note">
          Similarity is measured by "cosine similarity", which measures how
          similar their meanings are. 1 denotes that they are the same, 0 means
          unrelated. This is just a dot-product, which is the same idea
          underlying <a href="/examples/attention">attention</a>.
        </p>
      </div>

      {/* ── Nearest neighbours ── */}
      <div className="w2v-play">
        <h3 className="w2v-h3">What are the most similar words?</h3>
        <div className="w2v-proberow">
          <WordInput
            value={probe}
            onChange={setProbe}
            table={table}
            label="any word in the vocabulary"
          />
        </div>
        {neighbours.length === 0 ? (
          <p className="w2v-miss">
            <b>{probe}</b> is not in this vocabulary.
          </p>
        ) : (
          <ol className="w2v-neighbours">
            {neighbours.map((n) => (
              <li key={n.word}>
                <button
                  type="button"
                  className="w2v-neighbour"
                  onClick={() => setProbe(n.word)}
                >
                  <span className="w2v-neighbour__word">{n.word}</span>
                  <span className="w2v-neighbour__bar">
                    <span
                      className="w2v-neighbour__fill"
                      style={{ width: `${Math.max(0, n.score) * 100}%` }}
                    />
                  </span>
                  <span className="w2v-neighbour__score">
                    {n.score.toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Analogies, allowed to fail ── */}
      <div className="w2v-play">
        <h3 className="w2v-h3">word2vec can solve analogies</h3>
        <p className="w2v-sub">
          Amazingly, there is even more meaning in the word vectors. We can
          combine the meanings of words to find new meanings. This can
          incorporate verb tense, location, gender, and more.
        </p>
        <div className="w2v-analogy">
          <WordInput
            value={x}
            onChange={(v) => setAn([v, y, z])}
            table={table}
            label="a"
          />
          <span className="w2v-analogy__op">−</span>
          <WordInput
            value={y}
            onChange={(v) => setAn([x, v, z])}
            table={table}
            label="b"
          />
          <span className="w2v-analogy__op">+</span>
          <WordInput
            value={z}
            onChange={(v) => setAn([x, y, v])}
            table={table}
            label="c"
          />
          <span className="w2v-analogy__op">=</span>
          <span className="w2v-analogy__result">
            {analogyResults[0]?.word ?? "—"}
          </span>
        </div>

        <div className="w2v-controls">
          {ANALOGY_PRESETS.map(([p, q, r, note]) => (
            <Button
              key={`${p}-${q}-${r}`}
              size="sm"
              variant={p === x && q === y && r === z ? "primary" : "subtle"}
              onClick={() => setAn([p, q, r])}
              title={note}
            >
              {p} − {q} + {r}
            </Button>
          ))}
        </div>

        {analogyResults.length > 0 && (
          <ol className="w2v-neighbours w2v-neighbours--compact">
            {analogyResults.map((n, i) => (
              <li key={n.word}>
                <span className="w2v-neighbour">
                  <span className="w2v-neighbour__rank">{i + 1}</span>
                  <span className="w2v-neighbour__word">{n.word}</span>
                  <span className="w2v-neighbour__bar">
                    <span
                      className="w2v-neighbour__fill"
                      style={{ width: `${Math.max(0, n.score) * 100}%` }}
                    />
                  </span>
                  <span className="w2v-neighbour__score">
                    {n.score.toFixed(2)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        <label className="w2v-toggle">
          <input
            type="checkbox"
            checked={excludeInputs}
            onChange={(e) => setExcludeInputs(e.currentTarget.checked)}
          />
          Exclude the three input words from the answer
        </label>

        <p className="w2v-note">
          {excludeInputs ? (
            <>
              Because of how spread out words are, it can be easy to return the
              input word. The most famous king/queen demo inherently returns
              itself, which is rarely mentioned.
            </>
          ) : (
            <>
              With the exclusion filter off, you will usually return the input
              word.
            </>
          )}
        </p>
      </div>
    </Card>
  );
}

/** A word field that reports whether what was typed exists in the table. */
function WordInput({
  value,
  onChange,
  table,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  table: Table;
  label: string;
}) {
  const known = table.index.has(value.toLowerCase().trim());
  return (
    <span className="w2v-input">
      <input
        type="text"
        value={value}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={known ? undefined : "w2v-input--miss"}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

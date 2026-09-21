// The subword-embeddings section (fastText).
//
// This used to be its own page at /examples/fasttext. It is now the closing
// movement of the word embeddings example, because it is not a separate idea —
// it is the answer to the wall that example runs into. A word2vec table has
// one row per word, so a word it never saw has no vector at all; fastText
// refuses to treat a word as an atom and builds its vector out of character
// n-grams instead.
//
// The arc inside the section:
//
//   1. The wall. A lookup that fails on anything unseen — and "unseen" is most
//      words, because vocabularies are finite and language is not.
//   2. Words are made of pieces. The same word, cut into character n-grams.
//   3. Assemble. The pieces are added up, and the result is checked against
//      the real table: `trolleys` lands at 0.98 from `trolley`, having never
//      been seen, and the in-vocabulary control `trolley` is reproduced from
//      its pieces alone at 0.99.
//   4. Where it breaks. `greasiest` latches onto the -est suffix and comes
//      back with `significant`. Morphology is not meaning, and the section
//      shows the failure rather than hiding it.
//
// The tables this needs (fastText word vectors plus the n-gram table, ~2.2 MB
// raw) are a good deal larger than the word2vec table the rest of the page
// runs on, so they are fetched only once the section is close to the viewport.
// A reader who stops at the map above never pays for them.
//
// Every number is computed live from the shipped tables.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "../../components/index.js";
import {
  loadTable,
  type RawTable,
  type Table,
} from "../shared/embeddings/embeddings.js";
import "./fasttext.css";
import {
  analyze,
  cosine,
  loadGrams,
  nearest,
  vectorFor,
  type GramTable,
  type RawGrams,
} from "./ft.js";

const VECTORS_URL = "/examples/fasttext/vectors.json";
const GRAMS_URL = "/examples/fasttext/ngrams.json";

/** Anchor for the section. `/examples/fasttext` redirects to `#subword`, so
 *  this string is part of a URL instructors may already have linked. */
const SECTION_ID = "subword";

// Words chosen to show the mechanism working and failing. Most are out of
// vocabulary — that is the point of the section — but `trolley` is deliberately
// one the table does have, sitting next to the plural it does not: it is the
// control, the case where the pieces can be checked against a real vector
// instead of only against their neighbours. `greasiest` is the honest failure.
const PRESETS = [
  { word: "trolleys", note: "a plural we never saw" },
  { word: "trolley", note: "the singular, which we did see" },
  { word: "coffeeshop", note: "a compound we never saw" },
  { word: "tunneled", note: "a verb form we never saw" },
  { word: "bakeries", note: "a plural with a spelling change" },
  { word: "greasiest", note: "where it goes wrong" },
];

export function SubwordSection() {
  const [table, setTable] = useState<Table | null>(null);
  const [grams, setGrams] = useState<GramTable | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [word, setWord] = useState("trolleys");

  // Don't fetch the tables until the reader is heading this way.
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    // Arriving at #subword — the old /examples/fasttext URL redirects here, and
    // the router does not scroll to hash targets on its own. Jump to the
    // section and load immediately; this reader came for exactly this part.
    if (window.location.hash === `#${SECTION_ID}`) {
      setNear(true);
      el.scrollIntoView({ block: "start" });
      return;
    }

    // Measured against scroll position rather than an IntersectionObserver.
    // IO only delivers callbacks while the document is actually being
    // rendered, so a tab that loads this page in the background would sit on
    // "Loading…" until it was looked at. Reading the rect on scroll has no
    // such dependency. `capture: true` is what catches it: scroll events do
    // not bubble, but they do capture, and this page scrolls an inner element
    // rather than the window.
    const check = () => {
      const node = sentinel.current;
      if (!node) return false;
      if (node.getBoundingClientRect().top < window.innerHeight + 600) {
        setNear(true);
        return true;
      }
      return false;
    };
    if (check()) return;

    const onScroll = () => {
      if (check()) {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!near) return;
    const ctrl = new AbortController();
    Promise.all([
      fetch(VECTORS_URL, { signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error(`vectors ${r.status}`);
        return r.json() as Promise<RawTable>;
      }),
      fetch(GRAMS_URL, { signal: ctrl.signal }).then((r) => {
        if (!r.ok) throw new Error(`n-grams ${r.status}`);
        return r.json() as Promise<RawGrams>;
      }),
    ])
      .then(([v, g]) => {
        setTable(loadTable(v));
        setGrams(loadGrams(g));
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setLoadError(e.message);
      });
    return () => ctrl.abort();
  }, [near]);

  const built = useMemo(
    () => (table && grams ? analyze(table, grams, word) : null),
    [table, grams, word],
  );

  // Nearest neighbours of the assembled vector, excluding the word itself so
  // an in-vocabulary word does not simply match itself.
  const neighbours = useMemo(() => {
    if (!table || !built?.vector) return [];
    return nearest(table, built.vector, 6, [built.word]);
  }, [table, built]);

  // If the word IS in the vocabulary, how close did the pieces get to its real
  // vector? This is the honesty check, and it is the number that says the
  // mechanism works.
  const fidelity = useMemo(() => {
    if (!table || !built?.vector || !built.inVocabulary) return null;
    const real = vectorFor(table, built.word);
    return real ? cosine(real, built.vector) : null;
  }, [table, built]);

  const setPreset = useCallback((w: string) => setWord(w), []);

  return (
    <div className="ft-section" id={SECTION_ID} ref={sentinel}>
      <div className="ft-section__head">
        <p className="eyebrow">Interactive example: Part 2</p>
        <h2 className="ft-section__title">Subword embeddings</h2>
        <p className="ft-section__lede">
          As you saw above, word2vec misses any words not in its dictionary. It
          also can't benefit from the meaning of parts of words, such as "ing",
          "ed", "pre", and more. After word2vec, Facebook extended the ideas to
          include both a full word as well as its parts. A word becomes the sum
          of its pieces.
        </p>
      </div>

      {loadError && (
        <p className="mnist-error">Couldn't load the tables ({loadError}).</p>
      )}
      {!built && !loadError && (
        <div className="mnist-loading">Loading subword tables…</div>
      )}

      {table && grams && built && (
        <>
          {/* ── The input ── */}
          <Card className="ft-panel" padding="md">
            <h3 className="ft-h2">Type a word</h3>
            <p className="ft-sub">
              The word does not have to be in the dictionary. It can even be
              misspelled or made up.
            </p>

            <div className="ft-inputrow">
              <input
                className="ft-input"
                type="text"
                value={word}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="a word to embed"
                onChange={(e) => setWord(e.target.value)}
              />
              <span
                className={`ft-status${
                  built.inVocabulary ? " ft-status--in" : " ft-status--out"
                }`}
              >
                {built.inVocabulary
                  ? "in the vocabulary"
                  : "not in the vocabulary"}
              </span>
            </div>

            <div className="ft-presets">
              {PRESETS.map((p) => (
                <Button
                  key={p.word}
                  size="sm"
                  variant={p.word === word ? "primary" : "subtle"}
                  onClick={() => setPreset(p.word)}
                  title={p.note}
                >
                  {p.word}
                </Button>
              ))}
            </div>
          </Card>

          {/* ── The pieces ── */}
          <Card className="ft-panel" padding="md">
            <h3 className="ft-h2">The word is a "bag" of parts</h3>
            <p className="ft-sub">
              The bag is composed of the word and subwords of length 3 to 6
              characters. Note that we wrap the word with a start word symbol{" "}
              <code>&lt;</code> and an end-of-word symbol <code>&gt;</code>.
              These differentiate the ending "ing" from the beginning of
              ingredient.
            </p>

            <div className="ft-word">
              <span className="ft-word__bracket">&lt;</span>
              {built.word.split("").map((ch, i) => (
                <span key={i} className="ft-word__char">
                  {ch}
                </span>
              ))}
              <span className="ft-word__bracket">&gt;</span>
            </div>

            <div className="ft-grams">
              {built.pieces.map((p, i) => (
                <span
                  key={`${p.gram}-${i}`}
                  className={`ft-gram${p.index < 0 ? " ft-gram--unknown" : ""}${
                    p.pull > 0.45 ? " ft-gram--strong" : ""
                  }`}
                  title={
                    p.index < 0
                      ? "never seen in any vocabulary word"
                      : `seen in ${p.count} words · pull ${p.pull.toFixed(2)}`
                  }
                >
                  {p.gram}
                  {p.index >= 0 && (
                    <span className="ft-gram__count">{p.count}</span>
                  )}
                </span>
              ))}
            </div>

            <p className="ft-note">
              <b>{built.known}</b> of {built.pieces.length} pieces are in the
              training set (marked in red). Greyed pieces were not in the
              training set and do not have vectors.
            </p>
          </Card>

          {/* ── The result ── */}
          <Card className="ft-panel" padding="md">
            <h3 className="ft-h2">Sum the vectors</h3>
            <p className="ft-sub">
              The <i>meaning of the word</i> is the combination of the meanings
              of its parts.
            </p>

            {built.vector ? (
              <>
                <div className="ft-result">
                  <div className="ft-result__head">
                    nearest words to the assembled <b>{built.word}</b>
                  </div>
                  <ol className="ft-neighbours">
                    {neighbours.map((n) => (
                      <li key={n.word}>
                        <button
                          type="button"
                          className="ft-neighbour"
                          onClick={() => setWord(n.word)}
                        >
                          <span className="ft-neighbour__word">{n.word}</span>
                          <span className="ft-neighbour__bar">
                            <span
                              className="ft-neighbour__fill"
                              style={{
                                width: `${Math.max(0, n.score) * 100}%`,
                              }}
                            />
                          </span>
                          <span className="ft-neighbour__score">
                            {n.score.toFixed(2)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>

                {fidelity !== null && (
                  <div className="ft-fidelity">
                    <span className="ft-fidelity__label">
                      this word is also in the table — how close did the pieces
                      get to its real vector?
                    </span>
                    <span className="ft-fidelity__val">
                      {fidelity.toFixed(3)}
                    </span>
                    <span className="ft-fidelity__gloss">
                      {fidelity > 0.9
                        ? "nearly identical — the pieces reconstructed it"
                        : fidelity > 0.7
                          ? "close, but the whole word carries something its parts do not"
                          : "far off — this word is more than its spelling"}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="ft-miss">
                None of this word's pieces have been seen, so there is nothing
                to add up. Try letters that English words actually use.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

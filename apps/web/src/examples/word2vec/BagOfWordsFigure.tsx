// Bag of words: how the linguistic idea becomes something a network can eat.
//
// The previous box established that words filling the same slot mean similar
// things. This box turns that into arithmetic: for each occurrence of a word,
// collect the words immediately around it and drop them in a bag. Order inside
// the bag is discarded — that is what makes it a *bag* rather than a list —
// and what remains is a count of which words keep showing up nearby.
//
// Two things this figure is careful about:
//
// The corpus is drawn as a corpus, with an ellipsis through the middle, not as
// a single sentence. Students otherwise come away thinking a model learns from
// one example; the whole point is that the bag is filled by millions of
// occurrences, and that the counts only mean anything in aggregate.
//
// The training example that comes out the bottom is genuinely bag-shaped: one
// input word, and a *set* of context words to predict, not a stream of
// (centre, context) pairs. That matters because the network figure downstream
// has a bag-shaped output layer.

export interface Occurrence {
  /** Words before the target in this line. */
  before: string[];
  /** The target word. */
  target: string;
  /** Words after the target in this line. */
  after: string[];
  /** Render an ellipsis row above this occurrence. */
  gapBefore?: boolean;
}

interface Props {
  word: string;
  occurrences: Occurrence[];
  /** Context words, with how many times each was collected. */
  bag: Array<{ word: string; count: number }>;
  /** How many words either side count as context. */
  windowSize: number;
}

export function BagOfWordsFigure({
  word,
  occurrences,
  bag,
  windowSize,
}: Props) {
  const total = bag.reduce((s, b) => s + b.count, 0);

  return (
    <div className="w2v-bow">
      {/* The corpus: many occurrences, with the middle elided. */}
      <div className="w2v-bow__corpus">
        <div className="w2v-bow__corpushead">
          every line where <b>{word}</b> appears
        </div>
        {occurrences.map((o, i) => (
          <div key={i}>
            {o.gapBefore && (
              <div className="w2v-bow__ellipsis" aria-label="many more lines">
                ⋮
              </div>
            )}
            <div className="w2v-bow__line">
              <span className="w2v-bow__far">…</span>
              {o.before.map((w, k) => (
                <span
                  key={`b-${k}`}
                  className={
                    o.before.length - k <= windowSize
                      ? "w2v-bow__ctx"
                      : "w2v-bow__plain"
                  }
                >
                  {w}
                </span>
              ))}
              <span className="w2v-bow__target">{o.target}</span>
              {o.after.map((w, k) => (
                <span
                  key={`a-${k}`}
                  className={k < windowSize ? "w2v-bow__ctx" : "w2v-bow__plain"}
                >
                  {w}
                </span>
              ))}
              <span className="w2v-bow__far">…</span>
            </div>
          </div>
        ))}
        <div className="w2v-bow__ellipsis" aria-label="many more lines">
          ⋮
        </div>
        <div className="w2v-bow__corpusfoot">
          millions of lines across wikipedia
        </div>
      </div>

      <div className="w2v-bow__arrow" aria-hidden="true">
        <span>add the highlighted words to a "bag"</span>
        <span className="w2v-bow__arrowglyph">↓</span>
      </div>

      {/* The bag itself: counts, no order. */}
      <div className="w2v-bow__bag">
        <div className="w2v-bow__baghead">
          the bag for <b>{word}</b>
          <span className="w2v-bow__bagsub">unordered; counts only</span>
        </div>
        <div className="w2v-bow__chips">
          {bag.map((b) => (
            <span key={b.word} className="w2v-bow__chip">
              {b.word}
              {b.count > 1 && (
                <span className="w2v-bow__count">×{b.count}</span>
              )}
            </span>
          ))}
        </div>
        <p className="w2v-bow__note">
          This is called skip-gram training. A single training row is a pair of
          the focus word {word} and one of the neighbor words from the bag. Over
          time, the model learns to predict the frequencies of the complete bag.
          Two words with similar bags are those with similar meanings.
        </p>
      </div>
    </div>
  );
}

// Panel 2: tokens. What goes into a language model is a list of numbers, one
// per token, each of which picks out an embedding vector; what comes out is a
// probability for every token, from which one is drawn and turned back into
// text. Between the two, how the vocabulary itself was made: letters merged,
// pair by pair.

import { Link } from "react-router-dom";
import { Card } from "../../components/index.js";
import { value } from "../shared/palette.js";
import {
  embeddingRow,
  LLM_START,
  LLM_STEPS,
  OUTPUT_WIDTH,
  VOCAB,
  WORD_LETTERS,
  WORD_MERGES,
  type Merge,
  type Token,
} from "./tokens.js";

const CELLS = 8;

export function TokenizerPanel() {
  const input = LLM_START;
  const first = LLM_STEPS[0]!;
  const next = first.options[first.pick]!.token;

  return (
    <Card className="lm-panel" padding="md">
      <h2 className="lm-h2">LLMs operate not on words, but on tokens</h2>
      <p className="lm-sub">
        Most of the time, a token is just a word. But it comes from the idea
        that combining letters gives a model access to better information about
        meaning. Because the LLM reads numbers, we need to create a dictionary
        that lists and numbers a set of {VOCAB.toLocaleString()} words and
        partial words. Each number then draws from a table of token{" "}
        <Link to="/examples/word2vec">embeddings</Link>.
      </p>

      <h3 className="lm-h3">In</h3>
      <div className="lm-tokens" aria-label={`${input.length} tokens`}>
        <span className="lm-chip lm-chip--lanes" aria-hidden="true">
          <span className="lm-chip__text fig-label">token</span>
          <span className="lm-chip__id fig-label">id</span>
          <span className="lm-chip__vec fig-label">embedding</span>
        </span>
        {input.map((t, i) => (
          <TokenChip key={i} token={t} alt={i % 2 === 1} vector />
        ))}
      </div>
      <p className="lm-count">
        Four words become <span className="lm-count__num">{input.length}</span>{" "}
        tokens: the single word "storybooks" becomes two tokens, and "books"
        with no space in front is a different token from " books".
      </p>

      <h3 className="lm-h3">How tokens are made</h3>
      <p className="lm-sub lm-sub--tight">
        The dictionary begins as only single letters and characters (strictly,
        256 possible bytes). Iteratively, the most frequent pair of tokens is
        identified and merged. If any possible characters would be lost by the
        merge, then those are kept (e.g. o, k goes to ok but keeps o and keeps
        k). This is done until the dictionary reaches a desired target size.
      </p>
      <MergeFigure letters={WORD_LETTERS} merges={WORD_MERGES} />

      <h3 className="lm-h3">Out</h3>
      <div className="lm-out">
        <div className="lm-out__step">
          <span className="fig-label">last layer</span>
          <Histogram />
          <span className="fig-label-sub">
            probability for each of {OUTPUT_WIDTH.toLocaleString()} tokens
          </span>
        </div>
        <span className="lm-out__arrow" aria-hidden="true">
          →
        </span>
        <div className="lm-out__step">
          <span className="fig-label">draw one</span>
          <span className="lm-out__value lm-out__value--mono">{next.id}</span>
          <span className="fig-label-sub">its id</span>
        </div>
        <span className="lm-out__arrow" aria-hidden="true">
          →
        </span>
        <div className="lm-out__step">
          <span className="fig-label">look it up</span>
          <TokenChip token={next} />
        </div>
        <span className="lm-out__arrow" aria-hidden="true">
          →
        </span>
        <div className="lm-out__step lm-out__step--text">
          <span className="fig-label">append to the text</span>
          <span className="lm-out__text">
            {LLM_START.map((t) => t.text).join("")}
            <b>{next.text}</b>
          </span>
        </div>
      </div>

      <p className="lm-note">
        Tokens come from OpenAI's o200k tokenizer, which uses embedding vectors
        of length 2880.
      </p>
    </Card>
  );
}

export function TokenChip({
  token,
  alt = false,
  vector = false,
}: {
  token: Token;
  alt?: boolean;
  vector?: boolean;
}) {
  return (
    <span className={`lm-chip${alt ? " lm-chip--alt" : ""}`}>
      <span className="lm-chip__text">
        <Piece text={token.text} />
      </span>
      <span className="lm-chip__id">{token.id}</span>
      {vector && (
        <span className="lm-chip__vec">
          <svg
            width={CELLS * 7}
            height={12}
            viewBox={`0 0 ${CELLS * 7} 12`}
            aria-hidden="true"
          >
            {embeddingRow(token.id, CELLS).map((v, c) => (
              <rect
                key={c}
                x={c * 7}
                y={0}
                width={6}
                height={12}
                rx={1}
                style={{ fill: value(v) }}
              />
            ))}
          </svg>
        </span>
      )}
    </span>
  );
}

/** A piece of text with its leading space drawn as a dot. */
function Piece({ text }: { text: string }) {
  const space = text.startsWith(" ");
  const body = space ? text.slice(1) : text;
  return (
    <>
      {space && <span className="lm-chip__space">·</span>}
      {body || (space ? "" : " ")}
    </>
  );
}

/** One word from letters to tokens, one merge per row: the piece each row
 *  creates is picked out, and beside it why that pair was merged. */
function MergeFigure({
  letters,
  merges,
}: {
  letters: string[];
  merges: Merge[];
}) {
  const rows = [letters, ...merges.map((m) => m.pieces)];
  return (
    <div
      className="lm-merge"
      role="img"
      aria-label={`${letters.join("")}: ${merges.length} merges, from letters to ${merges.at(-1)!.pieces.length} tokens`}
    >
      <div className="lm-merge__row" aria-hidden="true">
        <span className="lm-merge__n" />
        <span className="lm-merge__pieces" />
        <span className="lm-merge__why lm-merge__head">
          <span className="lm-merge__rank">merge order</span>
          <span className="lm-merge__count">word</span>
          <span>count in training set</span>
        </span>
      </div>
      {rows.map((row, r) => {
        const prev = rows[r - 1];
        const fresh = prev ? row.findIndex((p, i) => p !== prev[i]) : -1;
        const m = r > 0 ? merges[r - 1]! : null;
        return (
          <div key={r} className="lm-merge__row">
            <span className="fig-tick lm-merge__n">
              {r === 0 ? "letters" : `merge ${r}`}
            </span>
            <span className="lm-merge__pieces">
              {row.map((p, i) => (
                <span
                  key={i}
                  className={`lm-merge__piece${i === fresh ? " lm-merge__piece--new" : ""}`}
                >
                  <Piece text={p} />
                </span>
              ))}
            </span>
            <span className="lm-merge__why">
              {m ? (
                <>
                  <span className="lm-merge__rank">
                    piece #{m.rank.toLocaleString()}
                  </span>
                  <span className="lm-merge__count">
                    {m.count.toLocaleString()}×
                  </span>
                  <span className="lm-merge__ex">{m.examples.join(", ")}</span>
                </>
              ) : (
                <span className="lm-merge__ex">starting dictionary</span>
              )}
            </span>
          </div>
        );
      })}
      {merges.at(-1)!.pieces.length > 1 && (
        <div className="lm-merge__row">
          <span className="fig-tick lm-merge__n">tokens</span>
          <span className="lm-merge__pieces" />
          <span className="lm-merge__why">
            <span className="lm-merge__ex">
              no merge joins{" "}
              {merges
                .at(-1)!
                .pieces.map((p) => `"${p}"`)
                .join(" and ")}
              , so the word stays as {merges.at(-1)!.pieces.length} tokens
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// The first step of the one-word-at-a-time walk, as the model's output
// actually comes: one probability per token, in no order of likelihood. The
// top five sit among a sample of the rest; the small ones are stand-ins.
const HIST_W = 290;
const HIST_H = 96;
const N_BARS = 58;
const STEP = HIST_W / N_BARS;
const BAR = STEP * 0.7;
const SLOTS = [9, 23, 31, 44, 52]; // where the top five fall among the bars

function Histogram() {
  const first = LLM_STEPS[0]!;
  let h = 7;
  const probs = Array.from({ length: N_BARS }, () => {
    h = (h * 16807) % 2147483647;
    return 0.002 + ((h % 1000) / 1000) ** 3 * 0.035;
  });
  first.options.forEach((o, k) => (probs[SLOTS[k]!] = o.p));
  const drawnAt = SLOTS[first.pick]!;
  const max = Math.max(...probs);
  const top = 18;
  const base = HIST_H - 14;
  const scale = (base - top) / max;
  return (
    <svg
      className="lm-hist"
      width={HIST_W}
      height={HIST_H}
      viewBox={`0 0 ${HIST_W} ${HIST_H}`}
      role="img"
      aria-label="A probability for every token in the vocabulary: a few are likely, most are close to zero."
    >
      {probs.map((p, i) => {
        const bh = Math.max(1, p * scale);
        return (
          <rect
            key={i}
            className="lm-hist__bar"
            x={i * STEP}
            y={base - bh}
            width={BAR}
            height={bh}
          />
        );
      })}
      <text
        className="fig-word fig-on"
        x={drawnAt * STEP + BAR / 2}
        y={top - 5}
        textAnchor="middle"
      >
        {first.options[first.pick]!.token.text.trim()}
      </text>
      <line
        className="lm-hist__axis"
        x1={0}
        x2={HIST_W}
        y1={base + 0.5}
        y2={base + 0.5}
      />
      <text className="fig-tick" x={0} y={HIST_H - 2}>
        token 0
      </text>
      <text className="fig-tick" x={HIST_W} y={HIST_H - 2} textAnchor="end">
        … {(OUTPUT_WIDTH - 1).toLocaleString()}
      </text>
    </svg>
  );
}

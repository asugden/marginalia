// Where the first vector comes from.
//
// The transformers example took its word vectors as given. BERT has to make
// its own, and it makes them from three tables added together:
//
//   token     which piece of a word this is   (30,522 rows, learned from scratch)
//   position  where in the input it sits      (512 rows, learned, not computed)
//   segment   first sentence or second        (2 rows)
//
// The top half shows the pieces: BERT does not embed words, it embeds
// WordPieces, and a word it has never seen still gets a vector because its
// pieces have. The bottom half shows the sum for one position of the
// transformers example's sentence.
//
// What is real: the split algorithm, and the token strips (the transformers
// example's 16-d vectors). What is a stand-in, and labelled so on the page: the
// piece vocabulary (a few hundred pieces, not BERT's 30,522), the position
// code (the attention page's clock code, where BERT learns a table), and the
// segment vector (drawn flat; BERT learns two).

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/index.js";
import { positionCode } from "../attention/PositionPanel.js";
import { Strip, maxAbs } from "../transformers/draw.js";
import type { Model } from "../transformers/transformer.js";
import { PIECE_COUNT, wordPieces } from "./wordpiece.js";

const TRY = ["pierogi", "unhappiness", "playing", "transformers", "stadiums", "greasy"];

export function EmbeddingIntro({ model }: { model: Model }) {
  const [si, setSi] = useState(0);
  const words = model.sentences[si]!.split(" ");
  const [word, setWord] = useState("pierogi");
  const pieces = useMemo(() => wordPieces(word), [word]);

  // The full input row, as BERT would see it: [CLS] pieces … [SEP].
  const row = useMemo(() => {
    const out: { text: string; word: number; special?: boolean }[] = [{ text: "[CLS]", word: -1, special: true }];
    words.forEach((w, k) => wordPieces(w).forEach((p) => out.push({ text: p, word: k })));
    out.push({ text: "[SEP]", word: -1, special: true });
    return out;
  }, [words]);
  // Position 2 is the first adjective in every one of the four sentences, a
  // whole word with a toy vector of its own.
  const [pos, setPos] = useState(2);
  const at = Math.min(pos, row.length - 1);
  const tok = row[at]!;

  // The three strips. The token vector is the transformers example's for that
  // word; pieces of a split word and the special tokens have no vector on this
  // page and are drawn as a hatched blank.
  const eDim = model.eDim;
  const E = tok.word >= 0 && wordPieces(words[tok.word]!).length === 1 ? model.embed.get(words[tok.word]!) ?? null : null;
  const P = positionCode(at, eDim);
  const S = new Float32Array(eDim).fill(0.12);
  const sum = E ? Float32Array.from(E, (v, d) => v + P[d]! + S[d]!) : null;
  const bound = maxAbs([E ?? P, P, S, sum ?? P]);

  const CELL = 8;
  const len = eDim * CELL;
  const gap = 56;
  const w = 4 * len + 3 * gap + 20;

  return (
    <>
      {/* ── pieces ── */}
      <div className="bt-wp">
        <div className="bt-wp__try">
          <span className="fig-label">split a word</span>
          {TRY.map((t) => (
            <Button key={t} size="sm" variant={t === word ? "primary" : "subtle"} onClick={() => setWord(t)}>
              {t}
            </Button>
          ))}
          <input
            className="bt-wp__input"
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            aria-label="A word to split into pieces"
            spellCheck={false}
          />
        </div>
        <div className="bt-wp__pieces" aria-live="polite">
          <span className="bt-wp__word">{word.toLowerCase().replace(/[^a-z]/g, "") || "…"}</span>
          <span className="bt-wp__arrow">→</span>
          {pieces.map((p, k) => (
            <span key={k} className={`bt-wp__piece${p.startsWith("##") ? " bt-wp__piece--cont" : ""}${p === "[UNK]" ? " bt-wp__piece--unk" : ""}`}>
              {p}
            </span>
          ))}
          <span className="bt-wp__count">
            {pieces.length} piece{pieces.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="tf-readout">
          BERT never sees a word. It sees <b>pieces</b>: the longest prefix of the word that is in
          its piece list, then the longest prefix of what is left (written with <b>##</b>, “I
          continue a word”), and so on. A word it was never trained on still gets a vector,
          because its pieces have vectors — the <Link to="/examples/word2vec#subword">subword</Link>{" "}
          idea from the embeddings page, built into the input. The split algorithm here is
          BERT's; the piece list is a stand-in of {PIECE_COUNT.toLocaleString()} pieces where
          BERT's has 30,522.
        </p>
      </div>

      {/* ── the sum ── */}
      <div className="at-sentences bt-emb__sentences">
        {model.sentences.map((s, k) => (
          <Button key={s} size="sm" variant={k === si ? "primary" : "subtle"} onClick={() => { setSi(k); setPos(2); }}>
            {s.split(" ").slice(1, 3).join(" ")}…
          </Button>
        ))}
      </div>
      <div className="bt-emb__row" role="group" aria-label="Choose an input position">
        {row.map((t, k) => (
          <button
            key={`${t.text}-${k}`}
            type="button"
            className={`bt-emb__tok${k === at ? " bt-emb__tok--on" : ""}${t.special ? " bt-emb__tok--special" : ""}${t.text.startsWith("##") ? " bt-emb__tok--cont" : ""}`}
            onClick={() => setPos(k)}
            aria-pressed={k === at}
          >
            <span className="bt-emb__pos">{k}</span>
            {t.text}
          </button>
        ))}
      </div>
      <div className="tf-figwrap">
        <svg className="tf-fig" viewBox={`0 0 ${w} 74`} width={w} height={74} role="img" aria-label={`Token vector plus position vector plus segment vector equals the input for position ${at}.`}>
          {(
            [
              [E, `token: ${tok.text}`, 0],
              [P, `position: ${at}`, len + gap],
              [S, "segment: sentence A", 2 * (len + gap)],
              [sum, "what enters block 1", 3 * (len + gap)],
            ] as const
          ).map(([v, label, x]) => (
            <g key={label}>
              <text className="fig-label" x={x} y={16}>
                {label}
              </text>
              {v ? (
                <Strip v={v} bound={bound} x={x} y={26} cell={CELL} thick={14} />
              ) : (
                <>
                  <rect className="bt-emb__blank" x={x} y={26} width={len - 1} height={14} />
                  <text className="bt-emb__blanktext" x={x + len / 2} y={36} textAnchor="middle">
                    {tok.special ? "its own row in BERT's table" : "a row per piece; none on this page"}
                  </text>
                </>
              )}
            </g>
          ))}
          <text className="tf-op" x={len + gap / 2} y={40} textAnchor="middle">+</text>
          <text className="tf-op" x={2 * len + 1.5 * gap} y={40} textAnchor="middle">+</text>
          <text className="tf-op" x={3 * len + 2.5 * gap} y={40} textAnchor="middle">=</text>
          <text className="tf-stack__cap" x={0} y={62}>
            transformers example's
          </text>
          <text className="tf-stack__cap" x={len + gap} y={62}>
            attention page's clocks
          </text>
          <text className="tf-stack__cap" x={2 * (len + gap)} y={62}>
            flat stand-in
          </text>
          <text className="tf-stack__cap" x={3 * (len + gap)} y={62}>
            then layer norm
          </text>
        </svg>
      </div>
      <p className="tf-readout">
        Three lookups, added. The <b>token</b> row is the{" "}
        <Link to="/examples/word2vec">embedding table</Link> — but BERT's is not word2vec's or
        anyone else's: 30,522 pieces × 768 numbers, about 23 million parameters, learned from
        random along with everything above them. The <b>position</b> row is the{" "}
        <Link to="/examples/attention">attention</Link> page's “where am I” vector, except that
        BERT does not compute it — it learns a table of 512 of them, one per position, which is
        also why BERT cannot read past 512 pieces. The <b>segment</b> row says which of two
        sentences a piece belongs to, for the pair tasks. The result goes through a layer norm and
        into block 1, and the strips in the next panel start from exactly this.
      </p>
      <p className="at-panel__note">
        Two special pieces bracket every input: <b>[CLS]</b> at position 0, whose vector the
        whole-text tasks at the bottom of this page read, and <b>[SEP]</b> between and after
        sentences. Both are rows in the same token table. The strips above use this page's
        16-number toy vectors where BERT has 768; the shapes of the three tables are BERT-base's.
      </p>
    </>
  );
}

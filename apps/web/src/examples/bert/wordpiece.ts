// WordPiece, the way BERT splits a word into pieces at inference time:
// greedy longest-match-first. Take the longest prefix of the word that is in
// the piece vocabulary; then the longest prefix of what remains, written with
// a leading "##" to say "continues a word"; and so on. If at any point no
// piece matches, the whole word becomes [UNK].
//
// The ALGORITHM here is BERT's exactly. The VOCABULARY is not: BERT's has
// 30,522 pieces learned from its training text, and shipping it would buy
// nothing on a page that only needs the mechanism to be visible. This one is a
// few hundred pieces chosen so the example sentences and a handful of
// demonstration words split legibly, with every single letter present so any
// lower-case word can be split at all. The page labels it as a stand-in.

const WHOLE = [
  // the transformer example's sentences
  "a", "an", "the", "soggy", "crowded", "stadium", "rusted", "yellow", "bridge", "crossed",
  "frozen", "river", "icy", "steep", "incline", "climbed", "shadowy", "hillside", "stubborn",
  "old", "trolley", "rattled", "narrow", "tunnel",
  // roots and common words
  "greas", "pier", "conquer", "transform", "un", "re", "pre", "dis", "over", "under", "out",
  "play", "work", "read", "walk", "talk", "light", "house", "hand", "book", "eat", "run",
  "jump", "hope", "care", "help", "friend", "kind", "quick", "slow", "happy", "sad", "new",
  "with", "self", "in", "up", "down", "on", "to", "of", "and", "is", "was", "be", "it",
  "attention", "embed", "token", "word", "sentence", "language", "model", "learn", "teach",
  "student", "class", "room", "bank", "bass", "guitar", "fish", "vault", "money",
];
const CONT = [
  "y", "ed", "ing", "s", "es", "er", "ers", "est", "ly", "tion", "ness", "ment", "able", "ful",
  "less", "ous", "al", "ive", "ity", "ize", "ist", "ism", "ship", "hood", "ogi", "og", "ings",
  "happi", "pi", "ding", "ish", "en", "ance", "ence", "ent", "ant", "ic", "ical", "ate", "ary",
  "man", "men", "s", "ted", "ted", "ers",
];
const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

export const PIECES: ReadonlySet<string> = new Set([
  ...WHOLE,
  ...LETTERS,
  ...CONT.map((p) => `##${p}`),
  ...LETTERS.map((c) => `##${c}`),
]);

export const PIECE_COUNT = PIECES.size;

/** BERT's WordpieceTokenizer, for one already-lower-cased word. */
export function wordPieces(word: string, vocab: ReadonlySet<string> = PIECES): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return [];
  const out: string[] = [];
  let start = 0;
  while (start < w.length) {
    let end = w.length;
    let cur: string | null = null;
    while (start < end) {
      let sub = w.slice(start, end);
      if (start > 0) sub = `##${sub}`;
      if (vocab.has(sub)) {
        cur = sub;
        break;
      }
      end--;
    }
    if (cur === null) return ["[UNK]"];
    out.push(cur);
    start = end;
  }
  return out;
}

// Tokens: the pieces a language model actually reads and writes.
//
// Every split and ID below is real: the output of the o200k tokenizer, the
// one OpenAI's open-weight gpt-oss models use (and GPT-4o before them). A
// leading space belongs to the token after it, which is why " books" and
// "books" are different tokens. The tokenizer's vocabulary is 200,019 pieces
// of ordinary text; gpt-oss adds special tokens (start of a message, end of a
// turn) for 201,088 in all, which is the width of its output layer.
//
// Shipping the tokenizer itself would mean a 4 MB vocabulary for a page that
// only needs the mechanism visible, so the text is fixed.

export interface Token {
  text: string;
  id: number;
}

const t = (text: string, id: number): Token => ({ text, id });

/** One merge in building a word from its letters. */
export interface Merge {
  left: string;
  right: string;
  /** The pieces after this merge. */
  pieces: string[];
  /** Its place in o200k's merge order: the vocabulary's nth piece. Early
   *  merges are the commonest pairs in the tokenizer's training text. */
  rank: number;
  /** How often the pair occurs in the fan fiction the Markov chain was
   *  counted from, and its commonest words there: a small-scale picture of
   *  why the pair was worth merging. */
  count: number;
  examples: string[];
}

/** " storybooks" from its letters to its two tokens. The merges and ranks
 *  are real, replayed from o200k; the counts are from the fan fiction. No
 *  merge joins " story" and "books", so the word stays two tokens, and the
 *  second one, with no leading space, is a different token from " books". */
export const WORD_LETTERS = [" ", "s", "t", "o", "r", "y", "b", "o", "o", "k", "s"];
export const WORD_MERGES: Merge[] = [
  { left: " ", right: "s", pieces: [" s", "t", "o", "r", "y", "b", "o", "o", "k", "s"], rank: 265, count: 1478, examples: ["she", "so", "smile", "smiled"] },
  { left: "o", right: "r", pieces: [" s", "t", "or", "y", "b", "o", "o", "k", "s"], rank: 267, count: 513, examples: ["for", "before", "door", "or"] },
  { left: " s", right: "t", pieces: [" st", "or", "y", "b", "o", "o", "k", "s"], rank: 420, count: 176, examples: ["still", "step", "standing", "stop"] },
  { left: "o", right: "k", pieces: [" st", "or", "y", "b", "o", "ok", "s"], rank: 525, count: 233, examples: ["looked", "look", "shook"] },
  { left: "o", right: "ok", pieces: [" st", "or", "y", "b", "ook", "s"], rank: 762, count: 204, examples: ["looked", "look", "shook"] },
  { left: "or", right: "y", pieces: [" st", "ory", "b", "ook", "s"], rank: 819, count: 5, examples: ["story", "history"] },
  { left: "b", right: "ook", pieces: [" st", "ory", "book", "s"], rank: 3092, count: 30, examples: ["books", "book"] },
  { left: " st", right: "ory", pieces: [" story", "book", "s"], rank: 4869, count: 4, examples: ["story"] },
  { left: "book", right: "s", pieces: [" story", "books"], rank: 20361, count: 19, examples: ["books"] },
];

/**
 * A stand-in embedding row for a token: `n` numbers in −1..1, fixed by the
 * ID. gpt-oss's real rows are 2,880 learned numbers each; these only show
 * that every ID picks out its own vector.
 */
export function embeddingRow(id: number, n = 8): number[] {
  let h = (Math.imul(id + 1, 2654435761) >>> 0) || 1;
  return Array.from({ length: n }, () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    return ((h % 2001) / 1000 - 1) * 0.9;
  });
}

/** Pieces of ordinary text in the o200k vocabulary. */
export const VOCAB = 200_019;
/** gpt-oss's output layer: the vocabulary plus its special tokens. */
export const OUTPUT_WIDTH = 201_088;

// ── One word at a time ─────────────────────────────────────────────────
// A language model continuing "The storybooks I love". Each step lists the five
// most likely next tokens with their probabilities out of the whole
// vocabulary; whatever is left is spread over every other token. The tokens
// and IDs are real; the probabilities are estimates written for the page,
// not read out of a model.

export interface LlmOption {
  token: Token;
  p: number;
}

export interface LlmStep {
  options: LlmOption[];
  pick: number;
}

export const LLM_START: Token[] = [t("The", 976), t(" story", 4869), t("books", 20361), t(" I", 357), t(" love", 3047)];

const o = (text: string, id: number, p: number): LlmOption => ({ token: t(text, id), p });

export const LLM_STEPS: LlmStep[] = [
  { options: [o(" most", 1645, 0.31), o(" are", 553, 0.24), o(" the", 290, 0.12), o(" to", 316, 0.08), o(",", 11, 0.06)], pick: 0 },
  { options: [o(" are", 553, 0.58), o(" were", 1504, 0.14), o(" have", 679, 0.07), o(",", 11, 0.05), o(" tend", 8367, 0.04)], pick: 0 },
  { options: [o(" the", 290, 0.46), o(" those", 2617, 0.12), o(" ones", 8104, 0.09), o(" often", 4783, 0.05), o(" usually", 6971, 0.04)], pick: 0 },
  { options: [o(" ones", 8104, 0.62), o(" books", 7187, 0.08), o(" kind", 3675, 0.07), o(" classics", 72966, 0.03), o(" stories", 9970, 0.03)], pick: 0 },
  { options: [o(" I", 357, 0.38), o(" that", 484, 0.27), o(" with", 483, 0.08), o(" where", 1919, 0.06), o(" written", 7582, 0.03)], pick: 0 },
  { options: [o(" read", 1729, 0.29), o(" can", 665, 0.12), o(" grew", 22839, 0.1), o(" keep", 3357, 0.06), o(" return", 622, 0.05)], pick: 0 },
  { options: [o(" as", 472, 0.31), o(" when", 1261, 0.18), o(" over", 1072, 0.12), o(" in", 306, 0.09), o(" again", 2418, 0.06)], pick: 0 },
  { options: [o(" a", 261, 0.71), o(" child", 2320, 0.06), o(" kid", 14059, 0.04), o(" teenager", 59803, 0.03), o(" an", 448, 0.02)], pick: 0 },
  { options: [o(" kid", 14059, 0.44), o(" child", 2320, 0.33), o(" teenager", 59803, 0.09), o(" teen", 16002, 0.05), o(" girl", 8881, 0.02)], pick: 0 },
  { options: [o(".", 13, 0.56), o(",", 11, 0.24), o(" and", 326, 0.06), o("!", 0, 0.02), o(" —", 2733, 0.02)], pick: 0 },
];

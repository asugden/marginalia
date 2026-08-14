// Winnowing fingerprints — find where a candidate text reproduces content
// from a corpus, tolerantly enough to survive light editing and reordering.
//
// The construction is the standard one from Schleimer, Wilkerson & Aiken,
// "Winnowing: Local Algorithms for Document Fingerprinting" (SIGMOD 2003),
// the algorithm behind MOSS:
//
//   1. Normalize the text (fold case, collapse whitespace) and keep a map
//      back to original offsets, so a match can be reported against the
//      caller's coordinates.
//   2. Hash every k-gram (k consecutive characters) with a rolling hash.
//   3. Slide a window of w consecutive hashes and keep the minimum in each.
//      This guarantees any shared substring of length >= k + w - 1 shares at
//      least one fingerprint, while storing only ~1/w of the hashes.
//
// Why not a diff or an edit-distance alignment: those are O(n*m) and answer a
// different question ("how do these two texts differ" rather than "does this
// text contain material from any of these"). Winnowing is near-linear and
// matches even when the reproduced passage has been moved or lightly reworded.
//
// This package is deliberately dependency-free and domain-agnostic.

/** Default k-gram size, in normalized characters. */
export const DEFAULT_K = 25;
/** Default winnowing window, in k-grams. */
export const DEFAULT_W = 12;

export interface NormalizedText {
  /** Case-folded, whitespace-collapsed text. */
  text: string;
  /** `map[i]` is the offset in the ORIGINAL string of normalized char `i`. */
  map: number[];
}

/**
 * Fold case and collapse whitespace runs to a single space, recording where
 * each surviving character came from. Leading whitespace is dropped.
 *
 * Normalizing matters because the whole point is to catch text that was
 * retyped rather than copied byte-for-byte: line wrapping, double spaces
 * after a period, and capitalisation at a new sentence start all change
 * without changing the content.
 */
export function normalize(input: string): NormalizedText {
  let text = "";
  const map: number[] = [];
  let inSpace = true; // true at the start so leading whitespace is dropped
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      if (!inSpace) {
        text += " ";
        map.push(i);
        inSpace = true;
      }
      continue;
    }
    text += ch.toLowerCase();
    map.push(i);
    inSpace = false;
  }
  // Drop a single trailing space so it can't anchor a match.
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

/**
 * Rolling hashes of every k-gram. `out[i]` covers `text[i .. i+k-1]`.
 * Uses a base-256 polynomial hash mod 2^32 via Math.imul, which stays exact
 * in 32-bit space and needs no bigint.
 */
function kgramHashes(text: string, k: number): Uint32Array {
  if (text.length < k) return new Uint32Array(0);
  const count = text.length - k + 1;
  const out = new Uint32Array(count);
  const BASE = 257;
  // highPow = BASE^(k-1) mod 2^32, for removing the outgoing character.
  let highPow = 1;
  for (let i = 0; i < k - 1; i++) highPow = Math.imul(highPow, BASE);
  let h = 0;
  for (let i = 0; i < k; i++) h = Math.imul(h, BASE) + text.charCodeAt(i);
  out[0] = h >>> 0;
  for (let i = 1; i < count; i++) {
    h = h - Math.imul(text.charCodeAt(i - 1), highPow);
    h = Math.imul(h, BASE) + text.charCodeAt(i + k - 1);
    out[i] = h >>> 0;
  }
  return out;
}

export interface Fingerprint {
  hash: number;
  /** Start offset of the k-gram, in normalized coordinates. */
  pos: number;
}

/**
 * Winnow: in each window of `w` consecutive k-gram hashes keep the minimum,
 * breaking ties toward the rightmost so the same choice is made in both texts
 * (the property that makes the guarantee hold).
 */
export function fingerprints(
  text: string,
  k: number = DEFAULT_K,
  w: number = DEFAULT_W,
): Fingerprint[] {
  const hashes = kgramHashes(text, k);
  if (hashes.length === 0) return [];
  if (hashes.length <= w) {
    // Short text: one window, one fingerprint.
    let min = 0;
    for (let i = 1; i < hashes.length; i++) {
      if (hashes[i]! <= hashes[min]!) min = i;
    }
    return [{ hash: hashes[min]!, pos: min }];
  }
  const out: Fingerprint[] = [];
  let lastPos = -1;
  for (let start = 0; start + w <= hashes.length; start++) {
    let min = start;
    for (let i = start + 1; i < start + w; i++) {
      if (hashes[i]! <= hashes[min]!) min = i;
    }
    if (min !== lastPos) {
      out.push({ hash: hashes[min]!, pos: min });
      lastPos = min;
    }
  }
  return out;
}

/** A contiguous span of the candidate that reproduces corpus material. */
export interface MatchSpan {
  /** Start offset in the ORIGINAL candidate string. */
  start: number;
  /** End offset (exclusive) in the ORIGINAL candidate string. */
  end: number;
  /** Which corpus entry it matched (index into the `corpus` array). */
  sourceIndex: number;
}

export interface MatchOptions {
  k?: number;
  w?: number;
  /**
   * Minimum length, in normalized characters, for a span to be reported.
   * Short coincidental overlaps are dropped entirely rather than reported
   * weakly — a false positive is far more costly than a miss.
   */
  minMatchLength?: number;
}

/** Index one corpus entry for repeated querying. */
interface CorpusEntry {
  norm: NormalizedText;
  /** hash → normalized positions where it occurs. */
  index: Map<number, number[]>;
}

function buildCorpusEntry(source: string, k: number, w: number): CorpusEntry {
  const norm = normalize(source);
  const index = new Map<number, number[]>();
  for (const fp of fingerprints(norm.text, k, w)) {
    const list = index.get(fp.hash);
    if (list) list.push(fp.pos);
    else index.set(fp.hash, [fp.pos]);
  }
  return { norm, index };
}

/**
 * Extend a seed match as far as it goes in both directions, comparing the
 * normalized texts directly. Winnowing tells us *where* to look; this
 * recovers the actual extent, so a fully-reproduced paragraph reports as one
 * span rather than a scatter of k-gram hits.
 */
function extendMatch(
  cand: string,
  candPos: number,
  src: string,
  srcPos: number,
  k: number,
): { start: number; end: number } {
  let start = candPos;
  let sStart = srcPos;
  while (start > 0 && sStart > 0 && cand[start - 1] === src[sStart - 1]) {
    start--;
    sStart--;
  }
  let end = candPos + k;
  let sEnd = srcPos + k;
  while (end < cand.length && sEnd < src.length && cand[end] === src[sEnd]) {
    end++;
    sEnd++;
  }
  return { start, end };
}

/**
 * Find spans of `candidate` that reproduce material from any entry in
 * `corpus`. Returns spans in original-candidate coordinates, sorted by start,
 * non-overlapping (longest wins on conflict).
 *
 * Cost is near-linear in the total input size: one pass to index the corpus,
 * one to fingerprint the candidate, plus extension work proportional to what
 * actually matched.
 */
export function findMatches(
  candidate: string,
  corpus: string[],
  opts: MatchOptions = {},
): MatchSpan[] {
  const k = opts.k ?? DEFAULT_K;
  const w = opts.w ?? DEFAULT_W;
  const minLen = opts.minMatchLength ?? k;
  if (!candidate || corpus.length === 0) return [];

  const cand = normalize(candidate);
  if (cand.text.length < k) return [];
  const entries = corpus.map((s) => buildCorpusEntry(s, k, w));

  const raw: Array<MatchSpan & { normLen: number }> = [];
  for (const fp of fingerprints(cand.text, k, w)) {
    for (let ci = 0; ci < entries.length; ci++) {
      const hits = entries[ci]!.index.get(fp.hash);
      if (!hits) continue;
      for (const srcPos of hits) {
        const { start, end } = extendMatch(
          cand.text,
          fp.pos,
          entries[ci]!.norm.text,
          srcPos,
          k,
        );
        const normLen = end - start;
        if (normLen < minLen) continue;
        // Map back to original coordinates. `map[end-1]+1` rather than
        // `map[end]` so the span covers the final character itself and stays
        // valid when the match runs to the very end of the text.
        const origStart = cand.map[start] ?? 0;
        const origEnd = (cand.map[end - 1] ?? candidate.length - 1) + 1;
        raw.push({ start: origStart, end: origEnd, sourceIndex: ci, normLen });
      }
    }
  }
  if (raw.length === 0) return [];

  // Resolve overlaps: prefer the longest span, then earliest.
  raw.sort((a, b) => b.normLen - a.normLen || a.start - b.start);
  const kept: MatchSpan[] = [];
  for (const span of raw) {
    const overlaps = kept.some((s) => span.start < s.end && s.start < span.end);
    if (!overlaps) {
      kept.push({ start: span.start, end: span.end, sourceIndex: span.sourceIndex });
    }
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

// Settings for the coverage report, which answers a different question from
// `findMatches` and therefore wants different thresholds.
//
// `findMatches` is used to MARK a student's text, so it
// runs strict: a false span there is an unearned accusation. Coverage is only
// ever displayed beside the source passage it describes, where a human can see
// what matched, so it can afford to be sensitive enough to notice a passage
// that was reworded rather than copied.
//
// k=15 is the empirical floor. Below it, fragments like "s whenever " start
// matching — coincidental overlap that means nothing.
const COVERAGE_K = 15;
const COVERAGE_W = 6;

/**
 * How much of `source` survives in `candidate`, as a fraction of the source's
 * length, split by fidelity:
 *
 *   verbatim  — still present as literal text (allowing for reformatting)
 *   nearMatch — not literal any more, but the candidate still covers the same
 *               ground in the same vocabulary
 *
 * Both are 0..1 and are reported independently (they do not sum to 1). This
 * powers the "40% verbatim / 35% near-match" breakdown: a passage that has
 * been reworded rather than copied shows low verbatim and high near-match,
 * which is the pattern worth a human look.
 *
 * **Limitation, and it is a real one:** this is lexical. A genuine paraphrase
 * that swaps the vocabulary out ("delegates authority" → "hands decision-making
 * power") scores near zero on both figures. Rewriting that thorough is not
 * detectable by these means, and the numbers should never be presented as
 * though absence of overlap proves absence of influence.
 */
export function coverage(
  source: string,
  candidate: string,
): { verbatim: number; nearMatch: number } {
  if (!source || !candidate) return { verbatim: 0, nearMatch: 0 };
  const srcNorm = normalize(source);
  if (srcNorm.text.length === 0) return { verbatim: 0, nearMatch: 0 };

  // Verbatim: match the SOURCE against the candidate so spans land in source
  // coordinates, letting us measure how much of the source is accounted for.
  const spans = findMatches(source, [candidate], {
    k: COVERAGE_K,
    w: COVERAGE_W,
    minMatchLength: COVERAGE_K,
  });
  let matched = 0;
  for (const s of spans) matched += s.end - s.start;
  const verbatim = Math.min(1, matched / source.length);

  // Near-match: content-word overlap. Blunt on purpose — it answers "is this
  // material still here in slightly different words" without pretending to be
  // semantic similarity. Reported as the portion NOT already counted verbatim.
  const near = wordOverlap(srcNorm.text, normalize(candidate).text);
  return {
    verbatim,
    nearMatch: Math.max(0, Math.min(1, near - verbatim)),
  };
}

/**
 * Fraction of `source` content words that also appear in `candidate`.
 * Only ever shown next to the source text itself, never used to reach a
 * conclusion on its own.
 */
function wordOverlap(src: string, cand: string): number {
  const words = (s: string) =>
    s.split(" ").filter((t) => t.replace(/[^a-z0-9]/g, "").length > 3);
  const srcWords = words(src);
  if (srcWords.length === 0) return 0;
  const candSet = new Set(words(cand));
  let hit = 0;
  for (const t of srcWords) if (candSet.has(t)) hit++;
  return hit / srcWords.length;
}

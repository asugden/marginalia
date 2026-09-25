// The origin model shared by every surface that records where text came from.
//
//   human     typed by the student
//   llm       came from an AI conversation (inserted, pasted from, or retyped)
//   pasted    arrived via the clipboard from outside the document
//   edited    a browser spellcheck / autocorrect / grammar-tool replacement
//   provided  was already there when the student started: instructor-supplied
//             starter material. Never produced by the writing tool, which has
//             no starter text; used by surfaces that do.
//
// Labels and colours belong to each surface, but the facts are the same
// everywhere, so the model lives here once.

export type Origin = "human" | "llm" | "pasted" | "edited" | "provided";

/** One run of identical origins. A document's origins are a list of runs
 *  whose lengths sum to its text length. */
export interface OriginRun<O extends string = Origin> {
  origin: O;
  length: number;
}

/** Expand RLE runs to a flat per-character array of exactly `len` entries.
 *  Short runs pad with `pad` (human by default); long runs truncate. */
export function expandRuns<O extends string>(
  runs: ReadonlyArray<OriginRun<O>>,
  len: number,
  pad: O = "human" as O,
): O[] {
  const out: O[] = [];
  for (const r of runs) {
    for (let i = 0; i < r.length && out.length < len; i++) out.push(r.origin);
  }
  while (out.length < len) out.push(pad);
  return out.slice(0, len);
}

/** Collapse a per-character origin array into runs. */
export function encodeRuns<O extends string>(origins: ReadonlyArray<O>): OriginRun<O>[] {
  const runs: OriginRun<O>[] = [];
  for (const o of origins) {
    const last = runs[runs.length - 1];
    if (last && last.origin === o) last.length += 1;
    else runs.push({ origin: o, length: 1 });
  }
  return runs;
}

/** Append `length` characters of `origin` to a run list, merging with the
 *  last run when it matches. Mutates and returns `runs`. */
export function pushRun<O extends string>(runs: OriginRun<O>[], origin: O, length: number): OriginRun<O>[] {
  if (length <= 0) return runs;
  const last = runs[runs.length - 1];
  if (last && last.origin === origin) last.length += length;
  else runs.push({ origin, length });
  return runs;
}

/** The runs covering [from, to) of a run list. */
export function sliceRuns<O extends string>(
  runs: ReadonlyArray<OriginRun<O>>,
  from: number,
  to: number,
): OriginRun<O>[] {
  const out: OriginRun<O>[] = [];
  let pos = 0;
  for (const r of runs) {
    const start = Math.max(pos, from);
    const end = Math.min(pos + r.length, to);
    if (end > start) pushRun(out, r.origin, end - start);
    pos += r.length;
    if (pos >= to) break;
  }
  return out;
}

/**
 * Apply one edit to a run list: remove `removed` characters at `offset`, then
 * insert `inserted` there. Returns a new list. This is the live-editor
 * counterpart of the server's replay, for surfaces (like a plain code editor)
 * that keep origins beside the text rather than as marks inside it.
 */
export function spliceRuns<O extends string>(
  runs: ReadonlyArray<OriginRun<O>>,
  offset: number,
  removed: number,
  inserted: ReadonlyArray<OriginRun<O>>,
): OriginRun<O>[] {
  const total = runs.reduce((s, r) => s + r.length, 0);
  const at = Math.max(0, Math.min(offset, total));
  const end = Math.max(at, Math.min(at + removed, total));
  const out = sliceRuns(runs, 0, at);
  for (const r of inserted) pushRun(out, r.origin, r.length);
  for (const r of sliceRuns(runs, end, total)) pushRun(out, r.origin, r.length);
  return out;
}

/** Characters per origin. Every origin key is present, so surfaces compare
 *  like with like — absolute counts, never shares. */
export function countOrigins<O extends string>(
  runs: ReadonlyArray<OriginRun<O>>,
): Record<Origin, number> {
  const out: Record<Origin, number> = { human: 0, llm: 0, pasted: 0, edited: 0, provided: 0 };
  for (const r of runs) {
    if (r.origin in out) out[r.origin as Origin] += r.length;
  }
  return out;
}

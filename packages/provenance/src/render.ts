// Compute a frozen provenance render from an authoritative edit-event log.
//
// This is the server-side half of provenance, shared by every surface that
// records where text came from (the writing tool, code notebooks). Improve
// retype detection or the audit here and every surface gets it.
//
// Replay model: maintain an array of per-character origins. Walk events
// in client_seq order:
//   insert / paste / llm_insert  → splice `length` chars of the event's
//   / replace                      origin in at `offset`.
//   move                         → splice in the origins the text carried
//                                  where it was cut from (verified below).
//   delete                       → remove `length` chars at `offset`.
//
// A spellcheck/autocorrect/Grammarly word swap is logged as a `delete` (the
// old word) followed by a `replace` (the new word, origin "edited"); replay
// treats `replace` as an insert of the event's origin, so the two events
// compose into a clean in-place swap.
//
// We track ORIGIN per position, not the characters themselves — the actual
// text comes from the caller's current plain-text projection. If the
// replayed length and text length drift (e.g. a lost event batch), we
// reconcile so runs always sum to text.length and never crash a viewer over
// a data gap — and record the drift in the audit block rather than silently
// papering over it.
//
// Three derived outputs, all computed here from the same log:
//   - retype detection: human-typed text that reproduces something imported
//     earlier (see deriveRetyped) takes the origin of what it reproduces.
//   - `pastes`: an inventory of what was imported and how much survives.
//   - `audit`: coherence + coverage facts about the log itself.

import { findMatches, coverage } from "@marginalia/text-similarity";
import { encodeRuns, expandRuns, type Origin, type OriginRun } from "./origins.js";

export type LogEventKind = "insert" | "delete" | "paste" | "llm_insert" | "replace" | "move";

/** One edit, in the shape every surface's log is mapped into. */
export interface LogEvent<O extends string = Origin> {
  kind: LogEventKind;
  offset: number;
  length: number;
  /** Inserted text, or for a delete the removed text. */
  text: string | null;
  origin: O | null;
  clientSeq: number;
  /** Server receipt time, ms. */
  createdAt: number;
  /** For a move: the origins the text carried where it was cut from. */
  restoredOrigins?: ReadonlyArray<OriginRun<O>> | null;
}

/**
 * One clipboard import, with how much of it survives in the final text.
 *
 * Shown to instructors as history: pastes are recorded even when the pasted
 * text was later deleted or rewritten, because "this was imported and then
 * reworked" is exactly the thing a per-character origin map cannot show.
 */
export interface PasteRecord<O extends string = Origin> {
  /** client_seq of the paste event, for stable ordering/keys. */
  seq: number;
  /** When it happened (server receipt time, ms). */
  at: number;
  /** The imported text. Truncated for transport; see MAX_PASTE_SAMPLE. */
  sample: string;
  /** Full length in characters, before truncation. */
  length: number;
  /** 0..1 — how much of it is still present as literal text. */
  verbatim: number;
  /** 0..1 — how much survives reworded rather than literal. */
  nearMatch: number;
  /** Where the import came from, when the surface distinguishes sources
   *  (e.g. a paste of the tutor's text vs. from outside). */
  origin?: O;
}

/**
 * Facts about the event log itself. Descriptive only: every field is a
 * measurement, never a judgement. Viewers pair each with its ordinary
 * explanation.
 */
export interface ProvenanceAudit {
  /** Distinct working sessions (gaps > SESSION_GAP_MS split them). */
  sessions: number;
  /** First → last event, ms. */
  spanMs: number;
  /** Sum of within-session durations, ms. */
  activeMs: number;
  /** Longest gap between consecutive events, ms. */
  longestGapMs: number;
  /** 0..1 — share of surviving text that arrived in the final session. */
  finalSessionShare: number;
  /**
   * |replayed length - actual text length|. Non-zero means the log doesn't
   * fully reconstruct the text — usually a dropped batch on a flaky
   * network. Reported above a threshold, never interpreted here.
   */
  lengthDrift: number;
  /** Bursts of typing at a physically implausible sustained rate. */
  fastBursts: number;
  /** Events whose client ordering contradicts server arrival order. */
  orderingAnomalies: number;
  /** Pastes whose claimed "move" could not be verified against a prior cut. */
  unverifiedMoves: number;
}

export interface ProvenanceRender<O extends string = Origin> {
  /** Schema version for the frozen blob. Absent = pre-v2. */
  v?: number;
  text: string;
  runs: OriginRun<O>[];
  pastes?: PasteRecord<O>[];
  audit?: ProvenanceAudit;
}

/** Current render schema version. */
export const RENDER_VERSION = 2;

/** Gap that ends a working session. */
const SESSION_GAP_MS = 15 * 60 * 1000;
/** Truncation for stored paste samples — enough to recognise, bounded. */
const MAX_PASTE_SAMPLE = 2_000;
/**
 * Minimum contiguous match, in characters, before typed text is re-marked.
 * Deliberately generous: common phrasing recurs naturally, and a short
 * coincidental overlap is not evidence of anything.
 */
export const MIN_RETYPE_MATCH = 40;
/**
 * Sustained input rate treated as physically implausible (chars/minute).
 * Well above any human typist, so the ordinary causes are dictation, an IME,
 * autocomplete, or an assistive device — not wrongdoing.
 */
const IMPLAUSIBLE_CPM = 900;
/** Minimum chars in a burst before its rate is worth measuring at all. */
const MIN_BURST_CHARS = 60;

/** Text that retyped content is compared against, and the origin a match
 *  takes. */
export interface CorpusEntry<O extends string = Origin> {
  text: string;
  origin: O;
  /**
   * Only text typed strictly after this moment (ms, server time) can match.
   * Set it for sources that exist independently of the student's typing —
   * an AI reply, say — so that text the student wrote *before* the source
   * existed can never be attributed to it. Absent = no time bound, which is
   * the right reading for an event in the log (it is its own timestamp).
   */
  after?: number;
}

export interface RenderOptions<O extends string = Origin> {
  /**
   * The origin a retyped match against an imported event's text takes. The
   * writing tool maps every import to "pasted" (it is the same fact: content
   * entered through the clipboard or chat panel). A surface that wants
   * AI-sourced text kept distinct maps llm_insert to "llm".
   */
  corpusOrigin?: (ev: LogEvent<O>) => O;
  /** Further retype sources that are not events — e.g. an AI tutor's replies,
   *  which a student can read and type out without ever pasting. */
  extraCorpus?: ReadonlyArray<CorpusEntry<O>>;
  /** Text present before the first event (starter material), with its
   *  origin. Replayed first and never counted as activity in the audit. */
  baseline?: { length: number; origin: O } | null;
  /** Event kinds listed in the paste inventory. Default ["paste"]. */
  importKinds?: ReadonlyArray<LogEventKind>;
  /** Record each import's origin on its PasteRecord. Default false. */
  labelImports?: boolean;
}

const BASELINE_SEQ = -1;

interface ReplayResult<O extends string> {
  origins: O[];
  /** Per-character source seq: which event contributed each position. */
  seqs: number[];
}

/**
 * Replay the log into per-character origins. Also records which event
 * contributed each surviving character, so we can attribute the final text to
 * working sessions without a second pass.
 */
function replayOrigins<O extends string>(
  events: ReadonlyArray<LogEvent<O>>,
  baseline: { length: number; origin: O } | null | undefined,
): ReplayResult<O> {
  const origins: O[] = baseline ? new Array<O>(baseline.length).fill(baseline.origin) : [];
  // Baseline positions carry BASELINE_SEQ: they belong to no working session.
  const seqs: number[] = baseline ? new Array<number>(baseline.length).fill(BASELINE_SEQ) : [];
  for (const ev of events) {
    const off = Math.max(0, Math.min(ev.offset, origins.length));
    if (ev.kind === "delete") {
      const len = Math.max(0, Math.min(ev.length, origins.length - off));
      origins.splice(off, len);
      seqs.splice(off, len);
      continue;
    }
    const len = Math.max(0, ev.length);
    if (len === 0) continue;

    // A verified move restores the origins the text carried at its source, so
    // rearranging your own work doesn't relabel it as imported.
    let inserted: O[];
    if (ev.kind === "move") {
      const runs = ev.restoredOrigins;
      inserted = runs ? expandRuns(runs, len) : new Array<O>(len).fill("pasted" as O);
    } else {
      const origin: O = ev.origin ?? ("human" as O);
      inserted = new Array<O>(len).fill(origin);
    }
    origins.splice(off, 0, ...inserted);
    seqs.splice(off, 0, ...new Array<number>(len).fill(ev.clientSeq));
  }
  return { origins, seqs };
}

/**
 * Verify each `move` against the log: the text must actually match something
 * cut or copied from this document shortly before. Without this check, "it was
 * a move" would be an unfalsifiable claim from the client and therefore the
 * cheapest way to launder any origin.
 *
 * Returns the number of moves that could NOT be verified.
 */
function verifyMoves(events: ReadonlyArray<LogEvent<string>>): number {
  let unverified = 0;
  const recentCuts: Array<{ norm: string; at: number }> = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  for (const ev of events) {
    if (ev.kind === "delete" && ev.text) {
      recentCuts.push({ norm: norm(ev.text), at: ev.createdAt });
      if (recentCuts.length > 32) recentCuts.shift();
      continue;
    }
    if (ev.kind !== "move") continue;
    const target = norm(ev.text ?? "");
    // A copy (not a cut) leaves no delete event, so a move with no matching
    // cut is only *unverified*, not proof of anything. We still count it, and
    // we still trust the restored origins — copying your own paragraph and
    // pasting it twice is completely ordinary.
    const found = target.length > 0 && recentCuts.some((c) => c.norm === target);
    if (!found) unverified++;
  }
  return unverified;
}

/**
 * Re-mark human-typed text that reproduces imported content with the origin
 * of what it reproduces. Runs server-side at mint time because the client
 * cannot be the authority on this: the whole point is to catch text that was
 * imported and then retyped to look composed.
 *
 * Note what this does and does not claim. It says the content arrived from
 * that source. It does not say where clipboard content came from before that
 * — a model, a previous draft, or the student's own notes are
 * indistinguishable here, and the paste inventory is shown alongside so a
 * reader can tell.
 */
function deriveRetyped<O extends string>(
  text: string,
  origins: O[],
  corpus: ReadonlyArray<CorpusEntry<O>>,
  /** When each position was written (ms), for time-bounded sources. A
   *  position with no known time never matches a time-bounded source. */
  writtenAt: ReadonlyArray<number>,
): void {
  if (corpus.length === 0 || !text) return;
  // Only text currently attributed to the student's own typing is considered.
  // Everything else is already attributed to a non-human source.
  const spans = findMatches(
    text,
    corpus.map((c) => c.text),
    { minMatchLength: MIN_RETYPE_MATCH },
  );
  for (const span of spans) {
    const source = corpus[span.sourceIndex];
    const to = source?.origin ?? ("pasted" as O);
    const after = source?.after;
    for (let i = span.start; i < span.end && i < origins.length; i++) {
      if (after !== undefined && !((writtenAt[i] ?? -Infinity) > after)) continue;
      if (origins[i] === "human") origins[i] = to;
    }
  }
}

/** Build the paste inventory, with survival measured against the final text. */
function buildPastes<O extends string>(
  events: ReadonlyArray<LogEvent<O>>,
  text: string,
  kinds: ReadonlyArray<LogEventKind>,
  label: boolean,
): PasteRecord<O>[] {
  const out: PasteRecord<O>[] = [];
  for (const ev of events) {
    // Moves are internal rearrangement, not imports — excluded by design.
    if (!kinds.includes(ev.kind) || !ev.text) continue;
    const { verbatim, nearMatch } = coverage(ev.text, text);
    out.push({
      seq: ev.clientSeq,
      at: ev.createdAt,
      sample:
        ev.text.length > MAX_PASTE_SAMPLE ? ev.text.slice(0, MAX_PASTE_SAMPLE) + "…" : ev.text,
      length: ev.text.length,
      verbatim,
      nearMatch,
      ...(label && ev.origin ? { origin: ev.origin } : {}),
    });
  }
  return out;
}

/** Measure the shape of the working process. Descriptive only. */
function buildAudit(
  events: ReadonlyArray<LogEvent<string>>,
  seqs: number[],
  lengthDrift: number,
  unverifiedMoves: number,
): ProvenanceAudit {
  const audit: ProvenanceAudit = {
    sessions: 0,
    spanMs: 0,
    activeMs: 0,
    longestGapMs: 0,
    finalSessionShare: 0,
    lengthDrift,
    fastBursts: 0,
    orderingAnomalies: 0,
    unverifiedMoves,
  };
  if (events.length === 0) return audit;

  // Sessions and gaps.
  let sessions = 1;
  let activeMs = 0;
  let longestGap = 0;
  let lastSessionStartSeq = events[0]!.clientSeq;
  let sessionStartAt = events[0]!.createdAt;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i]!.createdAt - events[i - 1]!.createdAt;
    if (gap > longestGap) longestGap = gap;
    if (gap > SESSION_GAP_MS) {
      sessions++;
      activeMs += events[i - 1]!.createdAt - sessionStartAt;
      sessionStartAt = events[i]!.createdAt;
      lastSessionStartSeq = events[i]!.clientSeq;
    }
    // Ordering: client sequence is monotonic by construction, so a batch that
    // arrives with earlier server time than its predecessor is incoherent.
    if (events[i]!.createdAt < events[i - 1]!.createdAt) {
      audit.orderingAnomalies++;
    }
  }
  activeMs += events[events.length - 1]!.createdAt - sessionStartAt;

  audit.sessions = sessions;
  audit.spanMs = events[events.length - 1]!.createdAt - events[0]!.createdAt;
  audit.activeMs = activeMs;
  audit.longestGapMs = longestGap;

  // Share of surviving text contributed by the final session. Baseline text
  // (starter material) is nobody's session and is excluded from both sides.
  const worked = seqs.filter((s) => s !== BASELINE_SEQ);
  if (worked.length > 0) {
    let fromLast = 0;
    for (const s of worked) if (s >= lastSessionStartSeq) fromLast++;
    audit.finalSessionShare = fromLast / worked.length;
  }

  // Implausible sustained typing.
  //
  // Measured ONLY over single-character insert events — one keystroke, one
  // event, so elapsed time between them is real evidence about typing rate.
  // A multi-character insert (autocomplete accepting a word, an IME composing
  // a phrase, a mobile keyboard, a swipe) would otherwise divide its whole
  // length by one inter-event gap and manufacture an impossible rate out of
  // perfectly ordinary typing. That is precisely the false positive this
  // system must not produce, so those events end a burst instead of feeding
  // one. The cost is that we under-detect; that is the correct trade.
  let burstChars = 0;
  let burstStart = 0;
  const flushBurst = (endAt: number) => {
    if (burstChars >= MIN_BURST_CHARS) {
      const elapsed = endAt - burstStart;
      // Need a real interval to divide by. A zero/negative span means clock
      // skew or coalesced timestamps, which is a timestamp problem (counted
      // separately as an ordering anomaly), not evidence about typing.
      if (elapsed > 0) {
        const cpm = burstChars / (elapsed / 60_000);
        if (cpm > IMPLAUSIBLE_CPM) audit.fastBursts++;
      }
    }
    burstChars = 0;
  };
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (ev.kind !== "insert" || ev.length !== 1) {
      flushBurst(ev.createdAt);
      continue;
    }
    if (burstChars === 0) burstStart = ev.createdAt;
    burstChars += ev.length;
    const next = events[i + 1];
    // A pause of >5s ends the burst: we measure sustained rate, not the
    // instantaneous gap between two adjacent keystrokes.
    if (!next || next.createdAt - ev.createdAt > 5_000) {
      flushBurst(ev.createdAt);
    }
  }
  flushBurst(events[events.length - 1]!.createdAt);

  return audit;
}

/**
 * Build the frozen render. `text` is the current plain text; `events` is the
 * full event log for that text in client_seq order.
 *
 * PRIVACY: deleted text is read here (as fingerprint corpus and to verify
 * moves) but is never written into the returned render. Only `pastes[].sample`
 * carries source text, and only for clipboard *imports* — text the student
 * typed and then deleted stays out of the snapshot entirely. The field list
 * below is the enforcement point.
 */
export function buildRender<O extends string = Origin>(
  text: string,
  events: ReadonlyArray<LogEvent<O>>,
  opts: RenderOptions<O> = {},
): ProvenanceRender<O> {
  const unverifiedMoves = verifyMoves(events);
  const { origins, seqs } = replayOrigins(events, opts.baseline);

  // Reconcile replay length against the real text, recording the drift.
  const lengthDrift = Math.abs(origins.length - text.length);
  let finalOrigins = origins;
  let finalSeqs = seqs;
  if (origins.length > text.length) {
    finalOrigins = origins.slice(0, text.length);
    finalSeqs = seqs.slice(0, text.length);
  } else if (origins.length < text.length) {
    const pad = text.length - origins.length;
    finalOrigins = origins.concat(new Array<O>(pad).fill("human" as O));
    finalSeqs = seqs.concat(new Array<number>(pad).fill(0));
  }

  // Corpus for retype detection: everything that entered via the clipboard or
  // an AI panel, plus any caller-supplied sources. Deleted-then-retyped
  // drafting is NOT in scope — rewriting your own sentence is writing, not
  // importing.
  const corpusOrigin = opts.corpusOrigin ?? (() => "pasted" as O);
  const corpus: CorpusEntry<O>[] = [];
  for (const ev of events) {
    if ((ev.kind === "paste" || ev.kind === "llm_insert") && ev.text) {
      corpus.push({ text: ev.text, origin: corpusOrigin(ev) });
    }
  }
  for (const c of opts.extraCorpus ?? []) if (c.text) corpus.push(c);
  const timeBySeq = new Map(events.map((e) => [e.clientSeq, e.createdAt]));
  const writtenAt = finalSeqs.map((s) => timeBySeq.get(s) ?? -Infinity);
  deriveRetyped(text, finalOrigins, corpus, writtenAt);

  return {
    v: RENDER_VERSION,
    text,
    runs: encodeRuns(finalOrigins),
    pastes: buildPastes(events, text, opts.importKinds ?? ["paste"], opts.labelImports ?? false),
    audit: buildAudit(events, finalSeqs, lengthDrift, unverifiedMoves),
  };
}

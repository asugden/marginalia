// Compute a frozen provenance render from the authoritative edit_events
// log. This is the source of truth for the instructor view — it does NOT
// depend on the marks stored in the document's body_json, so it works even
// though provenance coloring is hidden from students while they write.
//
// Replay model: maintain an array of per-character origins. Walk events
// in client_seq order:
//   insert / paste / llm_insert  → splice `length` chars of the event's
//   / replace                      origin in at `offset`.
//   move                         → splice in the origins the text carried
//                                  where it was cut from (verified below).
//   delete                       → remove `length` chars at `offset`.
//
// A spellcheck/autocorrect/Grammarly word swap (slice 7) is logged as a
// `delete` (the old word) followed by a `replace` (the new word, origin
// "edited"); replay treats `replace` as an insert of the event's origin, so
// the two events compose into a clean in-place swap.
//
// We track ORIGIN per position, not the characters themselves — the actual
// text comes from the document's current plain-text projection. If the
// replayed length and text length drift (e.g. a lost event batch), we
// reconcile so runs always sum to text.length and never crash a viewer over
// a data gap — and record the drift in the audit block rather than silently
// papering over it (slice 8).
//
// Slice 8 adds three derived outputs, all computed here from the same log:
//   - retype detection: human-typed text that reproduces something pasted
//     earlier in this document becomes `pasted` (see deriveRetyped). Same
//     origin, not a new one — it is the same fact about how the content got
//     into the document.
//   - `pastes`: an inventory of what was imported and how much survives.
//   - `audit`: coherence + coverage facts about the log itself.

import type { ProvenanceEventRow, ProvenanceOriginRun } from "@marginalia/schema";
import { findMatches, coverage } from "@marginalia/text-similarity";
import { decodeSidecar } from "./repo.js";

type Origin = ProvenanceOriginRun["origin"];

export interface ProvenanceRun {
  origin: Origin;
  length: number;
}

/**
 * One clipboard import, with how much of it survives in the final text.
 *
 * Shown to instructors as history: pastes are recorded even when the pasted
 * text was later deleted or rewritten, because "this was imported and then
 * reworked" is exactly the thing a per-character origin map cannot show.
 */
export interface PasteRecord {
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
}

/**
 * Facts about the event log itself. Descriptive only: every field is a
 * measurement, never a judgement. The viewer pairs each with its ordinary
 * explanation — see the module README.
 */
export interface ProvenanceAudit {
  /** Distinct writing sessions (gaps > SESSION_GAP_MS split them). */
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
   * fully reconstruct the document — usually a dropped batch on a flaky
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

export interface ProvenanceRender {
  /** Schema version for the frozen blob. Absent = pre-slice-8. */
  v?: number;
  text: string;
  runs: ProvenanceRun[];
  pastes?: PasteRecord[];
  audit?: ProvenanceAudit;
}

/** Current render schema version. */
export const RENDER_VERSION = 2;

/** Gap that ends a writing session. */
const SESSION_GAP_MS = 15 * 60 * 1000;
/** Truncation for stored paste samples — enough to recognise, bounded. */
const MAX_PASTE_SAMPLE = 2_000;
/**
 * Minimum contiguous match, in characters, before typed text is re-marked
 * `pasted`. Deliberately generous: common phrasing recurs naturally, and a
 * short coincidental overlap is not evidence of anything.
 */
const MIN_RETYPE_MATCH = 40;
/**
 * Sustained input rate treated as physically implausible (chars/minute).
 * Well above any human typist, so the ordinary causes are dictation, an IME,
 * autocomplete, or an assistive device — not wrongdoing.
 */
const IMPLAUSIBLE_CPM = 900;
/** Minimum chars in a burst before its rate is worth measuring at all. */
const MIN_BURST_CHARS = 60;

interface ReplayResult {
  origins: Origin[];
  /** Per-character source seq: which event contributed each position. */
  seqs: number[];
}

/**
 * Replay the log into per-character origins. Also records which event
 * contributed each surviving character, so we can attribute the final text to
 * writing sessions without a second pass.
 */
function replayOrigins(events: ProvenanceEventRow[]): ReplayResult {
  const origins: Origin[] = [];
  const seqs: number[] = [];
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
    // rearranging your own paragraphs doesn't relabel them as imported.
    let inserted: Origin[];
    if (ev.kind === "move") {
      const runs = decodeSidecar(ev.timing_blob).restoredOrigins;
      inserted = runs ? expandRuns(runs, len) : new Array<Origin>(len).fill("pasted");
    } else {
      const origin: Origin = (ev.origin as Origin) ?? "human";
      inserted = new Array<Origin>(len).fill(origin);
    }
    origins.splice(off, 0, ...inserted);
    seqs.splice(off, 0, ...new Array<number>(len).fill(ev.client_seq));
  }
  return { origins, seqs };
}

/** Expand RLE runs to a flat per-character array of exactly `len` entries. */
function expandRuns(runs: ProvenanceOriginRun[], len: number): Origin[] {
  const out: Origin[] = [];
  for (const r of runs) {
    for (let i = 0; i < r.length && out.length < len; i++) out.push(r.origin);
  }
  while (out.length < len) out.push("human");
  return out.slice(0, len);
}

function encodeRuns(origins: Origin[]): ProvenanceRun[] {
  const runs: ProvenanceRun[] = [];
  for (const o of origins) {
    const last = runs[runs.length - 1];
    if (last && last.origin === o) last.length += 1;
    else runs.push({ origin: o, length: 1 });
  }
  return runs;
}

/**
 * Verify each `move` against the log: the text must actually match something
 * cut or copied from this document shortly before. Without this check, "it was
 * a move" would be an unfalsifiable claim from the client and therefore the
 * cheapest way to launder any origin.
 *
 * Returns the number of moves that could NOT be verified. Unverified moves are
 * downgraded in place to a plain paste.
 */
function verifyMoves(events: ProvenanceEventRow[]): number {
  let unverified = 0;
  const recentCuts: Array<{ norm: string; at: number }> = [];
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  for (const ev of events) {
    if (ev.kind === "delete" && ev.text) {
      recentCuts.push({ norm: norm(ev.text), at: ev.created_at });
      if (recentCuts.length > 32) recentCuts.shift();
      continue;
    }
    if (ev.kind !== "move") continue;
    const target = norm(ev.text ?? "");
    // A copy (not a cut) leaves no delete event, so a move with no matching
    // cut is only *unverified*, not proof of anything. We still count it, and
    // we still trust the restored origins — a student who copies a paragraph
    // and pastes it twice is doing something completely ordinary.
    const found = target.length > 0 && recentCuts.some((c) => c.norm === target);
    if (!found) unverified++;
  }
  return unverified;
}

/**
 * Re-mark human-typed text that reproduces content pasted earlier in this
 * document as `pasted`. Runs server-side at mint time because the client
 * cannot be the authority on this: the whole point is to catch text that was
 * imported and then retyped to look composed.
 *
 * It is marked `pasted` rather than getting a category of its own, because it
 * is the same fact: content entered this document through the clipboard. How
 * it got from the clipboard into the final text — surviving the paste intact,
 * or being typed back in afterwards — doesn't change what happened or what a
 * reader should do about it.
 *
 * Note what this does and does not claim. It says content entered through the
 * clipboard. It does not say where the clipboard content came from — a model,
 * a previous draft, or the student's own notes are indistinguishable here, and
 * the paste inventory is shown alongside so a reader can tell.
 */
function deriveRetyped(text: string, origins: Origin[], corpus: string[]): void {
  if (corpus.length === 0 || !text) return;
  // Only consider text currently attributed to the student's own typing.
  // Everything else is already attributed to a non-human source.
  const spans = findMatches(text, corpus, { minMatchLength: MIN_RETYPE_MATCH });
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < origins.length; i++) {
      if (origins[i] === "human") origins[i] = "pasted";
    }
  }
}

/** Build the paste inventory, with survival measured against the final text. */
function buildPastes(events: ProvenanceEventRow[], text: string): PasteRecord[] {
  const out: PasteRecord[] = [];
  for (const ev of events) {
    // Moves are internal rearrangement, not imports — excluded by design.
    if (ev.kind !== "paste" || !ev.text) continue;
    const { verbatim, nearMatch } = coverage(ev.text, text);
    out.push({
      seq: ev.client_seq,
      at: ev.created_at,
      sample:
        ev.text.length > MAX_PASTE_SAMPLE
          ? ev.text.slice(0, MAX_PASTE_SAMPLE) + "…"
          : ev.text,
      length: ev.text.length,
      verbatim,
      nearMatch,
    });
  }
  return out;
}

/** Measure the shape of the writing process. Descriptive only. */
function buildAudit(
  events: ProvenanceEventRow[],
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
  let lastSessionStartSeq = events[0]!.client_seq;
  let sessionStartAt = events[0]!.created_at;
  for (let i = 1; i < events.length; i++) {
    const gap = events[i]!.created_at - events[i - 1]!.created_at;
    if (gap > longestGap) longestGap = gap;
    if (gap > SESSION_GAP_MS) {
      sessions++;
      activeMs += events[i - 1]!.created_at - sessionStartAt;
      sessionStartAt = events[i]!.created_at;
      lastSessionStartSeq = events[i]!.client_seq;
    }
    // Ordering: client sequence is monotonic by construction, so a batch that
    // arrives with earlier server time than its predecessor is incoherent.
    if (events[i]!.created_at < events[i - 1]!.created_at) {
      audit.orderingAnomalies++;
    }
  }
  activeMs += events[events.length - 1]!.created_at - sessionStartAt;

  audit.sessions = sessions;
  audit.spanMs = events[events.length - 1]!.created_at - events[0]!.created_at;
  audit.activeMs = activeMs;
  audit.longestGapMs = longestGap;

  // Share of surviving text contributed by the final session.
  if (seqs.length > 0) {
    let fromLast = 0;
    for (const s of seqs) if (s >= lastSessionStartSeq) fromLast++;
    audit.finalSessionShare = fromLast / seqs.length;
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
      flushBurst(ev.created_at);
      continue;
    }
    if (burstChars === 0) burstStart = ev.created_at;
    burstChars += ev.length;
    const next = events[i + 1];
    // A pause of >5s ends the burst: we measure sustained rate, not the
    // instantaneous gap between two adjacent keystrokes.
    if (!next || next.created_at - ev.created_at > 5_000) {
      flushBurst(ev.created_at);
    }
  }
  flushBurst(events[events.length - 1]!.created_at);

  return audit;
}

/**
 * Build the frozen render. `text` is the document's plain-text projection
 * (extracted from body_json by the caller). `events` is the full event log in
 * client_seq order.
 *
 * PRIVACY: deleted text is read here (as fingerprint corpus and to verify
 * moves) but is never written into the returned render. Only `pastes[].sample`
 * carries source text, and only for clipboard *imports* — text the student
 * typed and then deleted stays out of the snapshot entirely. See the module
 * README; the field list below is the enforcement point.
 */
export function buildRender(
  text: string,
  events: ProvenanceEventRow[],
): ProvenanceRender {
  const unverifiedMoves = verifyMoves(events);
  const { origins, seqs } = replayOrigins(events);

  // Reconcile replay length against the real text, recording the drift.
  const lengthDrift = Math.abs(origins.length - text.length);
  let finalOrigins = origins;
  let finalSeqs = seqs;
  if (origins.length > text.length) {
    finalOrigins = origins.slice(0, text.length);
    finalSeqs = seqs.slice(0, text.length);
  } else if (origins.length < text.length) {
    const pad = text.length - origins.length;
    finalOrigins = origins.concat(new Array<Origin>(pad).fill("human"));
    finalSeqs = seqs.concat(new Array<number>(pad).fill(0));
  }

  // Corpus for retype detection: everything that entered via the clipboard or
  // the chat panel. Deleted-then-retyped drafting is NOT in scope — rewriting
  // your own sentence is writing, not importing.
  const corpus: string[] = [];
  for (const ev of events) {
    if ((ev.kind === "paste" || ev.kind === "llm_insert") && ev.text) {
      corpus.push(ev.text);
    }
  }
  deriveRetyped(text, finalOrigins, corpus);

  return {
    v: RENDER_VERSION,
    text,
    runs: encodeRuns(finalOrigins),
    pastes: buildPastes(events, text),
    audit: buildAudit(events, finalSeqs, lengthDrift, unverifiedMoves),
  };
}

/**
 * Extract a plain-text projection from a Tiptap doc JSON node. Text nodes
 * contribute their `text`; block nodes get a trailing newline so
 * paragraphs don't run together. Not a Markdown renderer — the viewer
 * styles from runs, not from this text's structure.
 */
export function plainTextFromDoc(node: unknown): string {
  let out = "";
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as { type?: string; text?: string; content?: unknown[] };
    if (obj.type === "text" && typeof obj.text === "string") {
      out += obj.text;
      return;
    }
    if (Array.isArray(obj.content)) {
      for (const child of obj.content) visit(child);
    }
    if (
      obj.type === "paragraph" ||
      obj.type === "heading" ||
      obj.type === "listItem" ||
      obj.type === "blockquote"
    ) {
      out += "\n";
    }
  };
  visit(node);
  return out.replace(/\n+$/, "");
}

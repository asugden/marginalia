// Behavioural checks for the provenance render (slice 8).
//
// This module has no test runner wired up, so these run standalone:
//
//   npx tsx apps/worker/src/modules/provenance/render.test.ts
//
// Exit code is non-zero on failure, so it drops straight into CI if one is
// ever added.
//
// The cases below are not incidental. Most of them assert the ABSENCE of a
// signal on innocent input, because that is the property this module is most
// obliged to preserve: a student who did nothing wrong must generate nothing
// that looks like an accusation. Anything that starts failing here is a false
// positive reaching an instructor.

import type { ProvenanceEventRow } from "@marginalia/schema";
import { buildRender } from "./render.js";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  } else {
    console.log(`ok    ${label}`);
  }
}

let seq = 0;
let clock = 1_700_000_000_000;

function reset(): void {
  seq = 0;
  clock = 1_700_000_000_000;
}

function ev(o: {
  kind: ProvenanceEventRow["kind"];
  offset: number;
  length: number;
  text?: string;
  origin?: ProvenanceEventRow["origin"];
  blob?: string;
  dt?: number;
}): ProvenanceEventRow {
  clock += o.dt ?? 3_000;
  return {
    id: `e${++seq}`,
    document_id: "d",
    course_id: "c",
    user_id: "u",
    kind: o.kind,
    offset: o.offset,
    length: o.length,
    text: o.text ?? null,
    origin: o.origin ?? null,
    source_message_id: null,
    timing_blob: o.blob ?? null,
    client_seq: seq,
    created_at: clock,
  };
}

/** One event per keystroke, at a given sustained rate. */
function typeOut(text: string, cpm: number, offset = 0): ProvenanceEventRow[] {
  const gap = 60_000 / cpm;
  return [...text].map((ch, i) => ev({
    kind: "insert",
    offset: offset + i,
    length: 1,
    text: ch,
    origin: "human",
    dt: gap,
  }));
}

function originCount(
  render: ReturnType<typeof buildRender>,
  origin: string,
): number {
  return render.runs
    .filter((r) => r.origin === origin)
    .reduce((n, r) => n + r.length, 0);
}

const LLM_TEXT =
  "The principal-agent problem arises whenever one party delegates authority " +
  "to another whose interests may diverge from their own.";

// ── 1. The laundering path this slice exists to close ───────────────────
// Paste model text, delete it, retype it by hand. Must NOT read as typed.
{
  reset();
  const intro = "Here is my essay. ";
  const events = [
    ev({ kind: "insert", offset: 0, length: intro.length, text: intro, origin: "human" }),
    ev({ kind: "paste", offset: intro.length, length: LLM_TEXT.length, text: LLM_TEXT, origin: "pasted" }),
    ev({ kind: "delete", offset: intro.length, length: LLM_TEXT.length, text: LLM_TEXT }),
    ev({ kind: "insert", offset: intro.length, length: LLM_TEXT.length, text: LLM_TEXT, origin: "human" }),
  ];
  const r = buildRender(intro + LLM_TEXT, events);
  check("retype-after-paste is marked pasted", originCount(r, "pasted"), LLM_TEXT.length);
  check("retype-after-paste leaves the intro typed", originCount(r, "human"), intro.length);
  check("paste is inventoried", r.pastes?.length, 1);
  check("paste survival is verbatim", r.pastes?.[0]?.verbatim, 1);
}

// ── 2. Honest writing produces NO signal ────────────────────────────────
// Types a draft, dislikes it, deletes it, writes something better. No paste.
{
  reset();
  const draft = "I think markets are basically places where people trade things somehow.";
  const good = "Markets aggregate dispersed information through prices. ";
  const more = "This is the central insight of the economic calculation argument. ";
  const events = [
    ...typeOut(draft, 300),
    ev({ kind: "delete", offset: 0, length: draft.length, text: draft }),
    ...typeOut(good, 280),
    ...typeOut(more, 320, good.length),
  ];
  const r = buildRender(good + more, events);
  check("honest writing: nothing marked pasted", originCount(r, "pasted"), 0);
  check("honest writing: no pastes recorded", r.pastes?.length, 0);
  check("honest writing: no fast bursts", r.audit?.fastBursts, 0);
  check("honest writing: no length drift", r.audit?.lengthDrift, 0);
  check(
    "PRIVACY: deleted draft never reaches the render",
    JSON.stringify(r).includes("basically places"),
    false,
  );
}

// ── 3. Moving your own text is not importing it ─────────────────────────
{
  reset();
  const para = "Hayek's argument depends on the claim that knowledge is dispersed across many minds.";
  const other = "Second point here. ";
  const events = [
    ev({ kind: "insert", offset: 0, length: para.length, text: para, origin: "human" }),
    ev({ kind: "insert", offset: para.length, length: other.length, text: other, origin: "human" }),
    ev({ kind: "delete", offset: 0, length: para.length, text: para }),
    ev({
      kind: "move",
      offset: other.length,
      length: para.length,
      text: para,
      origin: "human",
      blob: JSON.stringify({ restoredOrigins: [{ origin: "human", length: para.length }] }),
    }),
  ];
  const r = buildRender(other + para, events);
  check("move keeps its original origin", originCount(r, "pasted"), 0);
  check("move is verified against the cut", r.audit?.unverifiedMoves, 0);
  check("move is not inventoried as a paste", r.pastes?.length, 0);
}

// ── 4. A move that never happened is not verifiable ─────────────────────
// The client claims a move with no prior cut. We record that we could not
// confirm it — we do NOT call it fraud, since a copy leaves no delete event.
{
  reset();
  const text = "This paragraph was never cut from anywhere in this document at all.";
  const r = buildRender(text, [
    ev({
      kind: "move",
      offset: 0,
      length: text.length,
      text,
      origin: "human",
      blob: JSON.stringify({ restoredOrigins: [{ origin: "human", length: text.length }] }),
    }),
  ]);
  check("unverifiable move is counted", r.audit?.unverifiedMoves, 1);
}

// ── 5. Typing-rate ceiling: only impossible rates, and only real evidence ─
{
  for (const [cpm, want] of [[250, 0], [500, 0], [750, 0], [1400, 1]] as const) {
    reset();
    const s = "Markets aggregate dispersed information through prices and that is the whole point. ";
    const r = buildRender(s, typeOut(s, cpm));
    check(`typing at ${cpm} cpm → fastBursts`, r.audit?.fastBursts, want);
  }
  // A multi-character insert (autocomplete, IME, mobile keyboard) must never
  // be treated as evidence of rate — this was a real false positive.
  reset();
  const chunk = "Markets aggregate dispersed information through prices and that is the point. ";
  const r = buildRender(chunk, [
    ev({ kind: "insert", offset: 0, length: chunk.length, text: chunk, origin: "human", dt: 45_000 }),
  ]);
  check("bulk insert is not a rate signal", r.audit?.fastBursts, 0);
}

// ── 6. Coincidental overlap is not a match ──────────────────────────────
// Short shared phrasing between a paste and unrelated typing must stay clean.
{
  reset();
  const paste = "One party may delegate to another. Interests can diverge from their own.";
  const typed = "In their own words, one party wants something and another wants a different thing entirely here.";
  const events = [
    ev({ kind: "paste", offset: 0, length: paste.length, text: paste, origin: "pasted" }),
    ev({ kind: "delete", offset: 0, length: paste.length, text: paste }),
    ...typeOut(typed, 300),
  ];
  const r = buildRender(typed, events);
  check("common phrasing is not marked pasted", originCount(r, "pasted"), 0);
  check("common phrasing stays typed", originCount(r, "human"), typed.length);
}

// ── 7. Empty / degenerate input must not throw ──────────────────────────
{
  reset();
  const r = buildRender("", []);
  check("empty document renders", r.runs.length, 0);
  check("empty document has no pastes", r.pastes?.length, 0);
  check("empty document audit is zeroed", r.audit?.sessions, 0);
}

// ── 8. Length drift is recorded, not hidden ─────────────────────────────
// A dropped batch leaves the log unable to reconstruct the text. The viewer
// must still render, and the gap must be visible rather than silently padded.
{
  reset();
  const shown = "This document is longer than the events we received for it.";
  const r = buildRender(shown, [
    ev({ kind: "insert", offset: 0, length: 10, text: "This docum", origin: "human" }),
  ]);
  check("drift is reported", r.audit?.lengthDrift, shown.length - 10);
  check(
    "runs still sum to the text length",
    r.runs.reduce((n, x) => n + x.length, 0),
    shown.length,
  );
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);

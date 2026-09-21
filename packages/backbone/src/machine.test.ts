// Behavioural checks for the backbone state machine, with an emphasis on what
// happens AFTER the outline finishes.
//
// This package has no test runner wired up, so these run standalone:
//
//   npx tsx packages/backbone/src/machine.test.ts
//
// Exit code is non-zero on failure, so it drops straight into CI if one is
// ever added.
//
// The `finished` cases matter most. Completing the outline used to end the
// conversation: the worker rejected further turns and the client removed the
// composer. It no longer does — a completed conversation continues as a
// free-form thread on the same row — so the machine must treat `finished` as
// a stable, idempotent resting state rather than a one-shot edge. If these
// start failing, a student who keeps chatting after completion will see their
// topic counter drift past the end of the outline.

import { transition, turnBudget, currentTopic, cleanReply, ADVANCE_MARKER } from "./machine.js";
import type { BackboneComponent, BackboneState } from "./types.js";

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

const bb: BackboneComponent = {
  topics: [
    { id: "t1", title: "First" },
    { id: "t2", title: "Second" },
  ],
  defaultTurnBudget: 2,
  exitCondition: "student can explain the idea",
};

const fresh: BackboneState = {
  currentTopicIndex: 0,
  turnsOnTopic: 0,
  totalTurns: 0,
  finished: false,
};

// ── 1. Normal progression: stay, then forced advance on budget ──────────
{
  const t1 = transition(bb, fresh, "some reply");
  check("first turn stays on topic", t1.kind, "stay");
  check("turn is counted", t1.state.turnsOnTopic, 1);

  const t2 = transition(bb, t1.state, "some reply");
  check("budget exhaustion forces an advance", t2.kind, "forced");
  check("advance moves to topic 2", t2.state.currentTopicIndex, 1);
  check("not finished mid-outline", t2.state.finished, false);
}

// ── 2. Mastery advances early ───────────────────────────────────────────
{
  const t = transition(bb, fresh, `Nice work.\n${ADVANCE_MARKER}`);
  check("advance marker advances early", t.kind, "advance");
  check("marker is stripped from student-visible text", cleanReply(`Nice work.\n${ADVANCE_MARKER}`), "Nice work.");
}

// ── 3. Exhausting the LAST topic's budget finishes the outline ──────────
// This is the common path to completion in practice — the student runs out
// of turn budget mid-explanation rather than signalling mastery.
{
  const onLast: BackboneState = {
    currentTopicIndex: 1,
    turnsOnTopic: 1,
    totalTurns: 3,
    finished: false,
  };
  const t = transition(bb, onLast, "still explaining");
  check("last topic's budget finishes the outline", t.kind, "finished");
  check("finished flag is set", t.state.finished, true);
  check("index lands one past the last topic", t.state.currentTopicIndex, 2);
  check("no current topic once finished", currentTopic(bb, t.state), undefined);
}

// ── 4. A finished backbone can still take turns ─────────────────────────
// The conversation continues free-form after completion, so transition() is
// called again on every subsequent turn. It must not throw, must not advance,
// and must not let the counters drift.
{
  const done: BackboneState = {
    currentTopicIndex: 2,
    turnsOnTopic: 0,
    totalTurns: 4,
    finished: true,
  };

  const t1 = transition(bb, done, "a follow-up question");
  check("finished backbone still accepts a turn", t1.kind, "finished");
  check("state is unchanged by a continuation turn", t1.state, done);
  check("topic index never runs past the outline", t1.state.currentTopicIndex, 2);

  // Idempotent across many continuation turns — a student may keep going for
  // a long time, bounded only by the worker's global per-conversation cap.
  let s = done;
  for (let i = 0; i < 25; i++) s = transition(bb, s, "another question").state;
  check("25 continuation turns leave state identical", s, done);

  // Even an advance marker must not move a finished outline.
  const t2 = transition(bb, done, `Great.\n${ADVANCE_MARKER}`);
  check("advance marker is inert once finished", t2.state, done);
  check("still reports finished", t2.kind, "finished");
}

// ── 5. Defensive: index past the list without the flag ──────────────────
{
  const stray: BackboneState = {
    currentTopicIndex: 9,
    turnsOnTopic: 0,
    totalTurns: 7,
    finished: false,
  };
  const t = transition(bb, stray, "reply");
  check("out-of-range index is repaired to finished", t.state.finished, true);
  check("kind reports finished", t.kind, "finished");
}

// ── 6. Per-topic budget override wins over the default ──────────────────
{
  const override: BackboneComponent = {
    topics: [{ id: "t1", title: "Long one", turnBudget: 5 }],
    defaultTurnBudget: 2,
    exitCondition: "x",
  };
  check("per-topic override is honored", turnBudget(override, override.topics[0]!), 5);
  check("default applies when unset", turnBudget(bb, bb.topics[0]!), 2);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);

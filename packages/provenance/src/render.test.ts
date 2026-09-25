// Checks for the options the shared render adds beyond the writing tool's use
// of it. The writing tool's own behaviour is pinned by
// apps/worker/src/modules/provenance/render.test.ts.
//
//   npx tsx packages/provenance/src/render.test.ts

import { buildRender, type LogEvent } from "./render.js";
import { countOrigins, spliceRuns, type Origin } from "./origins.js";
import { isReversion, MoveBuffer, rememberContribution, trailingReversionLength } from "./client.js";

let failures = 0;
let checks = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

let seq = 0;
let clock = 1_000_000;
function ev(kind: LogEvent["kind"], offset: number, text: string, origin: Origin | null, dt = 1_000): LogEvent {
  clock += dt;
  return { kind, offset, length: text.length, text: kind === "delete" ? text : text, origin, clientSeq: ++seq, createdAt: clock };
}

const TUTOR = "for i in range(len(values)):\n    total = total + values[i] * weights[i]";

// ── baseline ────────────────────────────────────────────────────────────
{
  seq = 0;
  const starter = "import numpy as np\n";
  const typed = "x = np.zeros(3)";
  const r = buildRender(starter + typed, [ev("insert", starter.length, typed, "human")], {
    baseline: { length: starter.length, origin: "provided" },
  });
  check("starter text replays as provided, typing as human", r.runs, [
    { origin: "provided", length: starter.length },
    { origin: "human", length: typed.length },
  ]);
  check("baseline is not activity: final-session share counts only typed text", r.audit?.finalSessionShare, 1);
}

// ── labelled corpus: llm_insert stays llm ──────────────────────────────
{
  seq = 0;
  const events = [ev("llm_insert", 0, TUTOR, "llm"), ev("delete", 0, TUTOR, null), ...[...TUTOR].map((ch, i) => ev("insert", i, ch, "human", 200))];
  const r = buildRender(TUTOR, events, { corpusOrigin: (e) => (e.kind === "llm_insert" ? "llm" : "pasted") });
  check("retyping a deleted tutor paste is marked llm, not pasted", countOrigins(r.runs).llm, TUTOR.length);
  const w = buildRender(TUTOR, events);
  check("default corpus origin is still pasted (writing-tool behaviour)", countOrigins(w.runs).pasted, TUTOR.length);
}

// ── time-bounded extra corpus ───────────────────────────────────────────
{
  seq = 0;
  clock = 1_000_000;
  const typedFirst = [...TUTOR].map((ch, i) => ev("insert", i, ch, "human", 200));
  const replyAt = clock + 10_000;
  const before = buildRender(TUTOR, typedFirst, { extraCorpus: [{ text: TUTOR, origin: "llm", after: replyAt }] });
  check("code typed BEFORE the tutor said it stays human (a tutor quoting you back)", countOrigins(before.runs).human, TUTOR.length);

  seq = 0;
  clock = 1_000_000;
  const replyAt2 = clock;
  const typedAfter = [...TUTOR].map((ch, i) => ev("insert", i, ch, "human", 200));
  const after = buildRender(TUTOR, typedAfter, { extraCorpus: [{ text: TUTOR, origin: "llm", after: replyAt2 }] });
  check("code typed AFTER the tutor said it is marked llm", countOrigins(after.runs).llm, TUTOR.length);

  seq = 0;
  const short = "total = 0";
  const shortRun = buildRender(short, [...short].map((ch, i) => ev("insert", i, ch, "human", 200)), {
    extraCorpus: [{ text: `Try ${short} first`, origin: "llm", after: 0 }],
  });
  check("a short coincidental overlap is never re-marked", countOrigins(shortRun.runs).human, short.length);
}

// ── import inventory labels ─────────────────────────────────────────────
{
  seq = 0;
  const r = buildRender(TUTOR + "\nprint(1)", [ev("llm_insert", 0, TUTOR, "llm"), ev("paste", TUTOR.length, "\nprint(1)", "pasted")], {
    importKinds: ["paste", "llm_insert"],
    labelImports: true,
  });
  check("both kinds of import are listed, with their source", r.pastes?.map((p) => p.origin), ["llm", "pasted"]);
}

// ── run splicing ────────────────────────────────────────────────────────
check(
  "spliceRuns replaces a middle range",
  spliceRuns([{ origin: "human", length: 5 }, { origin: "pasted", length: 5 }], 3, 4, [{ origin: "llm", length: 2 }]),
  [{ origin: "human", length: 3 }, { origin: "llm", length: 2 }, { origin: "pasted", length: 3 }],
);

// ── client helpers ──────────────────────────────────────────────────────
{
  const list: string[] = [];
  rememberContribution(list, "total = total + values[i]");
  check("reversion catches an exact retype", isReversion(list, "total = total + values[i]"), true);
  check("reversion ignores short text", isReversion(list, "total"), false);
  check("slow retype finds the trailing match", trailingReversionLength(list, "x\ntotal = total + values[i]"), 25);
  let t = 0;
  const buf = new MoveBuffer(() => t);
  buf.remember("df = pd.read_csv('a.csv')", [{ origin: "pasted", length: 25 }]);
  t = 10_000;
  check("a move within the window restores origins", buf.lookup("df = pd.read_csv('a.csv')"), [{ origin: "pasted", length: 25 }]);
  t = 60_000;
  check("a move after the window does not", buf.lookup("df = pd.read_csv('a.csv')"), null);
}

console.log(`\n${checks - failures}/${checks} passed`);
if (failures) process.exit(1);

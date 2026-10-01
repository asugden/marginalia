// Pure tests for presets.ts and tour.ts. Stand-in descriptors, no network:
// run with `npm test --workspace apps/web`.

import { descriptorsFor, normalizePreset, settingsFor } from "./presets.js";
import { buildTour, setupEnv } from "./tour.js";
import type { FeatureId, OnboardingDescriptor, Preset, Stance } from "./types.js";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

function fake(id: FeatureId, usesLLM: boolean): OnboardingDescriptor {
  return {
    id,
    title: id,
    usesLLM,
    pitch: (p) => `${id} pitch for ${p}`,
    seed: async () => ({}),
    tour: ({ courseId }) => [
      { id: `${id}.a`, side: "instructor", title: id, body: "", route: `/course/${courseId}/${id}` },
      { id: `${id}.b`, side: "student", title: id, body: "", route: `/course/${courseId}/${id}/s` },
    ],
  };
}
const ALL = [fake("agents", true), fake("writing", false), fake("code", false)];
const STANCES: Stance[] = ["none", "open", "learn"];
const FEATURE_SETS: FeatureId[][] = [
  [],
  ["writing"],
  ["code"],
  ["agents"],
  ["writing", "code"],
  ["agents", "writing", "code"],
];

// ── the "none" stance never reaches an LLM feature ──────────────────────
for (const features of FEATURE_SETS) {
  const p: Preset = { stance: "none", features, codeChat: true };
  const env = setupEnv("c1", "Product", p, ALL);
  const llmSteps = buildTour(env, {}, ALL).filter((s) => s.id.startsWith("agents."));
  check(`none + [${features}] has no agent steps`, llmSteps.length, 0);
  const s = settingsFor(p);
  check(`none + [${features}] agents off`, s.agents, false);
  check(`none + [${features}] code chat not on`, s.codeChat === true, false);
  check(`none + [${features}] writing chat not on`, s.provenanceChat === true, false);
  check(`none + [${features}] opts out`, s.genaiOptOut, true);
  check(
    `none + [${features}] material has no agent pitch`,
    env.material.some((m) => m.text.startsWith("agents")),
    false,
  );
}

// ── presets from the plan's table ───────────────────────────────────────
check("no-AI writing", settingsFor({ stance: "none", features: ["writing"] }), {
  agents: false, provenance: true, provenanceChat: false, code: false, codeChat: null, genaiOptOut: true,
});
check("open, everything", settingsFor({ stance: "open", features: ["agents", "writing", "code"], codeChat: true }), {
  agents: true, provenance: true, provenanceChat: true, code: true, codeChat: true, genaiOptOut: false,
});
check("agents only", settingsFor({ stance: "open", features: ["agents"] }), {
  agents: true, provenance: false, provenanceChat: null, code: false, codeChat: null, genaiOptOut: false,
});
check("code only, chat off", settingsFor({ stance: "learn", features: ["code"], codeChat: false }), {
  agents: false, provenance: false, provenanceChat: null, code: true, codeChat: false, genaiOptOut: false,
});

// ── normalization ───────────────────────────────────────────────────────
check("empty features default to writing", normalizePreset({ stance: "open", features: [] }).features, ["writing"]);
check("none drops agents, keeps writing", normalizePreset({ stance: "none", features: ["agents"] }).features, ["writing"]);
check("duplicates collapse", normalizePreset({ stance: "open", features: ["writing", "writing"] }).features, ["writing"]);

// ── tour order: agents (the intro) → writing → code; always ends on "done"
for (const stance of STANCES) {
  const p: Preset = { stance, features: ["code", "writing", "agents"] };
  const order = descriptorsFor(p, ALL).map((d) => d.id);
  check(`${stance}: order`, order, stance === "none" ? ["writing", "code"] : ["agents", "writing", "code"]);
  const tour = buildTour(setupEnv("c1", "Product", p, ALL), {}, ALL);
  check(`${stance}: ends on done`, tour[tour.length - 1]!.id, "done");
  check(`${stance}: starts as instructor`, tour[0]!.side, "instructor");
  check(
    `${stance}: every route is inside the course`,
    tour.every((s) => s.route.startsWith("/course/c1/")),
    true,
  );
}

// ── material: the why, then each chosen feature's pitch ─────────────────
const env = setupEnv("c1", "Acme", { stance: "open", features: ["writing", "agents"] }, ALL);
check("material titles", env.material.map((m) => m.title), ["Why Acme exists", "agents", "writing"]);
check("material names the product", env.material[0]!.text.startsWith("Acme exists"), true);

console.log(`\n${passed}/${passed + failed} passed`);
if (failed > 0) process.exit(1);

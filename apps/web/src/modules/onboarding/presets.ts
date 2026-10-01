// Pure rules from the welcome-flow answers to course settings and tour order.
// No I/O here, so presets.test.ts can check every combination.

import type { FeatureId, OnboardingDescriptor, Preset, Stance } from "./types.js";

/** Course switches a preset produces. `null` = leave that switch alone. */
export interface PresetSettings {
  agents: boolean;
  provenance: boolean;
  /** The writing editor's LLM chat. Null when writing is off. */
  provenanceChat: boolean | null;
  code: boolean;
  /** Chat beside the seeded coding assignment. Null when code is off. */
  codeChat: boolean | null;
  /** The instructor's own "not interested in generative AI" preference. */
  genaiOptOut: boolean;
}

export const allowsAI = (stance: Stance): boolean => stance !== "none";

/**
 * Normalize answers: the "none" stance can't carry agents or any chat, and a
 * preset always has at least one feature (writing, the common case).
 */
export function normalizePreset(p: Preset): Preset {
  let features = [...new Set(p.features)];
  if (!allowsAI(p.stance)) features = features.filter((f) => f !== "agents");
  if (features.length === 0) features = ["writing"];
  return {
    stance: p.stance,
    features,
    codeChat: allowsAI(p.stance) && features.includes("code") ? !!p.codeChat : false,
  };
}

export function settingsFor(input: Preset): PresetSettings {
  const p = normalizePreset(input);
  const ai = allowsAI(p.stance);
  const writing = p.features.includes("writing");
  const code = p.features.includes("code");
  return {
    agents: ai && p.features.includes("agents"),
    provenance: writing,
    provenanceChat: writing ? ai : null,
    code,
    codeChat: code ? ai && !!p.codeChat : null,
    genaiOptOut: !ai,
  };
}

/**
 * Tour order. For AI stances the guided "Meet the product" agent goes first —
 * it's the introduction. Writing is the heart of it for everyone. Code is
 * last: reachable, secondary.
 */
const ORDER: FeatureId[] = ["agents", "writing", "code"];

/** Descriptors to use for a preset, in tour order, LLM features dropped for
 *  the "none" stance even if a caller slipped one in. */
export function descriptorsFor(
  input: Preset,
  all: readonly OnboardingDescriptor[],
): OnboardingDescriptor[] {
  const p = normalizePreset(input);
  const ai = allowsAI(p.stance);
  return ORDER.filter((id) => p.features.includes(id))
    .map((id) => all.find((d) => d.id === id))
    .filter((d): d is OnboardingDescriptor => !!d && (ai || !d.usesLLM));
}

export * from "./types.js";
export { LIBRARY, findLibraryVoice } from "./library.js";

import type { VoiceDefinition, VoiceRef } from "./types.js";
import { findLibraryVoice } from "./library.js";

/**
 * Resolve a VoiceRef to a concrete VoiceDefinition for turn-time prompt
 * assembly.
 *
 * Refuses `custom-ref`: those are valid only in AgentDefinition and must
 * be materialised into `custom` (an inlined VoiceDefinition) before the
 * snapshot lands in a conversation row. See v0.7-plan.md §1.2 and the
 * conversation-start handler.
 *
 * Library refs that point at an unknown id throw — that's a data
 * integrity problem (the library shrank under an existing agent), and
 * silently falling back to a default would mask it.
 */
export function resolveVoice(ref: VoiceRef): VoiceDefinition {
  if (ref.kind === "custom") return ref.definition;
  if (ref.kind === "custom-ref") {
    throw new Error(
      `Unresolved custom-ref voice (id=${ref.voiceId}). Custom-ref voices ` +
        `must be materialised into 'custom' at conversation start; this ` +
        `error means a code path tried to resolve one at turn time, or a ` +
        `legacy snapshot wasn't rewritten on read.`,
    );
  }
  const found = findLibraryVoice(ref.id);
  if (!found) {
    throw new Error(`Unknown library voice: ${ref.id}`);
  }
  return found;
}

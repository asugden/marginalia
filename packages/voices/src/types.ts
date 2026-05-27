// Voices: a bundled prompt fragment describing how the agent talks.
// What v0.2 called an "agent" (persona library) becomes a "voice" in v0.4 —
// the word survives the future where authors graduate from picking a curated
// voice to writing complete agent prompts inline (those are just "custom
// voices" with much longer fragments; same shape, no new concept).

/**
 * A voice. The `systemPromptFragment` is concatenated into the agent's system
 * prompt — it should describe persona, tone, and style, not topic-specific
 * content.
 */
export interface VoiceDefinition {
  id: string;
  name: string;
  /** One-line description shown in the picker. */
  description: string;
  /** Inserted into the SystemPrompt instructions block. */
  systemPromptFragment: string;
}

/**
 * Reference embedded in an AgentDefinition or a conversation
 * definition_snapshot. Three shapes:
 *
 *   - **library**: a pointer into the bundled `LIBRARY` (canonical,
 *     evolves over time, never edited per-instance). The id is resolved
 *     at turn time against the static list.
 *
 *   - **custom-ref** (v0.7+): a pointer into the per-author voices table
 *     by row id. *Only* valid in an AgentDefinition; conversations
 *     materialise this into `custom` at conversation-start so an
 *     instructor edit to the voice doesn't reach into running
 *     conversations. See v0.7-plan.md §1.2.
 *
 *   - **custom**: an inlined VoiceDefinition snapshotted at conversation
 *     start. Always safe to resolve at turn time; never depends on the
 *     voices table. Pre-v0.7 agent definitions also used this shape
 *     directly (inline at agent-save time); they continue to work.
 */
export type VoiceRef =
  | { kind: "library"; id: string }
  | { kind: "custom"; definition: VoiceDefinition }
  | { kind: "custom-ref"; voiceId: string };

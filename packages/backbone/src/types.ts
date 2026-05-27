// Backbone runtime types. The authored shape lives in ./agent.ts now —
// what an instructor saves is an AgentDefinition; a `BackboneComponent`
// is just one optional slice of it.
//
// The runtime BackboneState below is unchanged from v0.1; conversations whose
// agent has no backbone simply carry a null state.

/** A single topic in the guided sequence. */
export interface Topic {
  /** Stable identifier, referenced by state. Keep short and unique. */
  id: string;
  /** What the student should work through, shown to the agent LLM. */
  title: string;
  /** Optional extra guidance for the agent while on this topic. */
  guidance?: string;
  /** Max student turns before a forced advance. Falls back to defaultTurnBudget. */
  turnBudget?: number;
}

/**
 * The topic-sequence half of an agent. Voice lives on the agent now, not here
 * — a backbone is "what you cover", a voice is "how it sounds".
 */
export interface BackboneComponent {
  topics: Topic[];
  /** Used when a topic omits its own turnBudget. */
  defaultTurnBudget: number;
  /** Natural-language description of mastery; surfaced to the agent. */
  exitCondition: string;
  /** Shown to the student once the backbone is complete. */
  completionMessage?: string;
}

/** Per-conversation runtime state. Advanced by the state machine, persisted to D1. */
export interface BackboneState {
  /** Index into component.topics. Equals topics.length when finished. */
  currentTopicIndex: number;
  /** Student turns spent on the current topic. */
  turnsOnTopic: number;
  /** Student turns across the whole conversation. */
  totalTurns: number;
  /** True once all topics are exhausted or the exit condition is met. */
  finished: boolean;
}

/** How the most recent turn moved the machine — used for the system prompt. */
export type TransitionKind =
  | "stay" // still on the same topic
  | "advance" // moved to the next topic naturally
  | "forced" // turn budget exceeded; advance was forced
  | "finished"; // backbone complete

export interface TransitionResult {
  state: BackboneState;
  kind: TransitionKind;
}

export const initialState = (): BackboneState => ({
  currentTopicIndex: 0,
  turnsOnTopic: 0,
  totalTurns: 0,
  finished: false,
});

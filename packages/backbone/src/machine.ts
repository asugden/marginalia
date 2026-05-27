// The backbone state machine. Transitions are enforced here, in code — not via
// hopeful prompting. The agent LLM may *request* an advance by emitting a marker;
// the machine grants it. But once a topic's turn budget is spent, the machine
// advances whether the LLM likes it or not. That guarantee is the whole point.
//
// The machine operates on a BackboneComponent (the topic-sequence slice of an
// AgentDefinition). Agents with no backbone never reach this code.

import {
  type BackboneComponent,
  type BackboneState,
  type Topic,
  type TransitionResult,
} from "./types.js";

/**
 * Marker the agent emits on its own line when it judges the current topic
 * mastered. Stripped from student-visible output by `cleanReply`.
 */
export const ADVANCE_MARKER = "[ADVANCE]";

/** Resolved turn budget for a topic, honoring the per-topic override. */
export function turnBudget(bb: BackboneComponent, topic: Topic): number {
  return topic.turnBudget ?? bb.defaultTurnBudget;
}

/** Current topic, or undefined once the backbone is finished. */
export function currentTopic(
  bb: BackboneComponent,
  state: BackboneState,
): Topic | undefined {
  return bb.topics[state.currentTopicIndex];
}

/** Did the agent's raw reply request an advance? */
export function llmRequestedAdvance(rawReply: string): boolean {
  return rawReply.includes(ADVANCE_MARKER);
}

/** Remove the advance marker before showing the reply to the student. */
export function cleanReply(rawReply: string): string {
  return rawReply
    .split("\n")
    .filter((line) => line.trim() !== ADVANCE_MARKER)
    .join("\n")
    .trim();
}

/**
 * Advance the machine for one completed student turn.
 *
 * Call this AFTER the agent has responded, passing its raw reply so the
 * machine can see whether mastery was signaled. The student turn that just
 * happened is counted here.
 */
export function transition(
  bb: BackboneComponent,
  prev: BackboneState,
  rawReply: string,
): TransitionResult {
  if (prev.finished) {
    return { state: prev, kind: "finished" };
  }

  const topic = currentTopic(bb, prev);
  // Defensive: state points past the topic list but isn't flagged finished.
  if (!topic) {
    return {
      state: { ...prev, finished: true },
      kind: "finished",
    };
  }

  const turnsOnTopic = prev.turnsOnTopic + 1;
  const totalTurns = prev.totalTurns + 1;
  const budget = turnBudget(bb, topic);

  const mastered = llmRequestedAdvance(rawReply);
  const budgetSpent = turnsOnTopic >= budget;

  if (!mastered && !budgetSpent) {
    return {
      state: { ...prev, turnsOnTopic, totalTurns },
      kind: "stay",
    };
  }

  const nextIndex = prev.currentTopicIndex + 1;
  const finished = nextIndex >= bb.topics.length;

  return {
    state: {
      currentTopicIndex: nextIndex,
      turnsOnTopic: 0,
      totalTurns,
      finished,
    },
    kind: finished ? "finished" : mastered ? "advance" : "forced",
  };
}

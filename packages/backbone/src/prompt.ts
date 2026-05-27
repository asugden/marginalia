// Builds the structured SystemPrompt for an agent turn. The `instructions`
// block is stable across the conversation (voice persona + optional topic
// outline) so it can be prompt-cached; the `context` block carries volatile
// per-turn state (backbone progress; retrieved RAG chunks).

import { resolveVoice } from "@marginalia/voices";
import { ADVANCE_MARKER, currentTopic, turnBudget } from "./machine.js";
import type { AgentDefinition } from "./agent.js";
import {
  type BackboneComponent,
  type BackboneState,
  type TransitionKind,
} from "./types.js";

/** Shape matches @marginalia/providers SystemPrompt; redeclared to avoid a dep. */
export interface AgentPrompt {
  instructions: string;
  context: string;
}

/** Stable half: voice persona + (if present) hard rules and topic outline. */
function buildInstructions(def: AgentDefinition): string {
  const voice = resolveVoice(def.voice);
  const sections: string[] = [`## Persona\n${voice.systemPromptFragment}`];

  const bb = def.backbone;
  if (bb) {
    const outline = bb.topics
      .map((t, i) => {
        const budget = turnBudget(bb, t);
        const guidance = t.guidance ? ` — ${t.guidance}` : "";
        return `  ${i + 1}. ${t.title}${guidance} (budget: ${budget} turns)`;
      })
      .join("\n");

    sections.push(
      [
        "## Topic outline (you progress through these in order)",
        outline,
      ].join("\n"),
      `## Exit condition\n${bb.exitCondition}`,
      [
        "## Rules",
        "- Stay on the CURRENT topic given in the per-turn context. Do not skip ahead.",
        "- Address one idea at a time. Keep replies focused and concise.",
        `- When you judge the current topic mastered, end your reply with \`${ADVANCE_MARKER}\` on its own line. The system then moves to the next topic.`,
        `- Do not write \`${ADVANCE_MARKER}\` for any other reason. The student never sees it.`,
        "- The system may force a topic change when a turn budget runs out; the context will tell you when that has happened. Acknowledge the shift naturally and move on.",
      ].join("\n"),
    );
    return [
      "You are an agent leading a structured, guided learning conversation.",
      "",
      sections.join("\n\n"),
    ].join("\n");
  }

  // Free-form mode: persona only, no topic enforcement.
  return [
    "You are an agent in an open conversation with a student.",
    "Stay on topic with whatever the student raises; be helpful and concise.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

/** Volatile half: where the conversation stands right now. Not cached. */
function buildContext(
  bb: BackboneComponent,
  state: BackboneState,
  lastTransition: TransitionKind,
): string {
  if (state.finished) {
    return [
      "## Current state",
      "All topics are complete. The backbone is finished.",
      "Give the student a brief, encouraging wrap-up. Do not start new topics.",
    ].join("\n");
  }

  const topic = currentTopic(bb, state);
  if (!topic) {
    return "## Current state\nNo active topic. Wrap up gently.";
  }

  const budget = turnBudget(bb, topic);
  const remaining = Math.max(0, budget - state.turnsOnTopic);
  const lines = [
    "## Current state",
    `Current topic: ${topic.title}`,
    topic.guidance ? `Topic guidance: ${topic.guidance}` : null,
    `Turns spent on this topic: ${state.turnsOnTopic} of ${budget} (${remaining} remaining).`,
    `Total turns in conversation: ${state.totalTurns}.`,
  ].filter((l): l is string => l !== null);

  if (lastTransition === "forced") {
    lines.push(
      "NOTE: the previous topic's turn budget ran out. You were moved here automatically — acknowledge the transition naturally.",
    );
  } else if (lastTransition === "advance") {
    lines.push(
      "NOTE: the student just demonstrated mastery of the previous topic. Open this one fresh.",
    );
  }

  if (remaining <= 1) {
    lines.push(
      "NOTE: this topic's budget is nearly spent. Aim to bring it to a natural close.",
    );
  }

  return lines.join("\n");
}

/**
 * Build the system prompt for the upcoming turn.
 * `state` is required when the agent has a backbone, ignored otherwise.
 * `lastTransition` describes how the conversation arrived at the current state.
 */
export function buildPrompt(
  def: AgentDefinition,
  state: BackboneState | null,
  lastTransition: TransitionKind = "stay",
): AgentPrompt {
  const instructions = buildInstructions(def);
  const context =
    def.backbone && state ? buildContext(def.backbone, state, lastTransition) : "";
  return { instructions, context };
}

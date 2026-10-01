// Onboarding descriptor for Agents. See modules/onboarding/types.ts for the
// contract. Agents predate the modules/ layout (their pages live here in
// pages/), so the descriptor sits beside them.
//
// The example agent is a guided conversation about the product itself —
// "Meet <product>" — so an instructor trying it as a student learns something
// relevant instead of sitting through a demo about derivatives. Its topics
// are built from the same material the tour shows (SetupEnv.material).

import type { AgentDefinition } from "@marginalia/backbone";
import { createAgent } from "../client.js";
import type { OnboardingDescriptor, SetupEnv } from "../modules/onboarding/types.js";

/** Build the "Meet <product>" agent's outline from the tour material. */
export function meetAgentDefinition(env: SetupEnv): AgentDefinition {
  const { product, material } = env;
  const topics = material.map((m, i) => ({
    id: `t${i + 1}`,
    title: m.title,
    guidance:
      `Explain this in two or three plain sentences, then ask the instructor one question about how it would land in their own course. Stay accurate to this description and don't add features it doesn't mention:\n\n${m.text}`,
    turnBudget: 2,
  }));
  topics.push({
    id: `t${topics.length + 1}`,
    title: "What you'd try first",
    guidance: `Ask which of these the instructor would try first with their students, and help them think through how they'd explain it to the class. Keep it short.`,
    turnBudget: 2,
  });
  return {
    version: 2,
    voice: { kind: "library", id: "direct-instructor" },
    backbone: {
      topics,
      defaultTurnBudget: 2,
      exitCondition: `The instructor can say in their own words how ${product} records where student work came from, and what students are told about it.`,
      completionMessage: `That's the tour of the ideas behind ${product}. Keep asking anything you like.`,
    },
    clarityNote: `A short guided conversation about how ${product} works, for instructors trying it from the student's side. A few topics, a couple of turns each.`,
  };
}

export const agentsOnboarding: OnboardingDescriptor = {
  id: "agents",
  title: "Guided conversations",
  usesLLM: true,
  pitch: (product) =>
    `When an instructor allows it, ${product} gives students AI chats whose voice — how they talk and what they will and won't do — the instructor chooses, so students have a better option than whatever chatbot is nearest. An agent can walk a student through a set sequence of topics, each with a turn budget and an ending the code enforces rather than hopes for; or it can answer from a library of sources the instructor picked, citing them so students can check.`,
  async seed(env) {
    const r = await createAgent(env.courseId, `Meet ${env.product}`, meetAgentDefinition(env));
    return { meetAgentId: r.id };
  },
  tour: ({ courseId, product, preset }, ctx) => {
    const agent = ctx.meetAgentId;
    const steps = [
      {
        id: "agents.setup",
        side: "instructor" as const,
        title: `An agent about ${product}`,
        body: "A guided agent: a sequence of topics, a turn budget for each, and an ending condition — enforced in code, not left to the model. This one explains the ideas behind this tool.",
        route: agent
          ? `/course/${courseId}/instructor/agents/${agent}`
          : `/course/${courseId}/instructor/agents`,
      },
      {
        id: "agents.do",
        side: "student" as const,
        title: "Talk to it as a student",
        body: "You're now the course's sample student. Chat through it — a couple of turns per topic. Notice the note at the top: every agent tells students what it is before they start.",
        route: agent ? `/course/${courseId}/chat/new/${agent}` : `/course/${courseId}/agents`,
      },
      {
        id: "agents.see",
        side: "instructor" as const,
        title: "What you don't see",
        body: "Back as the instructor. The conversation you just had isn't here: students' chats stay between them and the agent. What you control is the outline and the voice.",
        route: `/course/${courseId}/instructor/agents`,
      },
    ];
    // "Help me teach students to use AI well": show where voices are made.
    if (preset.stance === "learn") {
      steps.push({
        id: "agents.voices",
        side: "instructor",
        title: "Voices: how the chat talks",
        body: "A voice is the instruction every chat runs under — Socratic, direct, a coach. Start from the library, then write your own to steer students toward the kind of help you want them to ask for.",
        route: `/course/${courseId}/instructor/voices`,
      });
    }
    return steps;
  },
};

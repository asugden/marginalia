// Onboarding descriptor for Code. See modules/onboarding/types.ts for the
// contract. Secondary on purpose: most instructors come for writing, so code
// is one click away rather than in the way.

import type { OnboardingDescriptor } from "../onboarding/types.js";
import { createAssignment } from "./api.js";

export const codeOnboarding: OnboardingDescriptor = {
  id: "code",
  title: "Code",
  usesLLM: false,
  secondary: true,
  pitch: (product) =>
    `${product} also runs Python notebooks entirely in each student's browser — nothing executes on a server, and students' data files never leave their machine. Code gets the same source record as writing: every cell's text is marked typed, pasted, provided by the instructor, or from the chat when one is on.`,
  async seed({ courseId, preset }) {
    const a = await createAssignment(courseId, {
      title: "Your policy, by the numbers",
      instructions: "",
      starter: {
        cells: [
          {
            id: "intro",
            type: "markdown",
            source:
              "# Your policy, by the numbers\n\nPaste your paragraph between the triple quotes, then run each cell.",
          },
          {
            id: "paste",
            type: "code",
            source: 'policy = """\n\n"""\nwords = policy.split()\nprint(len(words), "words")',
          },
          {
            id: "count",
            type: "code",
            source:
              "from collections import Counter\nCounter(w.lower().strip('.,;:!?()') for w in words).most_common(10)",
          },
        ],
      },
      aiEnabled: preset.stance !== "none" && !!preset.codeChat,
      mode: "submit",
    });
    return { codeAssignmentId: a.id };
  },
  tour: ({ courseId }, ctx) => [
    {
      id: "code.setup",
      side: "instructor",
      title: "A coding assignment with a starter notebook",
      body: "Every student starts from the starter notebook you write. This one is short and about your policy paragraph.",
      route: `/course/${courseId}/instructor/code`,
    },
    {
      id: "code.do",
      side: "student",
      title: "Run it as a student",
      body: "Paste your paragraph into the first cell, run the cells, and submit. It all runs in this browser.",
      route: ctx.codeAssignmentId
        ? `/course/${courseId}/code/assignment/${ctx.codeAssignmentId}`
        : `/course/${courseId}/code`,
    },
    {
      id: "code.see",
      side: "instructor",
      title: "See the submission",
      body: "Open the Sample Student's submission: the cells, their output, and where each line came from — the paste included.",
      route: ctx.codeAssignmentId
        ? `/course/${courseId}/instructor/submissions/code/${ctx.codeAssignmentId}`
        : `/course/${courseId}/instructor/code`,
    },
  ],
};

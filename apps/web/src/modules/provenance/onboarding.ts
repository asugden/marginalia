// Onboarding descriptor for Writing (provenance). See
// modules/onboarding/types.ts for the contract. Keep this in step with the
// writing tool: when the flow below changes, change the tour here too.
//
// The tour's writing assignment is the instructor's own course policy — so
// the thing they practice on is something they'll actually hand out, and the
// marks they see afterwards are on their own words.

import type { OnboardingDescriptor } from "../onboarding/types.js";
import { createAssignment } from "./api.js";

export const writingOnboarding: OnboardingDescriptor = {
  id: "writing",
  title: "Writing",
  usesLLM: false,
  pitch: (product) =>
    `${product} records where every word of a student's writing came from: typed, pasted, or — when the instructor allows a chat — generated. It is a source record, not an AI detector: nothing is guessed or scored. Copying between documents is classified from keystroke timing, using a method from the research literature. Students see exactly what their instructor will see, before they submit, so the record protects them as much as it informs the instructor.`,
  async seed({ courseId, product, preset }) {
    // Title only. Instructions are the instructor's to write — setup never
    // puts words in their mouth. The chat follows the stance.
    const a = await createAssignment({
      courseId,
      title: "How we use " + product + " in this course",
      instructions: "",
      checkpoints: [{ name: "Draft", dueAt: null }],
      chatEnabled: preset.stance !== "none",
    });
    return { writingAssignmentId: a.id };
  },
  tour: ({ courseId, product }, ctx) => [
    {
      id: "writing.setup",
      side: "instructor",
      title: "A writing assignment, ready to go",
      body: `We set one up: the paragraph you'll give students about how ${product} is used in your course.`,
      route: `/course/${courseId}/instructor/assignments`,
    },
    {
      id: "writing.do",
      side: "student",
      title: "Write it as a student",
      body: "You're now the course's sample student, in your document for this assignment. Type a few sentences, paste one from your syllabus, then Submit.",
      route: ctx.writingAssignmentId
        ? `/course/${courseId}/writing/assignment/${ctx.writingAssignmentId}`
        : `/course/${courseId}/writing`,
    },
    {
      id: "writing.see",
      side: "instructor",
      title: "See what you'll see",
      body: "Here's the Sample Student's submission as you'll see every student's. Open it to see each word marked typed, pasted, or generated — the same record the student saw before submitting.",
      // Submissions live under their assignment; the setup made this one.
      route: ctx.writingAssignmentId
        ? `/course/${courseId}/instructor/submissions/writing/${ctx.writingAssignmentId}`
        : `/course/${courseId}/instructor/assignments`,
    },
  ],
};

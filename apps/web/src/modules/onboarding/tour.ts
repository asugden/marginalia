// Composing the tour and the Meet-agent material from descriptors. Pure: no
// I/O and no import of the registry, so tour.test.ts can drive it with
// stand-in descriptors.

import { descriptorsFor, normalizePreset } from "./presets.js";
import type {
  OnboardingDescriptor,
  Preset,
  SetupContext,
  SetupEnv,
  TourStep,
} from "./types.js";

/** The product-level "why", owned here because it is about the whole tool,
 *  not any one feature. Also the opening screen of the welcome flow. */
export function whyText(product: string): string {
  return `${product} exists to rebuild the social contract between students and instructors around generative AI. Instructors can see where AI was used; students can see exactly what their instructor sees, so they're safe from accusation. It keeps a record of where work came from — typed, pasted, or generated — rather than guessing whether a machine wrote it.`;
}

export function setupEnv(
  courseId: string,
  product: string,
  input: Preset,
  all: readonly OnboardingDescriptor[],
): SetupEnv {
  const preset = normalizePreset(input);
  return {
    courseId,
    product,
    preset,
    material: [
      { title: `Why ${product} exists`, text: whyText(product) },
      ...descriptorsFor(preset, all).map((d) => ({ title: d.title, text: d.pitch(product) })),
    ],
  };
}

/** The whole tour for a preset: each chosen feature's steps in tour order,
 *  then a closing step. */
export function buildTour(
  env: SetupEnv,
  ctx: SetupContext,
  all: readonly OnboardingDescriptor[],
): TourStep[] {
  const steps = descriptorsFor(env.preset, all).flatMap((d) => d.tour(env, ctx));
  steps.push({
    id: "done",
    side: "instructor",
    title: "Invite your students",
    body: "That's the tour. When you're ready, share the join code from People — students add themselves. You can restart this tour from Settings.",
    route: `/course/${env.courseId}/instructor/roster`,
  });
  return steps;
}

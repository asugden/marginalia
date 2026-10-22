// Running setup: turn the welcome-flow answers into a configured course.
//
// Every write goes through an existing endpoint — the course's module
// switches, the writing chat setting, the personal AI preference, and each
// descriptor's own seed — so the server's validation and permissions apply
// exactly as they would to an instructor clicking through Settings.

import type { CoursePatch } from "../../api.js";
import { createCourse, setCourseFeature, setGenaiOptOut } from "../../client.js";
import { saveProgress } from "./api.js";
import { descriptorsFor, settingsFor } from "./presets.js";
import { DESCRIPTORS } from "./registry.js";
import { buildTour, setupEnv } from "./tour.js";
import type { Preset, SetupContext } from "./types.js";

/** The deployment's product name, as branded. */
export const PRODUCT: string = import.meta.env.BRAND_WORDMARK || "Marginalia";

/**
 * Create the course and everything the tour needs. Returns the course id and
 * the route of the tour's first step.
 */
export async function runSetup(params: {
  name: string;
  term?: CoursePatch;
  preset: Preset;
}): Promise<{ courseId: string; firstRoute: string }> {
  const settings = settingsFor(params.preset);

  // The preference first: a course created by someone who has opted out is
  // born with its AI features off (the worker reconciles on creation).
  await setGenaiOptOut(settings.genaiOptOut);

  const course = await createCourse(params.name, params.term);
  const courseId = course.id;

  await setCourseFeature(courseId, "provenance", settings.provenance);
  await setCourseFeature(courseId, "code", settings.code);
  // Never true for an opted-out creator (settingsFor), so this can't collide
  // with the worker's no-AI lock.
  await setCourseFeature(courseId, "agents", settings.agents);
  // The writing chat is per assignment (0033): the writing descriptor's seed
  // sets it on the assignment it creates.

  const env = setupEnv(courseId, PRODUCT, params.preset, DESCRIPTORS);
  const ctx: SetupContext = {};
  for (const d of descriptorsFor(env.preset, DESCRIPTORS)) {
    Object.assign(ctx, await d.seed(env));
  }

  await saveProgress(courseId, { preset: env.preset, context: ctx, step: 0 });
  const first = buildTour(env, ctx, DESCRIPTORS)[0]!;
  return { courseId, firstRoute: first.route };
}

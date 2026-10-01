// The list of features onboarding can set up and tour. Adding a feature to
// onboarding = write its descriptor beside its code, then add it here.

import { agentsOnboarding } from "../../pages/agentsOnboarding.js";
import { codeOnboarding } from "../code/onboarding.js";
import { writingOnboarding } from "../provenance/onboarding.js";
import type { OnboardingDescriptor } from "./types.js";

export const DESCRIPTORS: readonly OnboardingDescriptor[] = [
  agentsOnboarding,
  writingOnboarding,
  codeOnboarding,
];

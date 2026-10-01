// The onboarding contract. Feature modules implement `OnboardingDescriptor`
// beside their own code; this module composes them and owns no feature
// knowledge. Change a feature → change its descriptor in the same PR.

/** Where the instructor stands on generative AI, asked first. */
export type Stance =
  /** No generative AI for students. Tracking only; AI is never demoed. */
  | "none"
  /** Open to it — show me. */
  | "open"
  /** Help me teach students to use AI well. */
  | "learn";

/** The features onboarding knows how to set up and tour. */
export type FeatureId = "agents" | "writing" | "code";

/** The instructor's answers from the welcome flow. */
export interface Preset {
  stance: Stance;
  /** Features they chose, in no particular order. */
  features: FeatureId[];
  /** Whether the code module's chat should be on (only asked when code is
   *  chosen and the stance allows AI). */
  codeChat?: boolean;
}

/** What every descriptor receives when it seeds content or builds its tour. */
export interface SetupEnv {
  courseId: string;
  /** The deployment's product name (the branding wordmark). */
  product: string;
  preset: Preset;
  /** The "why" and each chosen feature's pitch, in tour order. The guided
   *  "Meet the product" agent is built from exactly this, so what it says
   *  and what the tour shows come from one source. */
  material: Array<{ title: string; text: string }>;
}

/** Ids of what setup created, keyed by whatever each descriptor chooses.
 *  Stored server-side as opaque JSON so tour links survive a reload. */
export type SetupContext = Record<string, string>;

export interface TourStep {
  /** Stable within the tour; `<feature>.<name>`. */
  id: string;
  /** Which view this step is shown in. The tour switches identity for you:
   *  "student" steps run as the course's sample student. */
  side: "instructor" | "student";
  title: string;
  /** One or two plain sentences. What to do, and what to notice. */
  body: string;
  /** Where the step happens. */
  route: string;
}

export interface OnboardingDescriptor {
  id: FeatureId;
  /** Short name shown on the welcome flow's choices. */
  title: string;
  /** One paragraph on what the feature is and why it exists. Shown during
   *  setup AND used as the guided "Meet the product" agent's material, so
   *  the tour and the agent can't drift apart. */
  pitch: (product: string) => string;
  /** Uses an LLM. Filtered out entirely for the "none" stance. */
  usesLLM: boolean;
  /** Reachable but not front-and-centre (code, next to writing). */
  secondary?: boolean;
  /** Create what the tour points at, via the feature's own API. Returns ids
   *  to merge into the setup context. */
  seed: (env: SetupEnv) => Promise<SetupContext>;
  /** The set up → do it → see it steps for this feature. */
  tour: (env: SetupEnv, ctx: SetupContext) => TourStep[];
}

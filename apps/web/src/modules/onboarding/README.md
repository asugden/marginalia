# onboarding (web)

First-run setup for instructors and a guided tour of their course, shown from
both sides: the instructor's, and a student's.

## Pieces

- **`/welcome`** (`components/WelcomePage.tsx`) — four screens: why the tool
  exists; where the instructor stands on generative AI; what their students
  make; their course. The answers become a `Preset`.
- **`setup.ts`** — turns a `Preset` into a real course: the personal
  "not interested in generative AI" preference, the course's module switches,
  and each chosen feature's seed content. Every write goes through an existing
  endpoint, so the server's rules apply unchanged.
- **`components/TourPanel.tsx`** — the tour, pinned to the corner of every
  course surface. Each step names a side; moving to a step switches the
  session first (student steps run as the course's **sample student**, a real
  student account), then navigates.
- **`components/RestartTour.tsx`** — "Restart the tour", in course Settings.
- **`presets.ts` / `tour.ts`** — pure rules: answers → settings, tour order,
  tour composition. Tested in `onboarding.test.ts` (`npm test`).

## The descriptor contract

This module owns **no feature knowledge**. Each feature exports an
`OnboardingDescriptor` (`types.ts`) beside its own code:

| feature | descriptor |
|---|---|
| Writing | `modules/provenance/onboarding.ts` |
| Code | `modules/code/onboarding.ts` |
| Agents | `pages/agentsOnboarding.ts` (agents predate `modules/`) |

A descriptor gives a one-paragraph `pitch`, whether it `usesLLM`, a `seed`
that creates tour content through the feature's own API, and the `tour` steps
(set up → do it as the student → see it as the instructor).

**When a feature changes, change its descriptor in the same PR.** To add a
feature to onboarding: write its descriptor, add it to `registry.ts`, give it
a place in `ORDER` (`presets.ts`), and extend `onboarding.test.ts`.

## Rules the tests hold

- The **"none"** stance (no generative AI) never produces an LLM step, an LLM
  setting, or LLM material — even if a caller slips `agents` into the preset.
- Tour order is agents (the introduction) → writing → code (secondary), and
  every tour ends on inviting students.
- Every step's route is inside the course.

## Product name

Copy never hardcodes a name. `PRODUCT` (`setup.ts`) is the branding wordmark
(`import.meta.env.BRAND_WORDMARK`), passed into every descriptor, so a branded
deployment's tour — and its guided "Meet <product>" agent — use that name.

## The "Meet <product>" agent

For AI stances, the agents descriptor seeds a guided agent about the product
itself, so an instructor trying an agent as a student learns something
relevant. Its topics are built from `SetupEnv.material` — the product's "why"
plus each chosen feature's `pitch` — the same text the welcome flow shows. The
agent and the tour cannot drift apart.

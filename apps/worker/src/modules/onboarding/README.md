# onboarding (worker)

Stores where an instructor is in a course's guided tour. That is all it does.

## Why so little

The tour is built in the web app (`apps/web/src/modules/onboarding/`) from
**descriptors** that each feature module exports next to its own code. A
descriptor says what the feature is, whether it uses an LLM, what it sets up
for the tour, and which screens to show from the instructor's side and the
student's side.

Everything setup creates — the course's settings, a writing assignment, a
guided agent, a coding assignment — goes through that feature's **existing**
endpoints, with their existing validation and permission checks. So this
module needs to know nothing about any feature, and a change to a feature's
tour never touches the worker.

## Data model

`onboarding_progress` — one row per (user, course):

| column | meaning |
|---|---|
| `preset_json` | the setup choices, `{ stance, features }` — opaque here |
| `context_json` | ids of what setup created, for tour steps to link to — opaque here |
| `step` | index of the current tour step |
| `completed_at` / `dismissed_at` | finished, or closed early |

## Routes

- `GET /api/onboarding/progress?courseId=` → `{ progress: … | null }`
- `PUT /api/onboarding/progress` `{ courseId, preset?, context?, step?, completed?, dismissed? }`

Course staff only (instructors and TAs).

## Invariant: progress belongs to the real user

The tour moves back and forth between the instructor's view and a preview of
the course as its **sample student** (see migration 0030). During a preview
the request's identity *is* the sample student, so these handlers key the row
on `identity.preview.realUserId` when it is set. This is the only code outside
the preview chrome that reads `identity.preview`, and it uses it only to pick
whose row to touch; the staff check runs against that same real user.

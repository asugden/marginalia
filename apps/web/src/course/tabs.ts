// v1.0 — single source of truth for the per-course tab strip + the
// course-header breadcrumb. Add a new tab here, and the dashboard's tab
// row + the per-page CourseLayout breadcrumb pick it up automatically.
//
// `visible(flags)` decides whether the tab shows in the strip. Pages
// remain reachable by URL even when their tab is hidden — `visible` is a
// dashboard-affordance hint, not an access gate (the worker authorizes
// every endpoint independently). Agents / Provenance / Roster always
// show; Attendance / Sources lazy-reveal once the course has used them.

import type { MeEnrollment } from "../client.js";

export interface TabSpec {
  /** URL slug after /course/:courseId/. Empty string = dashboard index.
   *  When `external` is true, this is the full absolute path instead. */
  slug: string;
  /** Visible label in the strip and in the page-header breadcrumb. */
  label: string;
  /** One-line description shown on the dashboard index under the tab strip. */
  description: string;
  visible: (e: MeEnrollment | undefined) => boolean;
  /** When true, the tab navigates *out* of the course-scoped routes.
   *  Provenance lives at /write today (course-agnostic surface owned by
   *  another module); the dashboard still surfaces it as a first-class
   *  destination so instructors can find it. */
  external?: boolean;
}

export const TABS: TabSpec[] = [
  {
    slug: "agents",
    label: "Agents",
    description:
      "AI helpers students can talk to. Each one carries its own voice and, optionally, an outline of topics or a set of sources.",
    visible: () => true,
  },
  {
    slug: "/write",
    label: "Provenance",
    description:
      "Writing assignments where every word is tagged by where it came from — typed, pasted, or generated. Lives at its own surface so all documents are visible together.",
    visible: () => true,
    external: true,
  },
  {
    slug: "attendance",
    label: "Attendance",
    description:
      "QR check-in for in-person classes. Each session shows a rotating code on a projector; students scan from their phones.",
    visible: (e) => !!e?.showAttendance,
  },
  {
    slug: "collections",
    label: "Sources",
    description:
      "Document libraries you can attach to an agent. The agent answers from the sources you choose and cites them in line.",
    visible: (e) => !!e?.showCollections,
  },
  {
    slug: "roster",
    label: "Roster",
    description:
      "Who's enrolled in this course. Add by email, share a join code, or remove people who shouldn't be here.",
    visible: () => true,
  },
];

/** Find the tab matching the current URL pathname. Returns null on the
 *  dashboard index, or for any path that doesn't match a known tab. */
export function tabForPathname(
  pathname: string,
  courseId: string,
): TabSpec | null {
  const prefix = `/course/${courseId}`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/^\//, "");
  if (rest === "") return null;
  const head = rest.split("/")[0]!;
  return TABS.find((t) => t.slug === head) ?? null;
}

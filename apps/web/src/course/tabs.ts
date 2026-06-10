// v1.0 — single source of truth for the per-course tab strip + the
// course-header breadcrumb. Add a new tab here, and the dashboard's tab
// row + the per-page CourseLayout breadcrumb pick it up automatically.
//
// `visible(flags)` decides whether the tab shows in the strip. Pages
// remain reachable by URL even when their tab is hidden — `visible` is a
// dashboard-affordance hint, not an access gate (the worker authorizes
// every endpoint independently). Agents / Provenance / Roster always
// show; Attendance / Sources lazy-reveal once the course has used them.

// Tab visibility only depends on the lazy-reveal flags + (implicitly) role,
// not the whole MeEnrollment DTO. Keep the predicate's input to just those
// fields so adding unrelated enrollment fields (e.g. hideProvenanceMarks)
// doesn't force every visible()-caller to supply them.
export interface TabVisibilityFlags {
  showAttendance?: boolean;
  showCollections?: boolean;
}

export interface TabSpec {
  /** URL slug under the staff base /course/:courseId/instructor/. Empty
   *  string = the dashboard index. */
  slug: string;
  /** Visible label in the strip and in the page-header breadcrumb. */
  label: string;
  /** One-line description shown on the dashboard index under the tab strip. */
  description: string;
  visible: (e: TabVisibilityFlags | undefined) => boolean;
  /** When set, the tab links to a *student-scoped* surface instead of the
   *  staff base — i.e. /course/:courseId/<href> rather than
   *  /course/:courseId/instructor/<slug>. Provenance uses this: the writing
   *  tool is one surface under the student root (/course/:id/write); the
   *  instructor opens the same page and gets instructor-mode chrome (the
   *  marks toggle) from their role in context, rather than a separate staff
   *  copy. */
  studentHref?: string;
  /** Lazy-reveal feature key. Present on tabs that stay hidden until the
   *  course turns them on. The dashboard's "Add a tool" affordance and
   *  the worker's reveal-tab endpoint both key off this. Absent on
   *  always-visible tabs (Agents, Provenance, Roster). */
  revealFeature?: "attendance" | "collections";
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
    slug: "write",
    label: "Provenance",
    description:
      "Writing assignments where every word is tagged by where it came from — typed, pasted, or generated. Lives at its own surface so all documents are visible together.",
    visible: () => true,
    studentHref: "write",
  },
  {
    slug: "attendance",
    label: "Attendance",
    description:
      "QR check-in for in-person classes. Each session shows a rotating code on a projector; students scan from their phones.",
    visible: (e) => !!e?.showAttendance,
    revealFeature: "attendance",
  },
  {
    slug: "collections",
    label: "Sources",
    description:
      "Document libraries you can attach to an agent. The agent answers from the sources you choose and cites them in line.",
    visible: (e) => !!e?.showCollections,
    revealFeature: "collections",
  },
  {
    slug: "roster",
    label: "People",
    description:
      "Who's enrolled in this course. Add by email, share a join code, or remove people who shouldn't be here.",
    visible: () => true,
  },
];

/** Build the URL a tab links to. Most tabs live under the staff base
 *  (/course/:id/instructor/<slug>); a `studentHref` tab links to the
 *  student-scoped surface (/course/:id/<href>) instead. */
export function tabHref(tab: TabSpec, courseId: string): string {
  if (tab.studentHref) return `/course/${courseId}/${tab.studentHref}`;
  const base = `/course/${courseId}/instructor`;
  return tab.slug ? `${base}/${tab.slug}` : base;
}

/** Find the tab matching the current URL pathname. Returns null on the
 *  dashboard index, or for any path that doesn't match a known tab. Matches
 *  both the staff base (/course/:id/instructor/<slug>) and a tab's
 *  student-scoped surface (/course/:id/<href>). */
export function tabForPathname(
  pathname: string,
  courseId: string,
): TabSpec | null {
  const staffBase = `/course/${courseId}/instructor`;
  if (pathname.startsWith(staffBase)) {
    const rest = pathname.slice(staffBase.length).replace(/^\//, "");
    if (rest === "") return null;
    const head = rest.split("/")[0]!;
    return TABS.find((t) => t.slug === head && !t.studentHref) ?? null;
  }
  // A student-scoped tab surface (e.g. the provenance writing tool) viewed
  // from within the staff strip.
  const prefix = `/course/${courseId}`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length).replace(/^\//, "");
  if (rest === "") return null;
  const head = rest.split("/")[0]!;
  return TABS.find((t) => t.studentHref === head) ?? null;
}

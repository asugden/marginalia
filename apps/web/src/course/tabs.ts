// v1.0 — single source of truth for the per-course tab strip + the
// course-header breadcrumb. Add a new tab here, and the dashboard's tab
// row + the per-page CourseLayout breadcrumb pick it up automatically.
//
// ── The three bands ───────────────────────────────────────────────────────
//
// Nine flat tabs said nothing about how the pieces relate, so they are grouped
// into three bands that state something true:
//
//   Assign — what you hand to the class: writing, agents, examples, and later
//            readings and discussions. A new content type lands as a ROW on
//            the Assign page, not as a new tab.
//   Review — what comes back: submissions and attendance.
//   Build  — the ingredients you author assignments FROM: voices, libraries,
//            agent definitions. Never handed to a student directly.
//
// The distinction Build makes is the one that had been missing: a Voice is not
// a peer of an assignment, it is an ingredient of one. Dashboard and Settings
// sit outside the bands as course-level admin.
//
// Every pre-band URL still resolves — see the redirect shims in main.tsx.
// Students and instructors hold live links, so no path may 404.
//
// `visible(flags)` decides whether the tab shows in the strip. Pages
// remain reachable by URL even when their tab is hidden — `visible` is a
// dashboard-affordance hint, not an access gate (the worker authorizes
// every endpoint independently). Dashboard / Library / Voices / Roster /
// Settings always show; Agents / Attendance / Provenance are optional
// extensions toggled from Settings (Agents defaults on).

// Tab visibility only depends on the lazy-reveal flags + (implicitly) role,
// not the whole MeEnrollment DTO. Keep the predicate's input to just those
// fields so adding unrelated enrollment fields (e.g. hideProvenanceMarks)
// doesn't force every visible()-caller to supply them.
export interface TabVisibilityFlags {
  showAttendance?: boolean;
  agentsEnabled?: boolean;
  /** Writing (provenance) module. Drives the Submissions tab. */
  provenanceEnabled?: boolean;
  /** Code (Python notebooks) module. Default off. Drives the Code tab. */
  codeEnabled?: boolean;
}

/**
 * Which band a tab belongs to. `admin` is the ungrouped remainder (Dashboard,
 * Settings, People) — course-level chrome rather than one of the three verbs.
 */
export type Band = "assign" | "review" | "build" | "admin";

/** Display order + labels for the bands, for any surface that groups by them. */
export const BANDS: ReadonlyArray<{ band: Band; label: string }> = [
  { band: "assign", label: "Assign" },
  { band: "review", label: "Review" },
  { band: "build", label: "Build" },
  { band: "admin", label: "Course" },
];

export interface TabSpec {
  /** URL slug under the staff base /course/:courseId/instructor/. Empty
   *  string = the dashboard index. */
  slug: string;
  /** Which of the three bands this tab sits in. */
  band: Band;
  /** Visible label in the strip and in the page-header breadcrumb. */
  label: string;
  /** One-line description shown on the dashboard index under the tab strip. */
  description: string;
  visible: (e: TabVisibilityFlags | undefined) => boolean;
  /** When set, the tab links to a *student-scoped* surface instead of the
   *  staff base — i.e. /course/:courseId/<href> rather than
   *  /course/:courseId/instructor/<slug>. Provenance uses this: the writing
   *  tool is one surface under the student root (/course/:id/writing); the
   *  instructor opens the same page and gets instructor-mode chrome (the
   *  marks toggle) from their role in context, rather than a separate staff
   *  copy. */
  studentHref?: string;
  /** When set, the tab links to this absolute path verbatim (no course
   *  prefix). Used by Voices, which is a per-author library shared across an
   *  instructor's courses and lives at the course-agnostic /author/voices. */
  absoluteHref?: string;
  /** Lazy-reveal feature key. Present on tabs that stay hidden until the
   *  course turns them on. The dashboard's "Add a tool" affordance and
   *  the worker's reveal-tab endpoint both key off this. Absent on
   *  always-visible tabs (Library, Voices, Roster). */
  revealFeature?: "attendance" | "collections";
}

export const TABS: TabSpec[] = [
  {
    slug: "dashboard",
    band: "admin",
    label: "Dashboard",
    description:
      "The course at a glance — its term, key totals, the join code, and quick actions into every tool.",
    visible: () => true,
  },

  // ── Assign ───────────────────────────────────────────────────────────────
  // One tab for everything handed to the class. Writing, agents, and examples
  // all appear as rows on this page, typed and in due order, rather than as
  // three separate tabs that each reinvented dates and ordering.
  {
    slug: "assign",
    band: "assign",
    label: "Assign",
    description:
      "Everything you've set this class, on one list — writing, agents, and examples together, in the order they come due. An item with no dates is a supplement: available all term, never late.",
    // Always visible. Unlike the old Assignments tab this is not gated on the
    // Writing module: agents and examples are assignable without it, and a
    // course with Writing off still has a schedule worth seeing.
    visible: () => true,
  },

  // ── Review ───────────────────────────────────────────────────────────────
  // What comes back from the class.
  {
    slug: "submissions",
    band: "review",
    label: "Submissions",
    description:
      "Writing checkpoints students have shared. Each one is a frozen snapshot showing where every word came from.",
    // Only meaningful when the Writing module is on. Absent flag reads as on,
    // matching the COALESCE default the enrollment query applies.
    visible: (e) => e?.provenanceEnabled ?? true,
  },
  {
    // Coding assignments: authored here, reviewed per assignment from the
    // same page. Opt-in — absent flag reads as OFF, unlike Writing/Agents.
    slug: "code",
    band: "review",
    label: "Code",
    description:
      "Python notebooks that run in each student's browser. Set coding assignments, choose whether LLM chat is available, and read what students submit.",
    visible: (e) => !!e?.codeEnabled,
  },
  {
    slug: "attendance",
    band: "review",
    label: "Attendance",
    description:
      "QR check-in for in-person classes. Each session shows a rotating code on a projector; students scan from their phones.",
    visible: (e) => !!e?.showAttendance,
    revealFeature: "attendance",
  },

  // ── Build ────────────────────────────────────────────────────────────────
  // The ingredients assignments are made FROM. Never handed to a student
  // directly — that is what separates this band from Assign, and why a Voice
  // stopped being a peer of an assignment.
  {
    slug: "agents",
    band: "build",
    label: "Agents",
    description:
      "AI helpers students can talk to. Each one carries its own voice and, optionally, an outline of topics or a set of sources. Author them here; put them in front of students from Assign.",
    // Agents is an optional extension, default ON. Absent flag reads as on
    // (COALESCE default 1 in listEnrollmentsForUserEnriched), so only an
    // explicit instructor toggle-off hides it.
    visible: (e) => e?.agentsEnabled ?? true,
  },
  {
    slug: "voices",
    band: "build",
    label: "Voices",
    description:
      "The personas your agents speak in — tone, style, and pedagogy. Voices are yours and reusable across every course you teach.",
    visible: () => true,
  },
  {
    slug: "collections",
    band: "build",
    label: "Library",
    description:
      "Document libraries you can attach to an agent. The agent answers from the sources you choose and cites them in line.",
    // Library is a core surface — always visible, not toggleable. (The
    // show_collections column is retained and reads on by default, but there
    // is no longer an instructor toggle to turn it off.)
    visible: () => true,
  },

  // ── Course-level admin ───────────────────────────────────────────────────
  {
    slug: "roster",
    band: "admin",
    label: "People",
    description:
      "Who's enrolled in this course. Add by email, share a join code, or remove people who shouldn't be here.",
    visible: () => true,
  },
  {
    slug: "settings",
    band: "admin",
    label: "Settings",
    description:
      "Course stats, the term and the dates it runs, and which extensions (Agents, Writing, Attendance) are turned on.",
    visible: () => true,
  },
];

// Note: neither examples nor writing assignments have a tab of their own. Both
// are kinds of assignment, so they live as rows inside Assign — examples
// curated at instructor/assign/examples, writing authored at
// instructor/assignments. The student-facing examples list is unchanged and
// still sits at /course/:id/examples.

/** Tabs in one band, in declaration order, filtered by visibility. */
export function tabsInBand(
  band: Band,
  flags: TabVisibilityFlags | undefined,
): TabSpec[] {
  return TABS.filter((t) => t.band === band && t.visible(flags));
}

/* ── The header nav ────────────────────────────────────────────────────────
 *
 * The strip renders BANDS, not the flat tab list. Ten nowrap pills measured
 * ~850px against ~1050px of inner width once the lockup, course switcher, role
 * switch and sign-out took their share — the single row never actually fit at
 * any window size, which is why the role switch was the thing that fell off.
 *
 * So the header shows what the model already knew. `tabs.ts` has declared three
 * bands since the flat strip was retired ("nine flat tabs said nothing about
 * how the pieces relate"); the header just kept flattening them back. Now:
 *
 *   Dashboard · Assign · Review ▾ · Build ▾
 *
 * Dashboard and Assign are single destinations and stay direct links. Review
 * and Build are menus over their member tabs. Settings and People are NOT here
 * — they're course admin, and they live in the course switcher's menu, which is
 * already the course-scoped menu. Voices stays under Build but is flagged
 * `away: true` because it leaves the course entirely (/author/voices).
 *
 * A band holding exactly one visible tab renders as a direct link to that tab
 * rather than a one-item menu — a menu you open to find a single choice is
 * worse than the link it hides.
 */

/** One entry in the header strip: either a direct link (`items` length 1, or an
 *  explicitly single band like Dashboard/Assign) or a dropdown over `items`. */
export interface NavGroup {
  /** Stable key — the band, or the slug for a single-tab entry. */
  key: string;
  label: string;
  /** The tabs this entry covers. Length 1 ⇒ render as a direct link. */
  items: TabSpec[];
}

/** Bands rendered as their own top-level strip entry, in display order. Assign
 *  is a real band but has exactly one visible tab, so it falls out as a direct
 *  link via the length-1 rule — no special-casing needed. */
const NAV_BANDS: readonly Band[] = ["admin", "assign", "review", "build"];

/** Tabs that are course admin rather than course work. They're reachable from
 *  the course switcher menu instead of the strip, so the strip stays at four
 *  entries no matter how many admin surfaces exist. */
export const ADMIN_MENU_SLUGS: readonly string[] = ["roster", "settings"];

/** Build the header strip: Dashboard, Assign, Review ▾, Build ▾.
 *  Bands with no visible tabs are dropped entirely. */
export function navGroups(flags: TabVisibilityFlags | undefined): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const band of NAV_BANDS) {
    // Dashboard is the only `admin` tab in the strip; People and Settings move
    // to the course menu, so filter them out before the band is assembled.
    const items = tabsInBand(band, flags).filter(
      (t) => !ADMIN_MENU_SLUGS.includes(t.slug),
    );
    if (items.length === 0) continue;
    const meta = BANDS.find((b) => b.band === band);
    groups.push({
      key: items.length === 1 ? items[0]!.slug : band,
      // A single-tab band takes the TAB's name, not the band's — "Dashboard",
      // not "Course"; "Assign" happens to match either way.
      label: items.length === 1 ? items[0]!.label : (meta?.label ?? band),
      items,
    });
  }
  return groups;
}

/** The course-admin tabs, for the course switcher's menu. */
export function adminMenuTabs(flags: TabVisibilityFlags | undefined): TabSpec[] {
  return TABS.filter(
    (t) => ADMIN_MENU_SLUGS.includes(t.slug) && t.visible(flags),
  );
}

/** Build the URL a tab links to. Most tabs live under the staff base
 *  (/course/:id/instructor/<slug>); a `studentHref` tab links to the
 *  student-scoped surface (/course/:id/<href>) instead. */
export function tabHref(tab: TabSpec, courseId: string): string {
  if (tab.absoluteHref) return tab.absoluteHref;
  if (tab.studentHref) return `/course/${courseId}/${tab.studentHref}`;
  const base = `/course/${courseId}/instructor`;
  return tab.slug ? `${base}/${tab.slug}` : base;
}

/**
 * Surfaces that live under a band tab but keep their own first path segment.
 *
 * Writing assignments are authored at instructor/assignments (and their roster
 * at instructor/assignments/:id), which predates the bands and stays put so
 * existing links resolve. Both belong to Assign, so the strip has to highlight
 * Assign while the URL says something else — without this map the nav would go
 * blank on a page reached from its own band.
 *
 * Keyed by first path segment → owning tab slug.
 */
const SURFACE_OWNER: Record<string, string> = {
  assignments: "assign",
};

/** Find the tab matching the current URL pathname. Returns null on the
 *  dashboard index, or for any path that doesn't match a known tab. Matches
 *  both the staff base (/course/:id/instructor/<slug>) and a tab's
 *  student-scoped surface (/course/:id/<href>). */
export function tabForPathname(
  pathname: string,
  courseId: string,
): TabSpec | null {
  // Absolute-href tabs (Voices → /author/voices) match by their own path,
  // independent of the active course.
  const abs = TABS.find(
    (t) => t.absoluteHref && pathname.startsWith(t.absoluteHref),
  );
  if (abs) return abs;

  const staffBase = `/course/${courseId}/instructor`;
  if (pathname.startsWith(staffBase)) {
    const rest = pathname.slice(staffBase.length).replace(/^\//, "");
    if (rest === "") return null;
    const head = rest.split("/")[0]!;
    const owner = SURFACE_OWNER[head];
    if (owner) return TABS.find((t) => t.slug === owner) ?? null;
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

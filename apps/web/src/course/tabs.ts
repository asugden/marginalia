// v1.0 — single source of truth for the per-course tab strip + the
// course-header breadcrumb. Add a new tab here, and the dashboard's tab
// row + the per-page CourseLayout breadcrumb pick it up automatically.
//
// ── The three bands ───────────────────────────────────────────────────────
//
// Nine flat tabs said nothing about how the pieces relate, so they are grouped
// into three bands that state something true:
//
//   Assign — what you GIVE the class, one entry per assignment type:
//            Writing, Code, Agents, Examples — plus "All", the combined list,
//            shown only when more than one type is on. Create, edit, publish.
//   Review — what COMES BACK: Submissions (every type, listed by assignment,
//            each opening that assignment's submissions) and Attendance.
//   Build  — the ingredients assignments are made FROM: voices and libraries.
//            Never handed to a student directly.
//
// The split is by verb, not by type: an assignment appears under Assign (to
// author it) and under Review ▸ Submissions (to read what came in), and the
// two pages link to each other.
//
// Agents sit under Assign, not Build: an agent is something students are
// given, like a writing assignment. Voices and libraries are what an agent is
// made from. Dashboard and Settings sit outside the bands as course admin.
//
// Every pre-band URL still resolves — see the redirect shims in main.tsx.
// Students and instructors hold live links, so no path may 404.
//
// `visible(flags)` decides whether the tab shows in the strip. Pages
// remain reachable by URL even when their tab is hidden — `visible` is a
// dashboard-affordance hint, not an access gate (the worker authorizes
// every endpoint independently). Dashboard / Library / Voices / Roster /
// Settings always show; Agents / Attendance / Writing / Code are optional
// extensions toggled from Settings (Agents defaults on).

import type { Capability } from "../api.js";

// Tab visibility only depends on the lazy-reveal flags + (implicitly) role,
// not the whole MeEnrollment DTO. Keep the predicate's input to just those
// fields so adding unrelated enrollment fields (e.g. hideProvenanceMarks)
// doesn't force every visible()-caller to supply them.
export interface TabVisibilityFlags {
  /** What the caller's role may do here (from /api/me). A tab whose
   *  `requires` isn't held is hidden — a TA sees People, Submissions and
   *  Attendance, not the authoring bands. */
  capabilities?: Capability[];
  showAttendance?: boolean;
  agentsEnabled?: boolean;
  /** The caller opted out of generative AI (personal). Hides Agents, Voices,
   *  and the Library they draw on — from this person's screens only. */
  genaiOptOut?: boolean;
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
  /** The capability a role needs to see this tab at all. Omitted = any
   *  course staff (the dashboard). Like `visible`, an affordance only; the
   *  worker authorizes every endpoint itself. */
  requires?: Capability;
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
  // One entry per assignment type, plus "All" when there's more than one type.
  {
    slug: "assign",
    requires: "author",
    band: "assign",
    label: "All",
    description:
      "Everything you've set this class, on one list and in the order it comes due. Shown when more than one kind of assignment is on.",
    // Only when it would say more than a single type's page already does.
    visible: (e) => assignTypesShown(e) > 1,
  },
  {
    // Writing assignments. The URL predates the bands and stays so links
    // resolve.
    slug: "assignments",
    requires: "author",
    band: "assign",
    label: "Writing",
    description:
      "Writing assignments: instructions and checkpoints, one document per student across all of them.",
    // Absent flag reads as on, matching the enrollment query's COALESCE.
    visible: (e) => e?.provenanceEnabled ?? true,
  },
  {
    // Coding assignments. Opt-in — absent flag reads as OFF, unlike
    // Writing/Agents.
    slug: "code",
    requires: "author",
    band: "assign",
    label: "Code",
    description:
      "Python notebooks that run in each student's browser: starter notebooks, deadlines, and whether LLM chat is available.",
    visible: (e) => !!e?.codeEnabled,
  },
  {
    slug: "agents",
    requires: "author",
    band: "assign",
    label: "Agents",
    description:
      "AI helpers students can talk to. Each one carries its own voice and, optionally, an outline of topics or a set of sources.",
    // Agents is an optional extension, default ON. Absent flag reads as on
    // (COALESCE default 1 in listEnrollmentsForUserEnriched), so only an
    // explicit instructor toggle-off hides it.
    visible: (e) => (e?.agentsEnabled ?? true) && !e?.genaiOptOut,
  },
  {
    // Examples have no create form — they're curated from the registry — so
    // this is the curation page. Two segments deep; tabForPathname matches
    // the longest slug, so it doesn't read as "All".
    slug: "assign/examples",
    requires: "author",
    band: "assign",
    label: "Examples",
    description:
      "Interactive teaching pages to put on the schedule. Pick which ones this class should work through.",
    visible: () => true,
  },

  // ── Review ───────────────────────────────────────────────────────────────
  // What comes back from the class.
  {
    // Every assignment that takes submissions, one row per writing checkpoint
    // or coding assignment, each opening that assignment's submissions. This
    // was once a flat feed of writing snapshots; the URL is kept.
    slug: "submissions",
    requires: "view_submissions",
    band: "review",
    label: "Submissions",
    description:
      "What students have handed in, by assignment: who submitted, who was on time, and who hasn't yet.",
    visible: (e) => (e?.provenanceEnabled ?? true) || !!e?.codeEnabled,
  },
  {
    slug: "attendance",
    requires: "run_attendance",
    band: "review",
    label: "Attendance",
    description:
      "QR check-in for in-person classes. Each session shows a rotating code on a projector; students scan from their phones.",
    visible: (e) => !!e?.showAttendance,
  },

  // ── Build ────────────────────────────────────────────────────────────────
  // The ingredients assignments are made FROM. Never handed to a student
  // directly — that is what separates this band from Assign.
  {
    slug: "voices",
    requires: "author",
    band: "build",
    label: "Voices",
    description:
      "The personas your agents speak in — tone, style, and pedagogy. Voices are yours and reusable across every course you teach.",
    visible: (e) => !e?.genaiOptOut,
  },
  {
    slug: "collections",
    requires: "author",
    band: "build",
    label: "Library",
    description:
      "Document libraries you can attach to an agent. The agent answers from the sources you choose and cites them in line.",
    // Library is a core surface — always visible, not toggleable. (The
    // show_collections column is retained and reads on by default, but there
    // is no longer an instructor toggle to turn it off.)
    visible: (e) => !e?.genaiOptOut,
  },

  // ── Course-level admin ───────────────────────────────────────────────────
  {
    slug: "roster",
    requires: "manage_students",
    band: "admin",
    label: "People",
    description:
      "Who's enrolled in this course. Add by email, share a join code, or remove people who shouldn't be here.",
    visible: () => true,
  },
  {
    slug: "settings",
    requires: "author",
    band: "admin",
    label: "Settings",
    description:
      "Course stats, the term and the dates it runs, and which extensions (Agents, Writing, Attendance) are turned on.",
    visible: () => true,
  },
];

/** How many assignment TYPES (every Assign tab but "All") show for these
 *  flags. "All" appears only when this is more than one. */
function assignTypesShown(flags: TabVisibilityFlags | undefined): number {
  return TABS.filter(
    (t) => t.band === "assign" && t.slug !== "assign" && tabShows(t, flags),
  ).length;
}

/** Whether a tab shows for these flags: its module is on AND the caller's role
 *  holds the capability it requires. */
export function tabShows(t: TabSpec, flags: TabVisibilityFlags | undefined): boolean {
  if (!t.visible(flags)) return false;
  return !t.requires || (flags?.capabilities?.includes(t.requires) ?? false);
}

/** Tabs in one band, in declaration order, filtered by visibility. */
export function tabsInBand(
  band: Band,
  flags: TabVisibilityFlags | undefined,
): TabSpec[] {
  return TABS.filter((t) => t.band === band && tabShows(t, flags));
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
 *   Dashboard · Assign ▾ · Review ▾ · Build ▾
 *
 * Dashboard is a direct link. Assign, Review and Build are menus over their
 * member tabs — Assign's members are the assignment types, so reaching one
 * type's list is one click from anywhere. Settings and People are NOT here
 * — they're course admin, and they live in the course switcher's menu, which is
 * already the course-scoped menu. Voices sits under Build like any other tab;
 * the pages are course-agnostic in content but mounted in the course shell.
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

/** Bands rendered as their own top-level strip entry, in display order. A band
 *  with one visible tab falls out as a direct link via the length-1 rule. */
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
      // not "Course"; "Attendance", not "Review".
      label: items.length === 1 ? items[0]!.label : (meta?.label ?? band),
      items,
    });
  }
  return groups;
}

/** The course-admin tabs, for the course switcher's menu. */
export function adminMenuTabs(flags: TabVisibilityFlags | undefined): TabSpec[] {
  return TABS.filter(
    (t) => ADMIN_MENU_SLUGS.includes(t.slug) && tabShows(t, flags),
  );
}

/** Build the URL a tab links to: the staff base (/course/:id/instructor/<slug>),
 *  or the dashboard index for the empty slug. */
export function tabHref(tab: TabSpec, courseId: string): string {
  const base = `/course/${courseId}/instructor`;
  return tab.slug ? `${base}/${tab.slug}` : base;
}

/**
 * Surfaces that belong to a tab but sit under ANOTHER tab's path. One code
 * submission's page lives at code/submissions/:id (its URL predates Review)
 * but is reached from Review ▸ Submissions.
 *
 * Keyed by path prefix → owning tab slug; checked before slug matching.
 */
const SURFACE_OWNER: Array<[string, string]> = [["code/submissions/", "submissions"]];

/** Find the tab matching the current URL pathname. Returns null on the
 *  dashboard index, or for any path that doesn't match a known tab. Every tab
 *  lives under the staff base (/course/:id/instructor/<slug>). Slugs can be
 *  more than one segment ("assign/examples"), so the LONGEST matching slug
 *  wins — /assign/examples is Examples, not All. */
export function tabForPathname(
  pathname: string,
  courseId: string,
): TabSpec | null {
  const staffBase = `/course/${courseId}/instructor`;
  if (!pathname.startsWith(staffBase)) return null;
  const rest = pathname.slice(staffBase.length).replace(/^\//, "");
  if (rest === "") return null;
  const owner = SURFACE_OWNER.find(([prefix]) => rest.startsWith(prefix))?.[1];
  if (owner) return TABS.find((t) => t.slug === owner) ?? null;
  let best: TabSpec | null = null;
  for (const t of TABS) {
    if (rest === t.slug || rest.startsWith(t.slug + "/")) {
      if (!best || t.slug.length > best.slug.length) best = t;
    }
  }
  return best;
}

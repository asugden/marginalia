import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useParams } from "react-router-dom";
// RootRedirect (the `/` resolver) and the student DashboardPage + ConversationPage
// stay eager — they're what a cold load hits. RootRedirect uses the inlined
// bootstrap to bounce straight to /course/:id/dashboard with no Loading flash;
// the dashboard + chat are the immediate landing targets. Everything else is
// staff-only or rarely reached on first paint; lazy-load it so a student isn't
// shipping AdminPage + the entire author surface on first navigation.
import { RootRedirect } from "./pages/RootRedirect.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { LegacyWriteRedirect } from "./pages/LegacyWriteRedirect.js";
import { ConversationPage } from "./pages/ConversationPage.js";
// The 404 / error screen. Eager, not lazy: it is the fallback for a failed
// chunk load, so it must not itself depend on one loading successfully.
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { EXAMPLES } from "./examples/registry.js";
import "./styles.css";

const AuthorListPage = lazy(() =>
  import("./pages/AuthorListPage.js").then((m) => ({ default: m.AuthorListPage })));
const AuthorEditPage = lazy(() =>
  import("./pages/AuthorEditPage.js").then((m) => ({ default: m.AuthorEditPage })));
const AuthorVariantResultsPage = lazy(() =>
  import("./pages/AuthorVariantResultsPage.js").then((m) => ({ default: m.AuthorVariantResultsPage })));
const CollectionsListPage = lazy(() =>
  import("./pages/CollectionsListPage.js").then((m) => ({ default: m.CollectionsListPage })));
const CollectionDetailPage = lazy(() =>
  import("./pages/CollectionDetailPage.js").then((m) => ({ default: m.CollectionDetailPage })));
const RosterPage = lazy(() =>
  import("./pages/RosterPage.js").then((m) => ({ default: m.RosterPage })));
const JoinPage = lazy(() =>
  import("./pages/JoinPage.js").then((m) => ({ default: m.JoinPage })));
const AdminPage = lazy(() =>
  import("./pages/AdminPage.js").then((m) => ({ default: m.AdminPage })));
const UserDetailPage = lazy(() =>
  import("./pages/UserDetailPage.js").then((m) => ({ default: m.UserDetailPage })));
const AuthorVoicesPage = lazy(() =>
  import("./pages/AuthorVoicesPage.js").then((m) => ({ default: m.AuthorVoicesPage })));
const AuthorVoiceEditPage = lazy(() =>
  import("./pages/AuthorVoiceEditPage.js").then((m) => ({ default: m.AuthorVoiceEditPage })));
// Standalone design-system gallery (course-agnostic; unlinked). Lives here so
// it reuses the live token layer + brand seam + component barrel.
const DesignGalleryPage = lazy(() =>
  import("./pages/DesignGalleryPage.js").then((m) => ({ default: m.DesignGalleryPage })));
// Provenance module — see apps/web/src/modules/provenance/README.md.
const ProvenanceDocumentListPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.DocumentListPage })));
const ProvenanceEditorPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.EditorPage })));
const ProvenanceAgentsPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.AgentsPage })));
const ProvenancePublicPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.PublicSubmissionPage })));
const ProvenanceSubmissionsPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.SubmissionsPage })));
const ProvenanceAssignmentsPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.AssignmentsPage })));
// The Assign band — one list of everything the course assigns, whatever kind.
// Supersedes the writing+examples union ProvenanceAssignmentsPage rendered; that
// page stays mounted as the writing authoring surface. See
// apps/web/src/modules/course-items/README.md.
const AssignPage = lazy(() =>
  import("./modules/course-items/index.js").then((m) => ({ default: m.AssignPage })));
const ProvenanceAssignmentRosterPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.AssignmentRosterPage })));
// Review ▸ Submissions — every type's assignments, by what came back.
const ReviewSubmissionsPage = lazy(() =>
  import("./pages/ReviewSubmissionsPage.js").then((m) => ({ default: m.ReviewSubmissionsPage })));
const ProvenanceNewAssignmentPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.NewAssignmentPage })));
const ProvenanceCheckpointPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.CheckpointPage })));
// Examples — standalone, public, unauthenticated interactive teaching pages.
// See apps/web/src/examples/registry.ts. Each example's page is lazy-loaded
// from the registry; the index page lists them.
const ExamplesIndexPage = lazy(() =>
  import("./examples/ExamplesIndexPage.js").then((m) => ({ default: m.ExamplesIndexPage })));
// Course-attached examples — curation + the two usage surfaces. Distinct from
// the public example pages above: these are course-scoped and authenticated,
// while the examples themselves stay public and ungated. See
// apps/web/src/modules/examples/README.md.
const StudentExamplesPage = lazy(() =>
  import("./modules/examples/index.js").then((m) => ({ default: m.StudentExamplesPage })));
// Instructor-side curation + the two usage surfaces. Routed under the Assign
// band (instructor/assign/examples), not as a tab of its own — an example is a
// kind of assignment. See apps/web/src/course/tabs.ts.
const InstructorExamplesPage = lazy(() =>
  import("./modules/examples/index.js").then((m) => ({ default: m.InstructorExamplesPage })));
const ExampleCourseStrip = lazy(() =>
  import("./modules/examples/index.js").then((m) => ({ default: m.ExampleCourseStrip })));
// Code module — browser-run Python notebooks. Optional, off by default per
// course. See apps/web/src/modules/code/README.md. Lazy, so the editor and the
// Python runtime are only ever downloaded by someone who opens a notebook.
const CodeHomePage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.CodeHomePage })));
const CodeNotebookPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.NotebookPage })));
const ProvenanceOpenAssignment = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.OpenAssignmentDocument })));
const CodeOpenAssignment = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.OpenAssignmentNotebook })));
const CodeStarterPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.StarterNotebookPage })));
const CodeSandboxPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.SandboxNotebookPage })));
const CodeInstructorPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.InstructorCodePage })));
const CodeNewAssignmentPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.NewCodeAssignmentPage })));
const CodeRosterPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.RosterPage })));
const CodeSubmissionPage = lazy(() =>
  import("./modules/code/index.js").then((m) => ({ default: m.SubmissionPage })));
// Attendance module — see apps/web/src/modules/attendance/README.md.
const AttendanceSessionListPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.SessionListPage })));
const AttendanceDisplayPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.DisplayPage })));
const AttendanceCheckInPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.CheckInPage })));

// Two course-rooted shells. The student is the primary surface and owns the
// clean course root (/course/:courseId/*, StudentLayout); the instructor view
// is secondary and prefixed (/course/:courseId/instructor/*, CourseLayout).
// Both read :courseId from the URL and provide it via CourseContext.
const StudentLayout = lazy(() =>
  import("./pages/StudentLayout.js").then((m) => ({ default: m.StudentLayout })));
const CourseLayout = lazy(() =>
  import("./pages/CourseLayout.js").then((m) => ({ default: m.CourseLayout })));
const InstructorDashboardPage = lazy(() =>
  import("./pages/InstructorDashboardPage.js").then((m) => ({ default: m.InstructorDashboardPage })));
const CourseSettingsPage = lazy(() =>
  import("./pages/CourseSettingsPage.js").then((m) => ({ default: m.CourseSettingsPage })));
const StudentAgentsPage = lazy(() =>
  import("./pages/StudentAgentsPage.js").then((m) => ({ default: m.StudentAgentsPage })));
const CoursePickerPage = lazy(() =>
  import("./pages/CoursePickerPage.js").then((m) => ({ default: m.CoursePickerPage })));
const WelcomePage = lazy(() =>
  import("./modules/onboarding/index.js").then((m) => ({ default: m.WelcomePage })));
const LegacyCourseRedirect = lazy(() =>
  import("./pages/LegacyCourseRedirect.js").then((m) => ({ default: m.LegacyCourseRedirect })));

// Wraps a lazy element so Suspense fallback renders while the chunk
// downloads. The fallback is intentionally bare — pages render their own
// loading state on top of this almost immediately.
function lz(node: React.ReactNode) {
  return <Suspense fallback={<div className="page" />}>{node}</Suspense>;
}

/**
 * Examples used to be their own instructor tab at instructor/examples. They are
 * now a kind of assignment and live under the Assign band at
 * instructor/assign/examples, so this shim bounces the old path. Built like
 * LegacyWriteRedirect — the course is already in the URL, so the redirect just
 * rewrites the tail. An absolute path rather than a relative `..`, because
 * relative Navigate resolves against the route hierarchy rather than the URL,
 * which is easy to get subtly wrong.
 */
function LegacyInstructorExamplesRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  return <Navigate to={`/course/${courseId}/instructor/assign/examples`} replace />;
}

/**
 * The nav moved from nine flat tabs to three bands (Assign / Review / Build),
 * and examples curation moved with it: instructor/assignments/examples →
 * instructor/assign/examples. Instructors hold links to the old path, so it
 * redirects rather than 404ing.
 *
 * (The per-assignment roster at `instructor/assignments/:id` has since moved
 * too, to Review: see the ParamRedirect beside it.)
 */
function LegacyAssignmentsExamplesRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  return <Navigate to={`/course/${courseId}/instructor/assign/examples`} replace />;
}

/**
 * Redirect an old instructor URL to its new home under the same course,
 * carrying route params across: `to` is relative to /course/:id/instructor/
 * and its `:name` segments are filled from the current match.
 */
function ParamRedirect({ to }: { to: string }) {
  const params = useParams();
  const tail = to.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ""));
  return <Navigate to={`/course/${params.courseId}/instructor/${tail}`} replace />;
}

const routes = [
  // `/` resolves to the right course-rooted home (or the join prompt).
  { path: "/", element: <RootRedirect /> },
  // v1.0 §2 — explicit picker entry point (deep-linkable from the dashboard's
  // "Switch course" menu).
  { path: "/courses", element: lz(<CoursePickerPage />) },
  // First-run setup for someone allowed to create courses (RootRedirect sends
  // a creator with no courses here; the picker links to it too).
  { path: "/welcome", element: lz(<WelcomePage />) },

  // ── Legacy redirect shims (keep ≥6 months past the cutover) ──────────────
  // Course-agnostic student URLs from before the course-rooted model.
  // LegacyCourseRedirect resolves the caller's default course and replaces the
  // URL with the new course-scoped equivalent.
  { path: "/c/:conversationId", element: lz(<LegacyCourseRedirect to="/chat/:conversationId" />) },
  { path: "/new/:agentId", element: lz(<LegacyCourseRedirect to="/chat/new/:agentId" />) },
  // History page removed (v1.1) — each module owns its own history now (agents
  // in the conversation sidebar, writing in the document list). The old
  // course-agnostic /history bounces to the course home.
  { path: "/history", element: lz(<LegacyCourseRedirect to="/" />) },
  // v1.2 renamed the writing surface to /writing — land these directly there.
  { path: "/write", element: lz(<LegacyCourseRedirect to="/writing" />) },
  { path: "/write/agents", element: lz(<LegacyCourseRedirect to="/writing/agents" />) },
  { path: "/write/:id", element: lz(<LegacyCourseRedirect to="/writing/:id" />) },
  // Legacy /author/... → the instructor surface.
  { path: "/author/agents", element: lz(<LegacyCourseRedirect to="/instructor/agents" />) },
  { path: "/author/agents/new", element: lz(<LegacyCourseRedirect to="/instructor/agents/new" />) },
  { path: "/author/agents/:id", element: lz(<LegacyCourseRedirect to="/instructor/agents/:id" />) },
  { path: "/author/collections", element: lz(<LegacyCourseRedirect to="/instructor/collections" />) },
  { path: "/author/collections/:id", element: lz(<LegacyCourseRedirect to="/instructor/collections/:id" />) },
  { path: "/author/roster", element: lz(<LegacyCourseRedirect to="/instructor/roster" />) },
  // Voices moved into the course shell so the instructor nav persists. They
  // remain a per-author, cross-course library in *content* — the course prefix
  // is only there to keep the chrome. Old global URLs redirect to the caller's
  // default course.
  { path: "/author/voices", element: lz(<LegacyCourseRedirect to="/instructor/voices" />) },
  { path: "/author/voices/new", element: lz(<LegacyCourseRedirect to="/instructor/voices/new" />) },
  { path: "/author/voices/:id", element: lz(<LegacyCourseRedirect to="/instructor/voices/:id" />) },
  { path: "/attendance", element: lz(<LegacyCourseRedirect to="/instructor/attendance" />) },
  {
    path: "/attendance/sessions/:id",
    element: lz(<LegacyCourseRedirect to="/instructor/attendance/sessions/:id" />),
  },

  // ── Examples ─────────────────────────────────────────────────────────────
  // Public, unauthenticated, course-agnostic interactive teaching pages. The
  // index lists the registry; each example mounts at its own slug. These are
  // static SPA routes served by env.ASSETS with no /api dependency.
  { path: "/examples", element: lz(<ExamplesIndexPage />) },
  // Subword embeddings (fastText) was its own example until it was folded into
  // the bottom of word embeddings, where it belongs — it is the answer to a
  // wall that example runs into, not a separate idea. Instructors linked the
  // old slug into course material, so it lands on the section rather than
  // 404ing. Keep this shim.
  {
    path: "/examples/fasttext",
    element: <Navigate to="/examples/word2vec#subword" replace />,
  },
  {
    // Renamed from digit-recognizer; the old URL is in course material.
    path: "/examples/digit-recognizer",
    element: <Navigate to="/examples/deep-neural-network" replace />,
  },
  ...EXAMPLES.map((ex) => ({
    path: `/examples/${ex.slug}`,
    // The course strip is mounted here rather than inside each example page,
    // so every example — including ones added later — picks it up without
    // having to know courses exist. It renders NOTHING unless the URL carries
    // ?c=<courseId> and the viewer is enrolled in that course, so the page an
    // anonymous visitor sees is unchanged.
    element: lz(
      <>
        <ExampleCourseStrip slug={ex.slug} />
        <ex.Page />
      </>,
    ),
  })),

  // ── Course-agnostic survivors ────────────────────────────────────────────
  { path: "/join/:code", element: lz(<JoinPage />) },
  { path: "/admin", element: lz(<AdminPage />) },
  // Standalone component gallery — not linked from any nav; reachable by URL.
  { path: "/design", element: lz(<DesignGalleryPage />) },
  // v0.7 §3.8 — per-user detail. Admin-only on the server.
  { path: "/users/:id", element: lz(<UserDetailPage />) },
  // Public, unauthenticated shared-submission viewer (slice 6).
  { path: "/s/:token", element: lz(<ProvenancePublicPage />) },
  // Public QR check-in target — course-agnostic by design.
  { path: "/a/:id", element: lz(<AttendanceCheckInPage />) },

  // ── Student shell: the clean course root ─────────────────────────────────
  {
    path: "/course/:courseId",
    element: lz(<StudentLayout />),
    children: [
      // v1.2 — the course root redirects to the named dashboard so the URL
      // matches the "Dashboard" nav label. Dashboard / Agents / Writing are now
      // real routes, not `#hash` scroll targets on one page.
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "agents", element: lz(<StudentAgentsPage />) },
      { path: "chat/:conversationId", element: <ConversationPage /> },
      // Compose mode (v0.4 §14): chat surface for an agent with no row yet.
      // First send creates the row and replaces the URL with chat/:id.
      { path: "chat/new/:agentId", element: <ConversationPage /> },
      { path: "examples", element: lz(<StudentExamplesPage />) },
      { path: "writing", element: lz(<ProvenanceDocumentListPage />) },
      { path: "writing/agents", element: lz(<ProvenanceAgentsPage />) },
      // Open-or-create the student's document for a writing assignment, then
      // redirect to the editor. A literal segment, so it can't collide with a
      // document id.
      { path: "writing/assignment/:assignmentId", element: lz(<ProvenanceOpenAssignment />) },
      { path: "code", element: lz(<CodeHomePage />) },
      // Open-or-create the caller's notebook for an assignment, then redirect
      // to it. A literal segment, so it can't collide with a notebook id.
      { path: "code/assignment/:assignmentId", element: lz(<CodeOpenAssignment />) },
      // v1.2 legacy: old /write* course-scoped paths → /writing*.
      { path: "write", element: <LegacyWriteRedirect /> },
      { path: "write/agents", element: <LegacyWriteRedirect suffix="agents" /> },
    ],
  },
  // The provenance editor is its own full-screen surface (own prov-shell
  // chrome), so it mounts as a standalone course-scoped route rather than a
  // StudentLayout child — avoids stacking the student topbar above its header.
  { path: "/course/:courseId/writing/:id", element: lz(<ProvenanceEditorPage />) },
  // The notebook is a full-screen surface like the writing editor, so it
  // mounts outside StudentLayout for the same reason.
  { path: "/course/:courseId/code/:notebookId", element: lz(<CodeNotebookPage />) },
  // The instructor's starter-notebook editor — same surface, starter mode.
  {
    path: "/course/:courseId/instructor/code/:assignmentId/starter",
    element: lz(<CodeStarterPage />),
  },
  // An instructor's unsaved, runnable scratch copy of a submission.
  {
    path: "/course/:courseId/instructor/code/submissions/:submissionId/scratch",
    element: lz(<CodeSandboxPage />),
  },
  // v1.2 legacy: old standalone editor URL → /writing/:id.
  { path: "/course/:courseId/write/:id", element: <LegacyWriteRedirect /> },

  // ── Instructor shell: the prefixed, secondary surface ────────────────────
  {
    path: "/course/:courseId/instructor",
    element: lz(<CourseLayout />),
    children: [
      // v1.2 — the instructor course root redirects to the named dashboard,
      // mirroring the student side. Dashboard is a real landing page now, not a
      // bounce into Agents.
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: "dashboard", element: lz(<InstructorDashboardPage />) },
      { path: "settings", element: lz(<CourseSettingsPage />) },
      { path: "agents", element: lz(<AuthorListPage />) },
      { path: "agents/new", element: lz(<AuthorEditPage />) },
      { path: "agents/:id", element: lz(<AuthorEditPage />) },
      { path: "agents/:id/variants", element: lz(<AuthorVariantResultsPage />) },
      // Voices: a per-author, cross-course library, mounted here so the
      // instructor nav persists. The pages stay course-agnostic in content.
      { path: "voices", element: lz(<AuthorVoicesPage />) },
      { path: "voices/new", element: lz(<AuthorVoiceEditPage />) },
      { path: "voices/:id", element: lz(<AuthorVoiceEditPage />) },
      { path: "collections", element: lz(<CollectionsListPage />) },
      { path: "collections/:id", element: lz(<CollectionDetailPage />) },
      { path: "roster", element: lz(<RosterPage />) },
      // ── Review ▸ Submissions ─────────────────────────────────────────
      // What came back, by assignment. `submissions` was once a flat feed of
      // writing snapshots; the URL is kept. Each assignment's submissions sit
      // beneath it, whatever its type.
      { path: "submissions", element: lz(<ReviewSubmissionsPage />) },
      // Writing submissions that belong to no current checkpoint.
      { path: "submissions/uncategorized", element: lz(<ProvenanceSubmissionsPage />) },
      // A whole writing assignment, and one of its checkpoints. Ids are
      // server-minted (`pasg_`/`pcp_`), so they can't collide with literals.
      { path: "submissions/writing/:assignmentId", element: lz(<ProvenanceAssignmentRosterPage />) },
      {
        path: "submissions/writing/:assignmentId/:checkpointId",
        element: lz(<ProvenanceCheckpointPage />),
      },
      { path: "submissions/code/:assignmentId", element: lz(<CodeRosterPage />) },
      // ── Assign band ──────────────────────────────────────────────────
      // One list of every assignable kind, backed by `course_items`, shown
      // as Assign ▸ All when more than one kind is on.
      { path: "assign", element: lz(<AssignPage />) },
      // Examples curation. A literal segment under `assign`; nothing dynamic
      // is mounted beside it, so there is no collision to reason about.
      { path: "assign/examples", element: lz(<InstructorExamplesPage />) },
      // Assign ▸ Writing: authoring. Its create form is its own page, so
      // "New" lands on the form. Assignment ids are `pasg_<uuid>`.
      { path: "assignments", element: lz(<ProvenanceAssignmentsPage />) },
      { path: "assignments/new", element: lz(<ProvenanceNewAssignmentPage />) },
      // Kept so links made before the bands landed still resolve. Literal,
      // so it outranks the redirect below.
      { path: "assignments/examples", element: <LegacyAssignmentsExamplesRedirect /> },
      // The writing roster used to live here; instructors hold links to it.
      {
        path: "assignments/:assignmentId",
        element: <ParamRedirect to="submissions/writing/:assignmentId" />,
      },
      { path: "examples", element: <LegacyInstructorExamplesRedirect /> },
      // Assign ▸ Code.
      { path: "code", element: lz(<CodeInstructorPage />) },
      { path: "code/new", element: lz(<CodeNewAssignmentPage />) },
      // One code submission. `submissions` is a literal segment; assignment
      // ids are server-minted `casg_<uuid>`, so the two can't collide.
      { path: "code/submissions/:submissionId", element: lz(<CodeSubmissionPage />) },
      // The code roster used to live here.
      { path: "code/:assignmentId", element: <ParamRedirect to="submissions/code/:assignmentId" /> },
      { path: "attendance", element: lz(<AttendanceSessionListPage />) },
      { path: "attendance/sessions/:id", element: lz(<AttendanceDisplayPage />) },
    ],
  },

  // Catch-all. Must stay LAST — React Router ranks `*` below every concrete
  // path, but keeping it here also makes the ordering obvious to readers.
  // Without it, a near-miss like /course (vs /courses) fell through to React
  // Router's built-in error screen and showed developer copy to a student.
  { path: "*", element: <NotFoundPage /> },
];

// Every top-level route gets the same errorElement. `path: "*"` only catches
// URLs that match nothing; a route that matches and then THROWS (a thrown
// render error, a failed lazy chunk after a deploy swaps the hashed filenames)
// is a separate case, and it is the one that surfaced React Router's default
// "you can provide a way better UX than this" screen. NotFoundPage reads
// useRouteError and switches its copy accordingly.
const router = createBrowserRouter(
  routes.map((r) => ({ ...r, errorElement: <NotFoundPage /> })),
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

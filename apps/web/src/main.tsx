import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
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
// Examples — standalone, public, unauthenticated interactive teaching pages.
// See apps/web/src/examples/registry.ts. Each example's page is lazy-loaded
// from the registry; the index page lists them.
const ExamplesIndexPage = lazy(() =>
  import("./examples/ExamplesIndexPage.js").then((m) => ({ default: m.ExamplesIndexPage })));
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
const LegacyCourseRedirect = lazy(() =>
  import("./pages/LegacyCourseRedirect.js").then((m) => ({ default: m.LegacyCourseRedirect })));

// Wraps a lazy element so Suspense fallback renders while the chunk
// downloads. The fallback is intentionally bare — pages render their own
// loading state on top of this almost immediately.
function lz(node: React.ReactNode) {
  return <Suspense fallback={<div className="page" />}>{node}</Suspense>;
}

const router = createBrowserRouter([
  // `/` resolves to the right course-rooted home (or the join prompt).
  { path: "/", element: <RootRedirect /> },
  // v1.0 §2 — explicit picker entry point (deep-linkable from the dashboard's
  // "Switch course" menu).
  { path: "/courses", element: lz(<CoursePickerPage />) },

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
  ...EXAMPLES.map((ex) => ({
    path: `/examples/${ex.slug}`,
    element: lz(<ex.Page />),
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
      { path: "writing", element: lz(<ProvenanceDocumentListPage />) },
      { path: "writing/agents", element: lz(<ProvenanceAgentsPage />) },
      // v1.2 legacy: old /write* course-scoped paths → /writing*.
      { path: "write", element: <LegacyWriteRedirect /> },
      { path: "write/agents", element: <LegacyWriteRedirect suffix="agents" /> },
    ],
  },
  // The provenance editor is its own full-screen surface (own prov-shell
  // chrome), so it mounts as a standalone course-scoped route rather than a
  // StudentLayout child — avoids stacking the student topbar above its header.
  { path: "/course/:courseId/writing/:id", element: lz(<ProvenanceEditorPage />) },
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
      { path: "attendance", element: lz(<AttendanceSessionListPage />) },
      { path: "attendance/sessions/:id", element: lz(<AttendanceDisplayPage />) },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);

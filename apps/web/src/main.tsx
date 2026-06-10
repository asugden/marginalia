import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
// RootRedirect (the `/` resolver) and the student HomePage + ConversationPage
// stay eager — they're what a cold load hits. RootRedirect uses the inlined
// bootstrap to bounce straight to /course/:id with no Loading flash; the
// student home + chat are the immediate landing targets. Everything else is
// staff-only or rarely reached on first paint; lazy-load it so a student isn't
// shipping AdminPage + the entire author surface on first navigation.
import { RootRedirect } from "./pages/RootRedirect.js";
import { HomePage } from "./pages/HomePage.js";
import { ConversationPage } from "./pages/ConversationPage.js";
import "./styles.css";

const AuthorListPage = lazy(() =>
  import("./pages/AuthorListPage.js").then((m) => ({ default: m.AuthorListPage })));
const AuthorEditPage = lazy(() =>
  import("./pages/AuthorEditPage.js").then((m) => ({ default: m.AuthorEditPage })));
const CollectionsListPage = lazy(() =>
  import("./pages/CollectionsListPage.js").then((m) => ({ default: m.CollectionsListPage })));
const CollectionDetailPage = lazy(() =>
  import("./pages/CollectionDetailPage.js").then((m) => ({ default: m.CollectionDetailPage })));
const HistoryPage = lazy(() =>
  import("./pages/HistoryPage.js").then((m) => ({ default: m.HistoryPage })));
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
// Provenance module — see apps/web/src/modules/provenance/README.md.
const ProvenanceDocumentListPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.DocumentListPage })));
const ProvenanceEditorPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.EditorPage })));
const ProvenanceAgentsPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.AgentsPage })));
const ProvenancePublicPage = lazy(() =>
  import("./modules/provenance/index.js").then((m) => ({ default: m.PublicSubmissionPage })));
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
const CourseDashboardPage = lazy(() =>
  import("./pages/CourseDashboardPage.js").then((m) => ({ default: m.CourseDashboardPage })));
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
  { path: "/history", element: lz(<LegacyCourseRedirect to="/history" />) },
  { path: "/write", element: lz(<LegacyCourseRedirect to="/write" />) },
  { path: "/write/agents", element: lz(<LegacyCourseRedirect to="/write/agents" />) },
  { path: "/write/:id", element: lz(<LegacyCourseRedirect to="/write/:id" />) },
  // Legacy /author/... → the instructor surface.
  { path: "/author/agents", element: lz(<LegacyCourseRedirect to="/instructor/agents" />) },
  { path: "/author/agents/new", element: lz(<LegacyCourseRedirect to="/instructor/agents/new" />) },
  { path: "/author/agents/:id", element: lz(<LegacyCourseRedirect to="/instructor/agents/:id" />) },
  { path: "/author/collections", element: lz(<LegacyCourseRedirect to="/instructor/collections" />) },
  { path: "/author/collections/:id", element: lz(<LegacyCourseRedirect to="/instructor/collections/:id" />) },
  { path: "/author/roster", element: lz(<LegacyCourseRedirect to="/instructor/roster" />) },
  { path: "/attendance", element: lz(<LegacyCourseRedirect to="/instructor/attendance" />) },
  {
    path: "/attendance/sessions/:id",
    element: lz(<LegacyCourseRedirect to="/instructor/attendance/sessions/:id" />),
  },

  // ── Course-agnostic survivors ────────────────────────────────────────────
  // v0.7 §1 — per-author voice library. Voices are reusable across an author's
  // courses, so this stays global (not course-scoped).
  { path: "/author/voices", element: lz(<AuthorVoicesPage />) },
  { path: "/author/voices/new", element: lz(<AuthorVoiceEditPage />) },
  { path: "/author/voices/:id", element: lz(<AuthorVoiceEditPage />) },
  { path: "/join/:code", element: lz(<JoinPage />) },
  { path: "/admin", element: lz(<AdminPage />) },
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
      { index: true, element: <HomePage /> },
      { path: "chat/:conversationId", element: <ConversationPage /> },
      // Compose mode (v0.4 §14): chat surface for an agent with no row yet.
      // First send creates the row and replaces the URL with chat/:id.
      { path: "chat/new/:agentId", element: <ConversationPage /> },
      { path: "history", element: lz(<HistoryPage />) },
      { path: "write", element: lz(<ProvenanceDocumentListPage />) },
      { path: "write/agents", element: lz(<ProvenanceAgentsPage />) },
    ],
  },
  // The provenance editor is its own full-screen surface (own prov-shell
  // chrome), so it mounts as a standalone course-scoped route rather than a
  // StudentLayout child — avoids stacking the student topbar above its header.
  { path: "/course/:courseId/write/:id", element: lz(<ProvenanceEditorPage />) },

  // ── Instructor shell: the prefixed, secondary surface ────────────────────
  {
    path: "/course/:courseId/instructor",
    element: lz(<CourseLayout />),
    children: [
      { index: true, element: lz(<CourseDashboardPage />) },
      { path: "agents", element: lz(<AuthorListPage />) },
      { path: "agents/new", element: lz(<AuthorEditPage />) },
      { path: "agents/:id", element: lz(<AuthorEditPage />) },
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

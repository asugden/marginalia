import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
// HomePage stays eager — it's what a cold load hits. ConversationPage is
// the second most-likely first-paint URL (a Continue link) and is small
// enough to keep eager too. Everything else is staff-only or rarely
// reached on first paint; lazy-load them so a student isn't shipping
// AdminPage + RosterPage + the entire author surface on the first
// navigation. v0.7 §2 / audit fix.
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
// Attendance module — see apps/web/src/modules/attendance/README.md.
const AttendanceSessionListPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.SessionListPage })));
const AttendanceDisplayPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.DisplayPage })));
const AttendanceCheckInPage = lazy(() =>
  import("./modules/attendance/index.js").then((m) => ({ default: m.CheckInPage })));

// v1.0 §1 — course-scoped routes mount under <CourseLayout>, which reads
// :courseId from the URL and provides it via context. CourseDashboardPage
// is the per-course instructor home (v1.0 §3).
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
  { path: "/", element: <HomePage /> },
  { path: "/c/:conversationId", element: <ConversationPage /> },
  // Compose mode (v0.4 §14): render the chat surface for an agent with no
  // conversation row yet. The first send creates the row and replaces this
  // URL with /c/:id.
  { path: "/new/:agentId", element: <ConversationPage /> },
  { path: "/history", element: lz(<HistoryPage />) },
  // v1.0 §7.2 — legacy /author/... paths redirect into the default course
  // so bookmarks and Slack links keep working. Stay ≥6 months past v1.0
  // before deletion.
  { path: "/author/agents", element: lz(<LegacyCourseRedirect to="/agents" />) },
  { path: "/author/agents/new", element: lz(<LegacyCourseRedirect to="/agents/new" />) },
  { path: "/author/agents/:id", element: lz(<LegacyCourseRedirect to="/agents/:id" />) },
  { path: "/author/collections", element: lz(<LegacyCourseRedirect to="/collections" />) },
  { path: "/author/collections/:id", element: lz(<LegacyCourseRedirect to="/collections/:id" />) },
  { path: "/author/roster", element: lz(<LegacyCourseRedirect to="/roster" />) },
  // v0.7 §1 — per-author voice library.
  { path: "/author/voices", element: lz(<AuthorVoicesPage />) },
  { path: "/author/voices/new", element: lz(<AuthorVoiceEditPage />) },
  { path: "/author/voices/:id", element: lz(<AuthorVoiceEditPage />) },
  { path: "/join/:code", element: lz(<JoinPage />) },
  { path: "/admin", element: lz(<AdminPage />) },
  // v0.7 §3.8 — per-user detail. Linked into from AdminPage Users tab and
  // RosterPage Students/Authors lists. Admin-only on the server.
  { path: "/users/:id", element: lz(<UserDetailPage />) },
  // Provenance writing tool (slice 1+ — see modules/provenance/README.md).
  { path: "/write", element: lz(<ProvenanceDocumentListPage />) },
  { path: "/write/agents", element: lz(<ProvenanceAgentsPage />) },
  { path: "/write/:id", element: lz(<ProvenanceEditorPage />) },
  // Attendance: QR check-in for in-person sessions. Legacy /attendance
  // and /attendance/sessions/:id redirect into the course-scoped path
  // (v1.0 §7.2). /a/:id stays as-is — it's the public QR target and is
  // course-agnostic by design.
  { path: "/attendance", element: lz(<LegacyCourseRedirect to="/attendance" />) },
  {
    path: "/attendance/sessions/:id",
    element: lz(<LegacyCourseRedirect to="/attendance/sessions/:id" />),
  },
  { path: "/a/:id", element: lz(<AttendanceCheckInPage />) },
  // v1.0 §1 — course-scoped routes. Old `/author/...` and `/attendance`
  // paths above keep working unchanged until each page is migrated to
  // `useCourse()` (then they'll become <Navigate> shims per v1.0 §7.2).
  // v1.0 §2 — explicit /courses entry point for the picker (deep-linkable
  // from the dashboard's "Switch course" menu).
  { path: "/courses", element: lz(<CoursePickerPage />) },
  {
    path: "/course/:courseId",
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

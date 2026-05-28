// v1.0 §3 / Phase 2 — the per-course dashboard's index body.
//
// CourseLayout owns the course H1, the breadcrumb, the "← Student view"
// link, the "Switch course" menu, and the tab strip. This page is just
// the *body* shown when an instructor lands on `/course/:courseId`
// before picking a tab.
//
// Pure navigation. No Today card (cut in v1.0 planning — keeps the tool
// lightweight; we don't want to feel like Canvas). Instead, the body is
// a one-line description per visible tab, so a first-time instructor
// learns what each name means without clicking. The names are
// architecturally precise (Agents, Sources, Outlines) but read as
// jargon on first encounter; the descriptions turn them into
// self-teaching labels.
//
// Staff register per docs/style.md: no white card; brand-red appears
// only on the primary action of whatever tab body the user opens next.

import { Link } from "react-router-dom";
import { useCourse } from "../course/useCourse.js";
import { TABS } from "../course/tabs.js";

export function CourseDashboardPage() {
  const ctx = useCourse();
  const visibleTabs = TABS.filter((t) =>
    t.visible({
      courseId: ctx.courseId,
      courseName: ctx.courseName,
      role: ctx.role,
      joinedAt: 0,
      showAttendance: ctx.showAttendance,
      showCollections: ctx.showCollections,
    }),
  );

  return (
    <section className="course-dashboard-body">
      <p className="scope-note">
        {ctx.role === "instructor"
          ? "Pick where you want to work. Students never see this page."
          : "Pick where you want to go. You're shown the surfaces for this course."}
      </p>
      <ul className="course-tab-explainer">
        {visibleTabs.map((t) => {
          const to = t.external ? t.slug : `/course/${ctx.courseId}/${t.slug}`;
          return (
            <li key={t.slug}>
              <Link to={to} className="course-tab-explainer-link">
                <strong>{t.label}</strong>
                <span className="muted"> — {t.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

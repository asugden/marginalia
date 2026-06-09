// v1.0 §3 / Phase 2 — the per-course dashboard's index body.
//
// CourseLayout owns the course H1, the breadcrumb, the "← Student view"
// link, the "Switch course" menu, and the tab strip. This page is just
// the *body* shown when an instructor lands on `/course/:courseId`
// before picking a tab.
//
// Pure navigation. No Today card (cut in v1.0 planning — keeps the tool
// lightweight; we don't want to feel like Canvas). The body is a
// one-line description per visible tab, so a first-time instructor
// learns what each name means without clicking.
//
// Lazy-revealed tabs (Attendance, Sources) stay hidden until the course
// uses them. To break the chicken-and-egg — you can't open the first
// attendance session if the tab is hidden — the dashboard offers an
// "Add a tool" row that turns a hidden feature on and drops you into it.
//
// Staff register per docs/style.md: no white card; brand-red appears
// only on the primary action of whatever tab body the user opens next.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { revealCourseTab } from "../client.js";
import { useCourse } from "../course/useCourse.js";
import { TABS } from "../course/tabs.js";
import { Button } from "../components/index.js";
import { PlusIcon } from "../icons.js";

export function CourseDashboardPage() {
  const ctx = useCourse();
  const navigate = useNavigate();
  const [revealing, setRevealing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enrollmentShape = {
    courseId: ctx.courseId,
    courseName: ctx.courseName,
    role: ctx.role,
    joinedAt: 0,
    showAttendance: ctx.showAttendance,
    showCollections: ctx.showCollections,
  };

  const visibleTabs = TABS.filter((t) => t.visible(enrollmentShape));
  // Hidden tabs that the instructor can opt into. Students never see this
  // row (they don't author features); gate on the instructor role.
  const hiddenRevealable =
    ctx.role === "instructor"
      ? TABS.filter((t) => t.revealFeature && !t.visible(enrollmentShape))
      : [];

  async function onReveal(feature: "attendance" | "collections", slug: string) {
    setRevealing(feature);
    setError(null);
    try {
      await revealCourseTab(ctx.courseId, feature);
      // The flag is now set server-side; navigate straight into the tab.
      // The next /api/me (on the tab page's CourseLayout mount) returns
      // the flipped flag, so the tab strip shows it from then on.
      navigate(`/course/${ctx.courseId}/${slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that tool");
      setRevealing(null);
    }
  }

  return (
    <div className="ds-staff-page">
      <div className="ds-staff-head">
        <div>
          <span className="eyebrow">{ctx.courseName}</span>
          <h1>Dashboard</h1>
          <div className="ds-staff-head__scope">
            {ctx.role === "instructor"
              ? "Pick where you want to work. Students never see this page."
              : "Pick where you want to go — the surfaces for this course."}
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="ds-staff-section ds-staff-list">
        {visibleTabs.map((t) => {
          const to = t.external ? t.slug : `/course/${ctx.courseId}/${t.slug}`;
          return (
            <Link key={t.slug} to={to} className="ds-staff-list__row">
              <div className="ds-staff-list__main">
                <div className="ds-staff-list__title">{t.label}</div>
                <div className="ds-staff-list__sub">{t.description}</div>
              </div>
            </Link>
          );
        })}
      </div>

      {hiddenRevealable.length > 0 && (
        <div className="ds-staff-section">
          <span className="mono-label ds-staff-section__label">
            Add a tool to this course
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {hiddenRevealable.map((t) => (
              <Button
                key={t.slug}
                variant="subtle"
                icon={<PlusIcon size={16} />}
                disabled={revealing !== null}
                loading={revealing === t.revealFeature}
                title={t.description}
                onClick={() => onReveal(t.revealFeature!, t.slug)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

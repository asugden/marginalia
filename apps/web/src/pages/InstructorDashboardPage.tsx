// Instructor course dashboard — the landing when an instructor opens a course
// (/course/:courseId/instructor/dashboard; the course root redirects here).
//
// WHAT THIS PAGE IS FOR. Assign answers "what have I set?"; Submissions
// answers "what came back?". Neither answers "what is happening this week",
// which is the question an instructor actually opens the course with. So this
// page is ABOUT TIME — the one surface that spans kinds and spans the
// assign/review divide.
//
// It replaces an earlier version that counted inventory (agents, libraries,
// voices) and offered five "Create …" cards. Those were setup-week affordances
// shown every day of the semester: the counts barely moved after week one, and
// the cards duplicated destinations the header nav already reaches. Worse, the
// page predated `course_items` and so never mentioned the course's actual
// assigned work.
//
// TWO CLASSES OF ITEM, kept apart deliberately (see course/dueness.ts):
//   * Scheduled work has a due date — it can be overdue, and it sorts by
//     deadline. Overdue is split into its own section because burying it in a
//     date-sorted list hides exactly the thing that needs action.
//   * Supplements (`isSupplement`: no assignedAt, no dueAt) are optional
//     agents and tracked examples. They are NEVER due and must never render as
//     late; they're interesting only as "is anyone using this".
//
// NO CLASS-WIDE COMPLETION COUNTS. `GET /course-items` returns the CALLER'S
// own completion by design — the course-items README is explicit that there is
// no course-wide completion matrix, because four kinds' evidence (an artifact,
// a server-derived backbone exit, a self-report) would read as equivalent side
// by side. This page therefore reports DATES ONLY. Do not add an "n of m
// complete" here from this endpoint's data; it cannot be derived from it, and
// faking it from the caller's own state would be wrong as well as misleading.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listRoster, listJoinCodes } from "../client.js";
import {
  instructorHref,
  kindLabel,
  listCourseItems,
  type CourseItemDTO,
} from "../modules/course-items/api.js";
import { useCourse } from "../course/useCourse.js";
import {
  dueLabel,
  overdueItems,
  shortDate,
  supplements,
  upcomingItems,
  type DatedItem,
} from "../course/dueness.js";
import {
  formatDateRange,
  isCourseCurrent,
  termLabel,
} from "../course/term.js";
import { PlusIcon } from "../icons.js";
import {
  Button,
  PageHeader,
  Section,
  StatGrid,
  StatTile,
} from "../components/index.js";

export function InstructorDashboardPage() {
  const {
    courseId,
    courseName,
    termSeason,
    termYear,
    startDate,
    endDate,
  } = useCourse();
  const base = `/course/${courseId}/instructor`;
  const [items, setItems] = useState<CourseItemDTO[] | null>(null);
  const [students, setStudents] = useState<number | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setItems(null);
    // Three independent reads; a failure in any one leaves its own section
    // empty rather than blanking the page.
    Promise.allSettled([
      listCourseItems(courseId),
      listRoster(courseId),
      listJoinCodes(courseId),
    ]).then(([list, roster, codes]) => {
      if (!live) return;
      setItems(list.status === "fulfilled" ? list.value : []);
      setStudents(
        roster.status === "fulfilled"
          ? roster.value.roster.filter((r) => r.role === "student").length
          : null,
      );
      setJoinCode(
        codes.status === "fulfilled"
          ? (codes.value.codes.find((c) => c.revokedAt === null)?.code ?? null)
          : null,
      );
    });
    return () => {
      live = false;
    };
  }, [courseId]);

  // One `now` per render so every bucket and label agrees with the others.
  const now = Date.now();
  const all = items ?? [];
  const overdue = overdueItems(all, now);
  const upcoming = upcomingItems(all, now, { limit: 6 });
  const extras = supplements(all, { limit: 6 });

  // Term label + where the course sits relative to today.
  const status = isCourseCurrent(startDate, endDate, now)
    ? "Current"
    : startDate != null && now < startDate
      ? "Upcoming"
      : "Past";
  const term =
    termSeason != null && termYear != null
      ? termLabel(termSeason, termYear)
      : null;
  const eyebrow = term ? `${term} · ${status}` : status;
  const dates = formatDateRange(startDate, endDate);

  const n = (v: number | null) => (v == null ? "—" : v.toLocaleString());
  const loading = items == null;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow={eyebrow}
        title={courseName}
        scope={dates || "No start/end dates set — this course is always current."}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<PlusIcon size={16} />}
            href={`${base}/assign`}
          >
            Assign something
          </Button>
        }
      />

      {/* Tiles that MOVE. Enrollment is the denominator for everything else;
          the other two change week to week, which is what earns a tile. */}
      <StatGrid>
        <StatTile value={n(students)} label="Students" />
        <StatTile
          value={loading ? "—" : upcomingItems(all, now).length.toLocaleString()}
          label="Due this week"
        />
        <StatTile
          value={loading ? "—" : overdue.length.toLocaleString()}
          label="Overdue"
        />
      </StatGrid>

      {/* Overdue first — it's the only section that asks for action today. */}
      {overdue.length > 0 && (
        <Section kicker="Overdue">
          <ItemRows courseId={courseId} rows={overdue} />
        </Section>
      )}

      <Section
        kicker="Due next"
        meta={
          upcoming.length > 0 ? (
            <Link to={`${base}/assign`}>All assigned</Link>
          ) : undefined
        }
      >
        {loading ? (
          <p className="app-dash__empty">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="app-dash__empty">
            Nothing due in the next week.{" "}
            <Link to={`${base}/assign`}>See everything assigned</Link>.
          </p>
        ) : (
          <ItemRows courseId={courseId} rows={upcoming} />
        )}
      </Section>

      {/* Supplements — offered, never due. Kept visually quieter than the
          dated sections because that is exactly their status. */}
      {extras.length > 0 && (
        <Section
          kicker="Also available"
          description="Optional work with no deadline — offered all term, never late."
        >
          <ul className="app-dash__list app-dash__list--quiet">
            {extras.map((item) => {
              const href = instructorHref(courseId, item);
              return (
                <li key={item.id} className="app-dash__row">
                  <span className="app-dash__kind">{kindLabel(item.kind)}</span>
                  <span className="app-dash__title">
                    {href ? <Link to={href}>{item.title}</Link> : item.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Invite students — genuinely belongs on a landing page. */}
      <Section kicker="Invite students">
        <div className="joincode joincode--stack">
          {joinCode && (
            <>
              <div className="joincode__label">Join code</div>
              <div className="joincode__code">{joinCode}</div>
            </>
          )}
          <p className="app-invite__text">
            {joinCode
              ? "Share this code so students can self-enroll after signing in."
              : "No active join code yet — generate one so students can self-enroll."}
          </p>
          <Button variant="subtle" size="sm" href={`${base}/roster`}>
            Manage people
          </Button>
        </div>
      </Section>
    </div>
  );
}

/** A dated list: kind, title, absolute date, and the relative phrase. The
 *  phrase is `dueLabel` verbatim — a statement of date arithmetic, with no
 *  risk or concern framing (the no-false-positives rule governs here too). */
function ItemRows({
  courseId,
  rows,
}: {
  courseId: string;
  rows: DatedItem[];
}) {
  return (
    <ul className="app-dash__list">
      {rows.map((d) => {
        const href = instructorHref(courseId, d.item);
        return (
          <li
            key={d.item.id}
            className={
              "app-dash__row" +
              (d.bucket === "overdue" ? " app-dash__row--overdue" : "")
            }
          >
            <span className="app-dash__kind">{kindLabel(d.item.kind)}</span>
            <span className="app-dash__title">
              {href ? <Link to={href}>{d.item.title}</Link> : d.item.title}
            </span>
            <span className="app-dash__date">{shortDate(d.dueAt)}</span>
            <span className="app-dash__due">{dueLabel(d)}</span>
          </li>
        );
      })}
    </ul>
  );
}

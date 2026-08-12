// Instructor course dashboard — the landing when an instructor opens a course
// (/course/:courseId/instructor/dashboard; the course root redirects here). A
// launchpad: the course's term + dates at the top, key totals as stat tiles,
// the join code to invite students, and a grid of quick-action cards into each
// enabled tool. In "Preview as student" the instructor sees the STUDENT
// dashboard instead (RoleSwitch navigates to the student shell), so this page
// is only ever the instructor register.
//
// Stats are derived client-side from the existing list endpoints (there is no
// course-stats aggregate) — the same pattern the old course-admin panel used.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAgents,
  listCollections,
  listJoinCodes,
  listRoster,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import {
  formatDateRange,
  isCourseCurrent,
  termLabel,
} from "../course/term.js";
import {
  ArrowIcon,
  BookIcon,
  ClockIcon,
  SparkleIcon,
  UserIcon,
  UsersIcon,
} from "../icons.js";
import {
  Button,
  PageHeader,
  Section,
  StatGrid,
  StatTile,
} from "../components/index.js";

interface CourseStats {
  agents: number;
  libraries: number;
  students: number;
  joinCode: string | null;
}

export function InstructorDashboardPage() {
  const {
    courseId,
    courseName,
    termSeason,
    termYear,
    startDate,
    endDate,
    showAttendance,
    agentsEnabled,
  } = useCourse();
  const base = `/course/${courseId}/instructor`;
  const [stats, setStats] = useState<CourseStats | null>(null);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      listAgents(courseId),
      listCollections(courseId),
      listRoster(courseId),
      listJoinCodes(courseId),
    ]).then(([agents, collections, roster, codes]) => {
      if (!live) return;
      const activeCode =
        codes.status === "fulfilled"
          ? codes.value.codes.find((c) => c.revokedAt === null)
          : undefined;
      setStats({
        agents: agents.status === "fulfilled" ? agents.value.agents.length : 0,
        // Count libraries (collections), not the documents inside them.
        libraries:
          collections.status === "fulfilled"
            ? collections.value.collections.length
            : 0,
        students:
          roster.status === "fulfilled"
            ? roster.value.roster.filter((r) => r.role === "student").length
            : 0,
        joinCode: activeCode?.code ?? null,
      });
    });
    return () => {
      live = false;
    };
  }, [courseId]);

  // Term label + where the course sits relative to today.
  const now = Date.now();
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

  const n = (v: number | undefined) => (v == null ? "—" : v.toLocaleString());

  // Quick-action cards — one per enabled instructor surface. Each is a single
  // link into the tool; the card's meta shows its count.
  const actions: {
    key: string;
    icon: React.ReactNode;
    title: string;
    meta: string;
    href: string;
    show: boolean;
  }[] = [
    {
      key: "agents",
      icon: <SparkleIcon />,
      title: "Create new agent",
      meta: `${n(stats?.agents)} total`,
      href: `${base}/agents/new`,
      show: agentsEnabled,
    },
    {
      key: "voices",
      icon: <UserIcon />,
      title: "Create new voice",
      meta: "Tone & style",
      href: `${base}/voices/new`,
      show: true,
    },
    {
      key: "library",
      icon: <BookIcon />,
      title: "Create a Library",
      meta: `${n(stats?.libraries)} librar${stats?.libraries === 1 ? "y" : "ies"}`,
      href: `${base}/collections`,
      show: true,
    },
    {
      key: "people",
      icon: <UsersIcon />,
      title: "Manage people",
      meta: `${n(stats?.students)} student${stats?.students === 1 ? "" : "s"}`,
      href: `${base}/roster`,
      show: true,
    },
    {
      key: "attendance",
      icon: <ClockIcon />,
      title: "Open a session",
      meta: "QR check-in",
      href: `${base}/attendance`,
      show: showAttendance,
    },
  ];

  return (
    <div className="app-page">
      <PageHeader
        eyebrow={eyebrow}
        title={courseName}
        scope={
          dates || "No start/end dates set — this course is always current."
        }
      />

      {/* At-a-glance totals */}
      <StatGrid>
        {agentsEnabled && <StatTile value={n(stats?.agents)} label="Agents" />}
        <StatTile value={n(stats?.libraries)} label="Libraries" />
        <StatTile value={n(stats?.students)} label="Students" />
      </StatGrid>

      {/* Invite students — a tan, dashed box with centered, full-width copy. */}
      <Section kicker="Invite students">
        <div className="joincode joincode--stack">
          {stats?.joinCode && (
            <>
              <div className="joincode__label">Join code</div>
              <div className="joincode__code">{stats.joinCode}</div>
            </>
          )}
          <p className="app-invite__text">
            {stats?.joinCode
              ? "Share this code so students can self-enroll after signing in."
              : "No active join code yet — generate one so students can self-enroll."}
          </p>
          <Button variant="subtle" size="sm" href={`${base}/roster`}>
            Manage people
          </Button>
        </div>
      </Section>

      {/* Quick actions into each tool */}
      <Section kicker="Quick actions">
        <div className="app-launch">
          {actions
            .filter((a) => a.show)
            .map((a) => (
              <Link key={a.key} to={a.href} className="app-launchcard">
                <span className="app-launchcard__icon">{a.icon}</span>
                <span className="app-launchcard__body">
                  <span className="app-launchcard__title">{a.title}</span>
                  <span className="app-launchcard__meta">{a.meta}</span>
                </span>
                <span className="app-launchcard__go" aria-hidden>
                  <ArrowIcon size={18} />
                </span>
              </Link>
            ))}
        </div>
      </Section>
    </div>
  );
}

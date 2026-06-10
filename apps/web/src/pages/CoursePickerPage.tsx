// Instructor / multi-enrollment landing — the design-system "My courses"
// dashboard.
//
// This is the DS CourseDashboard: every course you teach as an expandable
// card. Collapsed, a card shows what /api/me already gives us (name, role,
// and the lazy-reveal module flags as chips) — no extra fetch. Expanding a
// card lazy-loads the rest (agent / source / enrollment counts + join code)
// from the per-course endpoints. "Open" enters the course (lands on Agents);
// "New course…" opens the DS modal to create a blank course you instruct.
//
// Reached via GET / (RootRedirect) when the caller has >1 enrollments, and via
// the course switcher's "All courses" / "New course…" items. A lone-enrollment
// caller is bounced straight into their course (unless ?new=1 asked to create).
//
// Staff register even for a student caller — the picker is a meta-surface, not
// the inside of a course.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  createCourse,
  getMe,
  listAgents,
  listCollections,
  listJoinCodes,
  listRoster,
  type MeEnrollment,
} from "../client.js";
import { readBootstrap } from "../bootstrap.js";
import { Button, Field, Input, Wordmark } from "../components/index.js";
import { ArrowIcon, ChevronIcon, PlusIcon } from "../icons.js";

export function CoursePickerPage() {
  const [enrollments, setEnrollments] = useState<MeEnrollment[] | null>(() => {
    const boot = readBootstrap();
    return boot && boot.kind === "picker" ? boot.enrollments : null;
  });
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [newOpen, setNewOpen] = useState(() => searchParams.get("new") === "1");

  useEffect(() => {
    const ctrl = new AbortController();
    getMe(ctrl.signal)
      .then((m) => {
        if (ctrl.signal.aborted) return;
        setEnrollments(m.enrollments);
        // Lone enrollment? Send them where they'd have landed anyway — unless
        // they came here explicitly to create a course.
        if (m.enrollments.length === 1 && searchParams.get("new") !== "1") {
          const only = m.enrollments[0]!;
          navigate(
            only.role === "instructor"
              ? `/course/${only.courseId}/instructor`
              : `/course/${only.courseId}`,
            { replace: true },
          );
        }
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [navigate, searchParams]);

  const teaches = (enrollments ?? []).some((e) => e.role === "instructor");

  return (
    <div className="app">
      <header className="app-topbar app-topbar--wide">
        <div className="app-topbar__inner">
          <Link to="/courses" aria-label="Courses" className="app-lockup-link">
            <Wordmark size="sm" />
          </Link>
          <span className="app-lockup__role">Courses</span>
          <div className="app-topbar__spacer" />
        </div>
      </header>

      <div className="app__body">
        <div className="app-page app-page--wide">
          <div className="app-page__head">
            <div>
              <span className="eyebrow">Your courses</span>
              <h1>{teaches ? "My courses" : "Pick a course"}</h1>
              <p className="app-page__scope">
                {teaches
                  ? "Every course you teach. Open one to author its agents, sources and roster — or expand it to see its join code and totals."
                  : "Pick the one you want to open."}
              </p>
            </div>
            {teaches && (
              <div className="app-page__actions">
                <Button
                  variant="primary"
                  icon={<PlusIcon size={16} />}
                  onClick={() => setNewOpen(true)}
                >
                  New course
                </Button>
              </div>
            )}
          </div>

          {error && <p className="error">{error}</p>}

          {enrollments === null ? (
            <p className="app-empty">Loading…</p>
          ) : enrollments.length === 0 ? (
            <p className="app-empty">
              You aren&rsquo;t enrolled in any courses yet. Use a join code on
              the home page to enroll{teaches ? ", or create one above" : ""}.
            </p>
          ) : (
            <div className="app-dlist">
              {enrollments.map((e) => (
                <CourseCard key={e.courseId} enrollment={e} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      </div>

      {newOpen && (
        <NewCourseModal
          onClose={() => setNewOpen(false)}
          onCreate={async (name) => {
            const course = await createCourse(name);
            navigate(`/course/${course.id}/instructor`);
          }}
        />
      )}
    </div>
  );
}

function CourseCard({
  enrollment: e,
  navigate,
}: {
  enrollment: MeEnrollment;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [open, setOpen] = useState(false);
  const isInstructor = e.role === "instructor";
  const home = isInstructor
    ? `/course/${e.courseId}/instructor`
    : `/course/${e.courseId}`;

  // Module chips from the flags /api/me already gave us — no fetch needed.
  const mods: string[] = [];
  if (e.showCollections) mods.push("Sources");
  if (e.showAttendance) mods.push("Attendance");

  return (
    <div className={"app-dcourse" + (open ? " app-dcourse--open" : "")}>
      <div className="app-dcourse__head">
        {isInstructor && (
          <button
            type="button"
            className="app-dcourse__disc"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={open ? "Hide details" : "Course details"}
          >
            <ChevronIcon size={16} />
          </button>
        )}
        <div
          className="app-dcourse__id"
          onClick={() => navigate(home)}
          role="link"
          tabIndex={0}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") navigate(home);
          }}
        >
          <div className="app-dcourse__title">{e.courseName}</div>
          <div className="app-dcourse__stats">
            <span>{e.role}</span>
          </div>
          {mods.length > 0 && (
            <div className="app-dcourse__mods">
              {mods.map((m) => (
                <span key={m} className="app-dcourse__mod">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="app-dcourse__actions">
          {isInstructor && (
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Done" : "Details"}
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            iconRight={<ArrowIcon size={16} />}
            onClick={() => navigate(home)}
          >
            Open
          </Button>
        </div>
      </div>
      {open && isInstructor && <CourseAdmin courseId={e.courseId} />}
    </div>
  );
}

// Lazy-loaded course detail: counts + join code, fetched only when a card is
// expanded. Read-only here — editing name/modules/lifecycle lives inside the
// course (and the admin console), not on the all-courses dashboard.
function CourseAdmin({ courseId }: { courseId: string }) {
  const [stats, setStats] = useState<{
    agents: number;
    collections: number;
    enrollments: number;
    joinCode: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      listAgents(courseId),
      listCollections(courseId),
      listRoster(courseId),
      listJoinCodes(courseId),
    ])
      .then(([agents, collections, roster, codes]) => {
        if (!live) return;
        const active =
          codes.status === "fulfilled"
            ? codes.value.codes.find((c) => c.revokedAt === null)
            : undefined;
        setStats({
          agents: agents.status === "fulfilled" ? agents.value.agents.length : 0,
          collections:
            collections.status === "fulfilled"
              ? collections.value.collections.length
              : 0,
          enrollments:
            roster.status === "fulfilled" ? roster.value.roster.length : 0,
          joinCode: active?.code ?? null,
        });
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "Load failed");
      });
    return () => {
      live = false;
    };
  }, [courseId]);

  return (
    <div className="app-dcourse__admin">
      {error && <p className="error">{error}</p>}
      {stats === null ? (
        <p className="app-empty">Loading details…</p>
      ) : (
        <>
          <div className="app-dcourse__stats">
            <span>{stats.agents} agents</span>
            <i>·</i>
            <span>{stats.collections} sources</span>
            <i>·</i>
            <span>{stats.enrollments} enrolled</span>
          </div>
          {stats.joinCode && (
            <div className="joincode" style={{ marginTop: "1rem" }}>
              <div>
                <div className="joincode__label">
                  Join code · share with students
                </div>
                <div className="joincode__code">{stats.joinCode}</div>
              </div>
              <div className="joincode__spacer" />
              <Button
                variant="subtle"
                size="sm"
                href={`/course/${courseId}/instructor/roster`}
              >
                Manage people
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// DS New Course modal — name + Start-from. Only the blank path is wired (the
// backend creates a blank course you instruct); copy-from is a follow-up, so
// agents are copied in afterward from the course's Agents page.
function NewCourseModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the course");
      setBusy(false);
    }
  }

  return (
    <div className="app-modal-backdrop" onClick={onClose}>
      <form
        className="app-modal"
        onClick={(ev) => ev.stopPropagation()}
        onSubmit={submit}
      >
        <div className="app-modal__head">
          <span className="eyebrow">New course</span>
          <h2>Create a course</h2>
        </div>
        <div className="app-modal__body">
          {error && <p className="error">{error}</p>}
          <Field label="Course name">
            <Input
              autoFocus
              type="text"
              placeholder="e.g. Intro to Product Design — Fall 2026"
              value={name}
              disabled={busy}
              onChange={(ev) => setName(ev.target.value)}
            />
          </Field>
          <div className="app-choice">
            <span className="app-field__label">Start from</span>
            <label className="app-opt app-opt--on">
              <input type="radio" name="from" checked readOnly />
              <span className="app-opt__main">
                <b>Blank course</b>
                <span>You&rsquo;re its instructor — add agents next</span>
              </span>
            </label>
          </div>
          <p className="app-page__scope" style={{ marginTop: 0 }}>
            A join code is created automatically. To reuse agents from another
            course, open the new course&rsquo;s Agents tab and copy them in.
          </p>
        </div>
        <div className="app-modal__foot">
          <Button variant="subtle" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={busy}
            disabled={busy || !name.trim()}
          >
            Create course
          </Button>
        </div>
      </form>
    </div>
  );
}

// Instructor / multi-enrollment landing — the design-system "My courses"
// dashboard, and the full "All courses" list.
//
// v1.2 organises courses by their active window: a "Current" section (courses
// running today, by their start/end dates) then a "Past & upcoming" section,
// grouped by academic year, newest-first. This is what the header switcher's
// "All courses" opens into — the switcher only lists current courses, so past
// and upcoming semesters live here. Every card shows what /api/me already gives
// us (name, role, term, date range, module chips) with no extra fetch. For an
// instructor, expanding a card lazy-loads the rest (counts + join code) and
// exposes the term + date editor and the module toggles. "Open" enters the
// course; "New course…" opens the DS modal.
//
// Reached via GET / (RootRedirect) when the caller has >1 enrollments, and via
// the switcher's "All courses" / "New course…" items. A lone-enrollment caller
// is bounced straight into their course (unless ?new=1 asked to create).
//
// Staff register even for a student caller — the picker is a meta-surface, not
// the inside of a course.

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { readBootstrap } from "../bootstrap.js";
import { createCourse, getMe, type MeEnrollment } from "../client.js";
import {
  Button,
  Field,
  Input,
  PageHeader,
  Select,
  Tooltip,
  Wordmark,
} from "../components/index.js";
import {
  academicYearLabel,
  academicYearStart,
  currentTerm,
  dateInputToMs,
  defaultTermDates,
  formatDateRange,
  isCourseCurrent,
  msToDateInput,
  TERM_SEASONS,
  termLabel,
  termSortKey,
  type TermSeason,
} from "../course/term.js";
import {
  ArrowIcon,
  BellCheckIcon,
  LibraryIcon,
  PlusIcon,
  WritingIcon,
} from "../icons.js";

interface TermGroup {
  /** Academic-year start year, or -Infinity for unscheduled (sorts last). */
  key: number;
  label: string;
  items: MeEnrollment[];
}

/** Group enrollments by academic year, newest first, unscheduled last. Within a
 *  group, order by term (fall → spring → summer) then name. */
function groupByTerm(items: MeEnrollment[]): TermGroup[] {
  const groups = new Map<string, TermGroup>();
  for (const e of items) {
    const scheduled = e.termSeason != null && e.termYear != null;
    const label = scheduled
      ? academicYearLabel(e.termSeason as TermSeason, e.termYear as number)
      : "Unscheduled";
    const key = scheduled
      ? academicYearStart(e.termSeason as TermSeason, e.termYear as number)
      : Number.NEGATIVE_INFINITY;
    let g = groups.get(label);
    if (!g) {
      g = { key, label, items: [] };
      groups.set(label, g);
    }
    g.items.push(e);
  }
  const list = [...groups.values()];
  list.sort((a, b) => b.key - a.key);
  for (const g of list) {
    g.items.sort((a, b) => rankByTerm(b) - rankByTerm(a) || a.courseName.localeCompare(b.courseName));
  }
  return list;
}

function rankByTerm(e: MeEnrollment): number {
  return e.termSeason != null && e.termYear != null
    ? termSortKey(e.termSeason, e.termYear)
    : Number.NEGATIVE_INFINITY;
}

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
        // No auto-redirect here. RootRedirect (the `/` resolver) already
        // fast-paths a lone-enrollment user straight into their course, so
        // reaching /courses is always a *deliberate* destination.
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [navigate, searchParams]);

  const teaches = (enrollments ?? []).some((e) => e.role === "instructor");

  const now = Date.now();
  const list = enrollments ?? [];
  const current = list.filter((e) => isCourseCurrent(e.startDate, e.endDate, now));
  const rest = list.filter((e) => !isCourseCurrent(e.startDate, e.endDate, now));
  // Only label the two sections when both are present; a single list stands
  // alone (keeps the common case uncluttered).
  const bothSections = current.length > 0 && rest.length > 0;

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
          <PageHeader
            eyebrow="Your courses"
            title={teaches ? "My Courses" : "Pick a Course"}
            scope={
              teaches
                ? "Every course you teach. Open one to author its agents, sources and roster — or expand it to set its term and the dates it runs. Courses running now are grouped up top; past and upcoming semesters below."
                : "Pick the one you want to open. Courses running now are up top; past and upcoming semesters below."
            }
            actions={
              teaches ? (
                <Button
                  variant="primary"
                  icon={<PlusIcon size={16} />}
                  onClick={() => setNewOpen(true)}
                >
                  New Course
                </Button>
              ) : undefined
            }
          />

          {error && <p className="error">{error}</p>}

          {enrollments === null ? (
            <p className="app-empty">Loading…</p>
          ) : enrollments.length === 0 ? (
            <p className="app-empty">
              You aren&rsquo;t enrolled in any courses yet. Use a join code on
              the home page to enroll{teaches ? ", or create one above" : ""}.
            </p>
          ) : (
            <>
              <CourseSection
                title={bothSections ? "Current" : null}
                flat
                groups={groupByTerm(current)}
                navigate={navigate}
              />
              <CourseSection
                title={bothSections ? "Past & upcoming" : null}
                past
                groups={groupByTerm(rest)}
                navigate={navigate}
              />
            </>
          )}
        </div>
      </div>

      {newOpen && (
        <NewCourseModal
          onClose={() => setNewOpen(false)}
          onCreate={async (name, patch) => {
            const course = await createCourse(name, patch);
            navigate(`/course/${course.id}/instructor`);
          }}
        />
      )}
    </div>
  );
}

function CourseSection({
  title,
  past = false,
  flat = false,
  groups,
  navigate,
}: {
  title: string | null;
  past?: boolean;
  /** Render one flat list (no academic-year subheaders). Used by the Current
   *  section, where every course is running now regardless of its term. */
  flat?: boolean;
  groups: TermGroup[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (groups.length === 0) return null;
  // Show per-group academic-year headers only when they carry information:
  // more than one group, or a single scheduled group. A lone "Unscheduled"
  // group stays a flat list, matching the pre-term behaviour.
  const showGroupHeads =
    !flat &&
    (groups.length > 1 || groups.some((g) => g.label !== "Unscheduled"));

  const card = (e: MeEnrollment) => (
    <CourseCard key={e.courseId} enrollment={e} navigate={navigate} />
  );

  return (
    <div className={"app-csection" + (past ? " app-csection--past" : "")}>
      {title && <h2 className="app-csection__title">{title}</h2>}
      {flat ? (
        <div className="app-dlist">{groups.flatMap((g) => g.items).map(card)}</div>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="app-cgroup">
            {showGroupHeads && <div className="app-cgroup__head">{g.label}</div>}
            <div className="app-dlist">{g.items.map(card)}</div>
          </div>
        ))
      )}
    </div>
  );
}

// A course card is the same for students and instructors: the course's info
// plus an Open button. There is no inline settings expansion — an instructor
// configures a course from inside it (the Settings tab), not from this list.
// Open lands each role on its own dashboard.
function CourseCard({
  enrollment: e,
  navigate,
}: {
  enrollment: MeEnrollment;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const isInstructor = e.role === "instructor";
  const home = isInstructor
    ? `/course/${e.courseId}/instructor`
    : `/course/${e.courseId}/dashboard`;

  const term =
    e.termSeason != null && e.termYear != null
      ? termLabel(e.termSeason, e.termYear)
      : null;
  const dates = formatDateRange(e.startDate, e.endDate);
  const current = isCourseCurrent(e.startDate, e.endDate, Date.now());

  return (
    <div className="app-dcourse">
      <div className="app-dcourse__head">
        <div
          className="app-dcourse__id"
          onClick={() => navigate(home)}
          role="link"
          tabIndex={0}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") navigate(home);
          }}
        >
          <div className="app-dcourse__title">
            {e.courseName}
            {current && <span className="app-dcourse__badge">Current</span>}
            {(e.showCollections || e.provenanceEnabled || e.showAttendance) && (
              <span className="app-dcourse__icons">
                {e.showCollections && (
                  <Tooltip label="Library">
                    <span className="app-dcourse__icon" aria-label="Library enabled">
                      <LibraryIcon size={16} />
                    </span>
                  </Tooltip>
                )}
                {e.provenanceEnabled && (
                  <Tooltip label="Writing">
                    <span className="app-dcourse__icon" aria-label="Writing enabled">
                      <WritingIcon size={16} />
                    </span>
                  </Tooltip>
                )}
                {e.showAttendance && (
                  <Tooltip label="Attendance">
                    <span
                      className="app-dcourse__icon"
                      aria-label="Attendance enabled"
                    >
                      <BellCheckIcon size={16} />
                    </span>
                  </Tooltip>
                )}
              </span>
            )}
          </div>
          <div className="app-dcourse__stats">
            <span>{e.role}</span>
            {term && (
              <>
                <i>·</i>
                <span className="app-dcourse__term">{term}</span>
              </>
            )}
            {dates && (
              <>
                <i>·</i>
                <span className="app-dcourse__dates">{dates}</span>
              </>
            )}
          </div>
        </div>
        <div className="app-dcourse__actions">
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
    </div>
  );
}

// DS New Course modal — name + term + dates. Only the blank path is wired (the
// backend creates a blank course you instruct); copy-from is a follow-up.
function NewCourseModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (
    name: string,
    patch: {
      termSeason: TermSeason | null;
      termYear: number | null;
      startDate: number | null;
      endDate: number | null;
    },
  ) => Promise<void>;
}) {
  const [name, setName] = useState("");
  // Default to the current term (and its default dates) so a new course lands
  // in the right semester, running now.
  const initial = currentTerm(Date.now());
  const initialDates = defaultTermDates(initial.season, initial.year);
  const [season, setSeason] = useState<TermSeason | "">(initial.season);
  const [year, setYear] = useState<string>(String(initial.year));
  const [start, setStart] = useState<string>(msToDateInput(initialDates.start));
  const [end, setEnd] = useState<string>(msToDateInput(initialDates.end));
  // Once the instructor edits a date by hand, stop auto-refilling from the term.
  const [datesTouched, setDatesTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the term changes and the dates are still term-derived, refresh the
  // default window to match the newly-picked season/year.
  function onTermChange(nextSeason: TermSeason | "", nextYear: string) {
    setSeason(nextSeason);
    setYear(nextYear);
    if (!datesTouched && nextSeason !== "" && Number.isInteger(Number(nextYear))) {
      const d = defaultTermDates(nextSeason, Number(nextYear));
      setStart(msToDateInput(d.start));
      setEnd(msToDateInput(d.end));
    }
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    // A season without a year (or vice versa) is rejected; both empty = an
    // unscheduled course.
    let termSeason: TermSeason | null = null;
    let termYear: number | null = null;
    if (season !== "" || year.trim() !== "") {
      const y = Number(year);
      if (season === "" || !Number.isInteger(y)) {
        setError("Pick a season and a year for the term, or clear both.");
        return;
      }
      termSeason = season;
      termYear = y;
    }
    const startDate = dateInputToMs(start);
    const endDate = dateInputToMs(end, { endOfDay: true });
    if (startDate != null && endDate != null && startDate > endDate) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(trimmed, { termSeason, termYear, startDate, endDate });
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
          <h2>Create a Course</h2>
        </div>
        <div className="app-modal__body">
          {error && <p className="error">{error}</p>}
          <Field label="Course name">
            <Input
              autoFocus
              type="text"
              placeholder="e.g. Intro to Product Design"
              value={name}
              disabled={busy}
              onChange={(ev) => setName(ev.target.value)}
            />
          </Field>
          <div className="app-termedit" style={{ marginTop: 0 }}>
            <Field label="Season">
              <Select
                value={season}
                disabled={busy}
                onChange={(ev) =>
                  onTermChange(ev.target.value as TermSeason | "", year)
                }
              >
                <option value="">Unscheduled</option>
                {TERM_SEASONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <Input
                className="app-termedit__year"
                type="number"
                inputMode="numeric"
                placeholder="2026"
                value={year}
                disabled={busy}
                onChange={(ev) => onTermChange(season, ev.target.value)}
              />
            </Field>
          </div>
          {/* Starts + Ends on their own row, a 50/50 split spanning the block. */}
          <div className="app-daterow">
            <Field label="Starts">
              <Input
                type="date"
                value={start}
                disabled={busy}
                onChange={(ev) => {
                  setDatesTouched(true);
                  setStart(ev.target.value);
                }}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={end}
                disabled={busy}
                onChange={(ev) => {
                  setDatesTouched(true);
                  setEnd(ev.target.value);
                }}
              />
            </Field>
          </div>
          <p className="app-page__scope" style={{ marginTop: 0 }}>
            The dates decide when the course counts as “current.” They default to
            the term you pick — adjust them to your actual calendar. A join code
            is created automatically.
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
            Create Course
          </Button>
        </div>
      </form>
    </div>
  );
}

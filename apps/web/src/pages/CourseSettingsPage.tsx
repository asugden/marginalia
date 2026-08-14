// Course Settings — the instructor's course-configuration page
// (/course/:courseId/instructor/settings). Three headed sections:
//   1. Course Stats — agents / libraries / enrolled totals.
//   2. Term & Timeline — the semester + the dates the course runs (which drive
//      whether it's "current").
//   3. Resources & Extensions — the optional module toggles.
//
// This replaces the old inline course-admin panel that lived behind a chevron
// on the "All courses" cards. Current values seed from useCourse(); after a
// save/toggle it calls refresh() so the nav and dashboard reflect the change
// without a reload.
import { useEffect, useState } from "react";
import {
  listAgents,
  listCollections,
  listRoster,
  setCourseFeature,
  updateCourse,
} from "../client.js";
import { useCourse } from "../course/useCourse.js";
import {
  dateInputToMs,
  defaultTermDates,
  msToDateInput,
  TERM_SEASONS,
  type TermSeason,
} from "../course/term.js";
import {
  Button,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  StatGrid,
  StatTile,
} from "../components/index.js";

export function CourseSettingsPage() {
  const {
    courseId,
    showAttendance,
    agentsEnabled,
    provenanceEnabled,
    termSeason,
    termYear,
    startDate,
    endDate,
    refresh,
  } = useCourse();

  const [stats, setStats] = useState<{
    agents: number;
    libraries: number;
    students: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Module toggles — optimistic local copies; refresh() reconciles the nav.
  const [attendanceOn, setAttendanceOn] = useState(showAttendance);
  const [agentsOn, setAgentsOn] = useState(agentsEnabled);
  const [provenanceOn, setProvenanceOn] = useState(provenanceEnabled);

  // Term + date drafts. "" season = unscheduled; "" date = open bound.
  const [seasonDraft, setSeasonDraft] = useState<TermSeason | "">(termSeason ?? "");
  const [yearDraft, setYearDraft] = useState<string>(
    termYear != null ? String(termYear) : "",
  );
  const [startDraft, setStartDraft] = useState<string>(msToDateInput(startDate));
  const [endDraft, setEndDraft] = useState<string>(msToDateInput(endDate));
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.allSettled([
      listAgents(courseId),
      listCollections(courseId),
      listRoster(courseId),
    ]).then(([agents, collections, roster]) => {
      if (!live) return;
      setStats({
        agents: agents.status === "fulfilled" ? agents.value.agents.length : 0,
        libraries:
          collections.status === "fulfilled"
            ? collections.value.collections.length
            : 0,
        students:
          roster.status === "fulfilled"
            ? roster.value.roster.filter((r) => r.role === "student").length
            : 0,
      });
    });
    return () => {
      live = false;
    };
  }, [courseId]);

  async function toggleFeature(
    feature: "attendance" | "agents" | "provenance",
    next: boolean,
  ) {
    const setLocal =
      feature === "agents"
        ? setAgentsOn
        : feature === "provenance"
          ? setProvenanceOn
          : setAttendanceOn;
    setLocal(next);
    setError(null);
    try {
      await setCourseFeature(courseId, feature, next);
      // Reflect the change in the nav (Agents/Attendance tab visibility).
      await refresh();
    } catch (err) {
      setLocal(!next); // rollback
      setError(err instanceof Error ? err.message : "Couldn't update module");
    }
  }

  const dirty =
    seasonDraft !== (termSeason ?? "") ||
    yearDraft !== (termYear != null ? String(termYear) : "") ||
    startDraft !== msToDateInput(startDate) ||
    endDraft !== msToDateInput(endDate);

  /** Fill the date inputs with the generic default window for the drafted term.
   *  Available only once a season + year are chosen. */
  function useTermDefaults() {
    if (seasonDraft === "" || !Number.isInteger(Number(yearDraft))) return;
    const d = defaultTermDates(seasonDraft, Number(yearDraft));
    setStartDraft(msToDateInput(d.start));
    setEndDraft(msToDateInput(d.end));
  }

  async function save() {
    if (saveBusy) return;
    const wantsTerm = seasonDraft !== "" || yearDraft.trim() !== "";
    let termSeasonVal: TermSeason | null = null;
    let termYearVal: number | null = null;
    if (wantsTerm) {
      const year = Number(yearDraft);
      if (seasonDraft === "" || !Number.isInteger(year)) {
        setError("Pick a season and a year for the term, or clear both.");
        return;
      }
      termSeasonVal = seasonDraft;
      termYearVal = year;
    }
    const startVal = dateInputToMs(startDraft);
    const endVal = dateInputToMs(endDraft, { endOfDay: true });
    if (startVal != null && endVal != null && startVal > endVal) {
      setError("The start date must be on or before the end date.");
      return;
    }
    setSaveBusy(true);
    setError(null);
    try {
      await updateCourse(courseId, {
        termSeason: termSeasonVal,
        termYear: termYearVal,
        startDate: startVal,
        endDate: endVal,
      });
      // Update the dashboard header + switcher without a reload.
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the course");
    } finally {
      setSaveBusy(false);
    }
  }

  const n = (v: number | undefined) => (v == null ? "—" : v.toLocaleString());

  return (
    <div className="app-page app-settings">
      <PageHeader
        eyebrow="Instructor · Settings"
        title="Settings"
        scope="The course’s totals, the term and dates it runs, and which tools it offers."
      />

      {error && <p className="error">{error}</p>}

      {/* 1 — Course Stats */}
      <Section title="Course Stats" description="What’s in this course right now.">
        <StatGrid>
          <StatTile value={n(stats?.agents)} label="Agents" />
          <StatTile value={n(stats?.libraries)} label="Libraries" />
          <StatTile value={n(stats?.students)} label="Enrolled" />
        </StatGrid>
      </Section>

      {/* 2 — Term & Timeline */}
      <Section
        title="Term & Timeline"
        description="The semester sets the label and grouping; the start and end dates decide when the course counts as “current.” Pick a term and hit “Use term dates” for a sensible default window you can adjust."
      >
        {/* Season, Year, Starts, Ends, and "Use term dates" all on one line. */}
        <div className="app-termedit">
          <Field label="Season">
            <Select
              value={seasonDraft}
              onChange={(ev) => setSeasonDraft(ev.target.value as TermSeason | "")}
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
              value={yearDraft}
              onChange={(ev) => setYearDraft(ev.target.value)}
            />
          </Field>
          <Field label="Starts">
            <Input
              type="date"
              value={startDraft}
              onChange={(ev) => setStartDraft(ev.target.value)}
            />
          </Field>
          <Field label="Ends">
            <Input
              type="date"
              value={endDraft}
              onChange={(ev) => setEndDraft(ev.target.value)}
            />
          </Field>
          <Button
            variant="ghost"
            className="app-termedit__btn"
            onClick={useTermDefaults}
            disabled={seasonDraft === "" || !Number.isInteger(Number(yearDraft))}
          >
            Use term dates
          </Button>
          <Button
            variant="primary"
            className="app-termedit__btn"
            onClick={save}
            loading={saveBusy}
            disabled={saveBusy || !dirty}
          >
            Save
          </Button>
        </div>
      </Section>

      {/* 3 — Resources & Extensions */}
      <Section
        title="Resources & Extensions"
        description="Turn an extension off to remove it from this course’s nav and the students’ view."
      >
        <div className="app-modules">
          <label className={"app-module" + (agentsOn ? " app-module--on" : "")}>
            <span className="app-module__main">
              <b>Agents</b>
              <span>
                AI tutors students chat with, each with its own voice. Adds the
                Agents tab and shows agents to students.
              </span>
            </span>
            <input
              type="checkbox"
              className="app-switch"
              checked={agentsOn}
              onChange={(ev) => toggleFeature("agents", ev.target.checked)}
            />
          </label>
          <label className={"app-module" + (provenanceOn ? " app-module--on" : "")}>
            <span className="app-module__main">
              <b>Provenance writing</b>
              <span>
                A writing space that records where every word came from. Adds the
                Writing tool for students.
              </span>
            </span>
            <input
              type="checkbox"
              className="app-switch"
              checked={provenanceOn}
              onChange={(ev) => toggleFeature("provenance", ev.target.checked)}
            />
          </label>
          <label className={"app-module" + (attendanceOn ? " app-module--on" : "")}>
            <span className="app-module__main">
              <b>Attendance</b>
              <span>QR check-in for in-person classes. Adds the Attendance tab.</span>
            </span>
            <input
              type="checkbox"
              className="app-switch"
              checked={attendanceOn}
              onChange={(ev) => toggleFeature("attendance", ev.target.checked)}
            />
          </label>
        </div>
      </Section>
    </div>
  );
}

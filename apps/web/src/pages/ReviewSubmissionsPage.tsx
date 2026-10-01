// Review ▸ Submissions — /course/:id/instructor/submissions.
//
// What came back from the class, BY ASSIGNMENT, across every type that takes
// submissions. Each row is one thing students hand in by one deadline — a
// writing checkpoint ("Essay 1 — Draft"; a one-checkpoint assignment is just
// "Essay 1") or a coding assignment — with "N of M submitted · K on time", and
// opens that assignment's submissions page. The authoring side of the same
// assignments is Assign ▸ Writing / Code; each submissions page links back.
//
// Two groups, because they are read for different reasons:
//   Past deadline — work that should be in; most recent deadline first.
//   Open          — deadline still ahead (soonest first) or none at all.
//
// Drafts nobody could have submitted to are left out. The Uncategorized button
// (writing submissions that belong to no current checkpoint) shows only when
// there are some.
//
// This page composes two modules' public APIs, which is why it lives in pages/
// rather than inside either module.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCourse } from "../course/useCourse.js";
import {
  Badge,
  Button,
  PageHeader,
  Section,
  submissionFraction,
} from "../components/index.js";
import {
  listAssignmentsWithStats as listWriting,
  listCourseSubmissions,
  type AssignmentDTO,
  type CourseSubmissionSummary,
  type SubmissionStats,
} from "../modules/provenance/api.js";
import { checkpointTitle, formatDue, uncategorized } from "../modules/provenance/components/AssignmentsPage.js";
import { listAssignmentsWithStats as listCode } from "../modules/code/api.js";

interface Row {
  key: string;
  kind: "Writing" | "Code";
  title: string;
  dueAt: number | null;
  href: string;
  /** Unpublished, but shown because students submitted before it was. */
  hidden: boolean;
  counts: { submitted: number; onTime: number } | undefined;
  students: number;
}

const EMPTY: SubmissionStats = { students: 0, byId: {} };

export function ReviewSubmissionsPage() {
  const { courseId, provenanceEnabled, codeEnabled } = useCourse();
  const base = `/course/${courseId}/instructor/submissions`;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loose, setLoose] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    const ctrl = new AbortController();
    const writing = provenanceEnabled
      ? listWriting(courseId, ctrl.signal)
      : Promise.resolve({ assignments: [] as AssignmentDTO[], stats: EMPTY });
    const code = codeEnabled
      ? listCode(courseId, ctrl.signal)
      : Promise.resolve({ assignments: [], stats: EMPTY });
    // Only for the Uncategorized count; a failure must not hide the list.
    const subs = provenanceEnabled
      ? listCourseSubmissions(courseId, ctrl.signal).catch(() => [] as CourseSubmissionSummary[])
      : Promise.resolve([] as CourseSubmissionSummary[]);
    Promise.all([writing, code, subs])
      .then(([w, c, s]) => {
        if (ctrl.signal.aborted) return;
        const out: Row[] = [];
        for (const a of w.assignments) {
          for (const cp of a.checkpoints) {
            const counts = w.stats.byId[cp.id];
            const hidden = a.archivedAt !== null;
            if (hidden && !counts) continue;
            out.push({
              key: `w:${cp.id}`,
              kind: "Writing",
              title: checkpointTitle(a, cp),
              dueAt: cp.dueAt,
              href: `${base}/writing/${a.id}/${cp.id}`,
              hidden,
              counts,
              students: w.stats.students,
            });
          }
        }
        for (const a of c.assignments) {
          // Practice assignments take no submissions.
          if (a.mode === "practice") continue;
          const counts = c.stats.byId[a.id];
          const hidden = a.archivedAt !== null;
          if (hidden && !counts) continue;
          out.push({
            key: `c:${a.id}`,
            kind: "Code",
            title: a.title,
            dueAt: a.dueAt,
            href: `${base}/code/${a.id}`,
            hidden,
            counts,
            students: c.stats.students,
          });
        }
        setRows(out);
        setLoose(uncategorized(s, w.assignments).length);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId, provenanceEnabled, codeEnabled, base]);

  const { past, open } = useMemo(() => {
    const now = Date.now();
    const all = rows ?? [];
    const past = all
      .filter((r) => r.dueAt !== null && r.dueAt < now)
      .sort((a, b) => b.dueAt! - a.dueAt! || a.title.localeCompare(b.title));
    const open = all
      .filter((r) => r.dueAt === null || r.dueAt >= now)
      .sort((a, b) => {
        if (a.dueAt !== b.dueAt) {
          if (a.dueAt === null) return 1;
          if (b.dueAt === null) return -1;
          return a.dueAt - b.dueAt;
        }
        return a.title.localeCompare(b.title);
      });
    return { past, open };
  }, [rows]);

  const uncategorizedButton =
    loose > 0 ? (
      <Button variant="subtle" size="sm" href={`${base}/uncategorized`}>
        Uncategorized ({loose})
      </Button>
    ) : undefined;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Review"
        title="Submissions"
        scope="What students have handed in, by assignment. Each checkpoint of a writing assignment is listed on its own. Open one to read the submissions and see who hasn't submitted."
      />

      {error && <p className="error">{error}</p>}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Section kicker="Submissions" actions={uncategorizedButton}>
          <p className="muted">
            Nothing to review yet. Once a writing or coding assignment is
            published, it appears here with who has submitted.
          </p>
        </Section>
      ) : (
        <>
          {past.length > 0 && (
            <Section kicker="Past deadline" meta={`${past.length}`} actions={uncategorizedButton}>
              <ReviewRows rows={past} />
            </Section>
          )}
          {open.length > 0 && (
            <Section
              kicker="Open"
              meta={`${open.length}`}
              actions={past.length === 0 ? uncategorizedButton : undefined}
            >
              <ReviewRows rows={open} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function ReviewRows({ rows }: { rows: Row[] }) {
  return (
    <div className="app-list">
      {rows.map((r) => (
        <div className="app-list__row" key={r.key}>
          <div className="app-list__main">
            <div className="app-list__title">
              <Link to={r.href}>{r.title}</Link> <Badge tone="neutral">{r.kind}</Badge>
              {r.hidden && (
                <>
                  {" "}
                  <Badge tone="warning">Unpublished</Badge>
                </>
              )}
            </div>
            <div className="app-list__sub">
              {r.dueAt === null ? "No deadline" : `Due ${formatDue(r.dueAt)}`}
              {" · "}
              {submissionFraction(r.counts, r.students, r.dueAt !== null)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

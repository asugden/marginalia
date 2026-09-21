// Instructor-side writing-assignment authoring — /course/:id/instructor/assignments.
//
// This page predates the assignment wrapper and has narrowed since. The Assign
// band (/course/:id/instructor/assign, the course-items module) is now the one
// list of everything the course assigns, across every kind. What stays here is
// the thing Assign deliberately does not do: AUTHORING a writing assignment —
// its title, instructions, and the ordered checkpoints students submit
// against. Writing is the one kind needing several dated moments, so it keeps
// its own editor rather than being squeezed into the wrapper's single due date.
//
// The combined writing+examples list below is retained so the page stands on
// its own for a course that arrives here directly, but the Assign band is the
// surface that list is now duplicated by; prefer linking there.
//
// This page is a PRESENTATION-LAYER union only. Nothing is merged underneath:
// each kind is still read from its own module's API, still written through its
// own editor, and still governed by its own rules. In particular the examples
// privacy split (anonymous aggregate usage on one side, opt-in binary
// completion on the other, never joined) survives untouched — this list shows
// only the completion side, as a count of students who marked an example done.
//
// Deadlines are optional on both kinds. A writing checkpoint with no date can
// never be late; an example with no date is simply "worth your time". Nothing
// here ever blocks a late submission — a deadline only decides whether the
// writing roster prints the word LATE beside a timestamp.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
  type AssignmentDTO,
  type CheckpointInput,
} from "../api.js";
import {
  getCompletionRoster,
  getCourseExamples,
  type CourseExampleDTO,
} from "../../examples/api.js";
import { findExample } from "../../../examples/registry.js";
import {
  Badge,
  Button,
  Dropdown,
  Field,
  Input,
  PageHeader,
  Section,
  Textarea,
  useConfirm,
} from "../../../components/index.js";

/** A checkpoint while it's being edited. The date input speaks `datetime-local`
 *  strings, so the draft holds that rather than epoch ms. */
interface CheckpointDraft {
  name: string;
  /** "" = no deadline. */
  due: string;
}

/** Epoch ms → the `datetime-local` value, in the viewer's own zone. An
 *  instructor sets deadlines in the time they teach in, not in UTC. */
function toLocalInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The inverse. An empty or unparseable value means "no deadline" rather than
 *  an error — the field clears to "" and that is a legitimate state. */
function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function formatDue(ms: number | null): string {
  if (ms === null) return "no deadline";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Example dates are stored at UTC midnight (the curation editor uses a
 *  date-only input), so they print as a day with no clock — showing "12:00 AM"
 *  beside them would suggest a precision the instructor never set. */
function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ── The unified row model ──────────────────────────────────────────────────

/**
 * One entry in the combined list, normalised from whichever module it came
 * from. The two kinds keep their own payloads (`writing` / `example`) rather
 * than being flattened into shared fields, because their editors, their detail
 * pages, and their rules all differ — the union exists to sort and render them
 * together, not to pretend they are the same thing.
 */
type Entry =
  | { kind: "writing"; key: string; title: string; sortDue: number | null; archived: boolean; writing: AssignmentDTO }
  | { kind: "example"; key: string; title: string; sortDue: number | null; archived: false; example: CourseExampleDTO; completed: number; cohort: number };

/**
 * Sort key: the soonest deadline the entry still carries, with undated entries
 * last.
 *
 * A writing assignment has several checkpoints, so "its" due date is the
 * earliest one that hasn't passed — the next thing the class owes — falling
 * back to its latest deadline once every checkpoint is behind us, so finished
 * work drifts to the top of the list in the order it was actually due rather
 * than jumping to the undated tail. An example has at most one date, which is
 * simply it.
 *
 * Undated entries sort last, not first: "no deadline" is the instructor
 * declining to schedule something, and a list read for "what's next" should not
 * open with the items that are never next. Within the undated group, and
 * between entries sharing a date, ties break on title so the order is stable
 * across reloads rather than depending on fetch timing.
 */
function nextDue(cps: Array<{ dueAt: number | null }>, now: number): number | null {
  const dated = cps.map((c) => c.dueAt).filter((d): d is number => d !== null);
  if (dated.length === 0) return null;
  const upcoming = dated.filter((d) => d >= now);
  return upcoming.length > 0 ? Math.min(...upcoming) : Math.max(...dated);
}

function compareEntries(a: Entry, b: Entry): number {
  // Archived writing sinks below everything live, dated or not: it has been
  // explicitly taken out of the students' list, so it is no longer something
  // the class owes. (Examples have no archived state — removing one from the
  // curated list is the equivalent, and it stops appearing here entirely.)
  if (a.archived !== b.archived) return a.archived ? 1 : -1;
  if (a.sortDue === null && b.sortDue === null) return a.title.localeCompare(b.title);
  if (a.sortDue === null) return 1;
  if (b.sortDue === null) return -1;
  if (a.sortDue !== b.sortDue) return a.sortDue - b.sortDue;
  return a.title.localeCompare(b.title);
}

export function AssignmentsPage() {
  const { courseId } = useCourse();
  const [assignments, setAssignments] = useState<AssignmentDTO[] | null>(null);
  const [examples, setExamples] = useState<CourseExampleDTO[] | null>(null);
  /** slug → how many enrolled students marked it complete, plus the cohort
   *  size. Both come out of the completion roster the Completion panel already
   *  fetches, so the count costs no extra round-trip. */
  const [completions, setCompletions] = useState<{ bySlug: Map<string, number>; cohort: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AssignmentDTO | "new" | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setAssignments(null);
    setExamples(null);
    setCompletions(null);
    setError(null);
    const ctrl = new AbortController();

    listAssignments(courseId, { includeArchived: true }, ctrl.signal)
      .then((a) => { if (!ctrl.signal.aborted) setAssignments(a); })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });

    // The examples half loads independently and fails quietly into an empty
    // list: a course that has curated nothing is the common case, and a
    // hiccup fetching the examples side should not blank out the writing the
    // instructor came here for.
    Promise.all([
      getCourseExamples(courseId, ctrl.signal),
      getCompletionRoster(courseId, ctrl.signal),
    ])
      .then(([rows, roster]) => {
        if (ctrl.signal.aborted) return;
        const bySlug = new Map<string, number>();
        for (const student of roster) {
          for (const slug of student.completed) {
            bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1);
          }
        }
        setExamples(rows);
        setCompletions({ bySlug, cohort: roster.length });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setExamples([]);
        setCompletions({ bySlug: new Map(), cohort: 0 });
      });

    return () => ctrl.abort();
  }, [courseId]);

  const entries = useMemo<Entry[] | null>(() => {
    if (assignments === null || examples === null || completions === null) return null;
    const now = Date.now();
    const rows: Entry[] = [
      ...assignments.map((a): Entry => ({
        kind: "writing",
        key: `w:${a.id}`,
        title: a.title,
        sortDue: nextDue(a.checkpoints, now),
        archived: a.archivedAt !== null,
        writing: a,
      })),
      // Skip slugs the registry no longer knows: a deploy that drops an example
      // should leave its curation row inert rather than produce a dead link.
      // Same rule the student list and the curation panel follow.
      ...examples
        .filter((e) => findExample(e.slug))
        .map((e): Entry => ({
          kind: "example",
          key: `e:${e.slug}`,
          title: findExample(e.slug)?.title ?? e.slug,
          sortDue: e.dueAt,
          archived: false,
          example: e,
          completed: completions.bySlug.get(e.slug) ?? 0,
          cohort: completions.cohort,
        })),
    ];
    return rows.sort(compareEntries);
  }, [assignments, examples, completions]);

  function upsert(saved: AssignmentDTO) {
    setAssignments((cur) => {
      const list = cur ?? [];
      return list.some((a) => a.id === saved.id)
        ? list.map((a) => (a.id === saved.id ? saved : a))
        : [saved, ...list];
    });
    setEditing(null);
  }

  async function onDelete(a: AssignmentDTO) {
    if (
      !(await confirm({
        title: `Delete “${a.title}”?`,
        body: "Submissions students already made are kept — they just stop being attached to an assignment. Archive instead if you only want it out of the student's list.",
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      await deleteAssignment(courseId, a.id);
      setAssignments((cur) => (cur ?? []).filter((x) => x.id !== a.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function onToggleArchive(a: AssignmentDTO) {
    try {
      const saved = await updateAssignment(a.id, {
        courseId,
        archived: a.archivedAt === null,
      });
      upsert(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const writingCount = (assignments ?? []).filter((a) => a.archivedAt === null).length;
  const archivedCount = (assignments ?? []).filter((a) => a.archivedAt !== null).length;
  const exampleCount = (entries ?? []).filter((e) => e.kind === "example").length;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor"
        title="Assignments"
        scope="Everything you've set this class, on one list. Writing assignments carry checkpoints — a draft and a final, say — and the student keeps one document across all of them. Examples are interactive pages a student works through and marks complete."
      />

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Set for this course"
        meta={
          entries === null
            ? undefined
            : [
                `${writingCount} writing`,
                `${exampleCount} example${exampleCount === 1 ? "" : "s"}`,
                archivedCount > 0 ? `${archivedCount} archived` : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        actions={
          editing === null && <NewAssignmentControl courseId={courseId} onNewWriting={() => setEditing("new")} />
        }
      >
        {editing === "new" && (
          <AssignmentEditor
            courseId={courseId}
            assignment={null}
            onSaved={upsert}
            onCancel={() => setEditing(null)}
          />
        )}

        {entries === null ? (
          <p className="muted">Loading…</p>
        ) : entries.length === 0 && editing === null ? (
          <p className="muted">
            Nothing set yet. Add a writing assignment to give students something
            to submit against — and to see, on one page, who hasn't. Or assign an
            example for them to work through.
          </p>
        ) : (
          <div className="app-list">
            {entries.map((entry) =>
              entry.kind === "writing" ? (
                editing !== "new" && editing?.id === entry.writing.id ? (
                  <AssignmentEditor
                    key={entry.key}
                    courseId={courseId}
                    assignment={entry.writing}
                    onSaved={upsert}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <WritingRow
                    key={entry.key}
                    courseId={courseId}
                    assignment={entry.writing}
                    onEdit={() => setEditing(entry.writing)}
                    onArchive={() => onToggleArchive(entry.writing)}
                    onDelete={() => onDelete(entry.writing)}
                  />
                )
              ) : (
                <ExampleRow key={entry.key} courseId={courseId} entry={entry} />
              ),
            )}
          </div>
        )}
      </Section>
      {confirmDialog}
    </div>
  );
}

/**
 * The "New" control. Writing is created inline on this page; an example is
 * "created" by curating it from the registry, which is a different enough act
 * (pick an existing public page, rather than author a new thing) that it has
 * its own surface. So one option opens the editor below and the other
 * navigates.
 */
function NewAssignmentControl({
  courseId,
  onNewWriting,
}: {
  courseId: string;
  onNewWriting: () => void;
}) {
  const navigate = useNavigate();
  // Dropdown is a controlled one-of-N, but here the options are actions rather
  // than a persistent selection: the value resets to the placeholder after each
  // pick so the trigger keeps reading "New".
  return (
    <Dropdown
      value=""
      placeholder="New"
      ariaLabel="Add an assignment"
      align="end"
      options={[
        { value: "writing", label: "Writing assignment" },
        { value: "example", label: "Example" },
      ]}
      onChange={(v) => {
        if (v === "writing") onNewWriting();
        else navigate(`/course/${courseId}/instructor/assign/examples`);
      }}
    />
  );
}

/** Type tag. Neutral on both kinds — this says what a row *is*, and must never
 *  become a place to say how a row is *going*. */
function KindBadge({ kind }: { kind: "writing" | "example" }) {
  return <Badge tone="neutral">{kind === "writing" ? "Writing" : "Example"}</Badge>;
}

function WritingRow({
  courseId,
  assignment,
  onEdit,
  onArchive,
  onDelete,
}: {
  courseId: string;
  assignment: AssignmentDTO;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const archived = assignment.archivedAt !== null;
  return (
    <div className="app-list__row prov-asg__row">
      <div className="app-list__main">
        <div className="app-list__title">
          <Link to={`/course/${courseId}/instructor/assignments/${assignment.id}`}>
            {assignment.title}
          </Link>{" "}
          <KindBadge kind="writing" />
          {archived && (
            <>
              {" "}
              <Badge tone="neutral">archived</Badge>
            </>
          )}
        </div>
        <div className="app-list__sub">
          {assignment.checkpoints.length === 0
            ? "No checkpoints"
            : assignment.checkpoints
                .map((c) => `${c.name} — ${formatDue(c.dueAt)}`)
                .join(" · ")}
        </div>
        {/* No "N of M submitted" here. The count exists only inside the
            per-assignment roster endpoint, so showing it on the list would
            cost one extra round-trip per row; open the assignment to see who
            has submitted and who hasn't. */}
      </div>
      <div className="app-list__meta prov-asg__actions">
        <Button variant="subtle" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="subtle" size="sm" onClick={onArchive}>
          {archived ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </div>
  );
}

/**
 * An assigned example. The row links to the curation surface, which is where
 * both of this kind's detail views live.
 *
 * The only per-example figure shown is how many students marked it complete —
 * their own opt-in claim about their own work. Deliberately absent: open
 * counts, engaged-open counts, time spent, or anything else from the anonymous
 * usage aggregate. Those are a different table with no user column, and putting
 * one of its numbers on the same row as a per-student completion count would
 * imply the two can be read against each other. They cannot, by design. See the
 * examples module README.
 */
function ExampleRow({
  courseId,
  entry,
}: {
  courseId: string;
  entry: Extract<Entry, { kind: "example" }>;
}) {
  const navigate = useNavigate();
  const { example, completed, cohort } = entry;
  const dates: string[] = [];
  if (example.assignedAt !== null) dates.push(`assigned ${formatDay(example.assignedAt)}`);
  dates.push(example.dueAt !== null ? `due ${formatDay(example.dueAt)}` : "no deadline");

  return (
    <div className="app-list__row prov-asg__row">
      <div className="app-list__main">
        <div className="app-list__title">
          <Link to={`/course/${courseId}/instructor/assign/examples`}>{entry.title}</Link>{" "}
          <KindBadge kind="example" />
        </div>
        <div className="app-list__sub">
          {dates.join(" · ")}
          {cohort > 0 && <> · {completed}/{cohort} marked complete</>}
          {example.note && <> · {example.note}</>}
        </div>
      </div>
      <div className="app-list__meta prov-asg__actions">
        <a
          className="ex-preview-link"
          href={`/examples/${example.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Preview
        </a>
        <Button
          variant="subtle"
          size="sm"
          onClick={() => navigate(`/course/${courseId}/instructor/assign/examples`)}
        >
          Manage
        </Button>
      </div>
    </div>
  );
}

/**
 * Create/edit form for a writing assignment. Checkpoints are edited as an
 * ordered list and saved wholesale — the server replaces them rather than
 * reconciling ids, so the order on screen is the order stored.
 */
function AssignmentEditor({
  courseId,
  assignment,
  onSaved,
  onCancel,
}: {
  courseId: string;
  assignment: AssignmentDTO | null;
  onSaved: (a: AssignmentDTO) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>(
    assignment?.checkpoints.map((c) => ({ name: c.name, due: toLocalInput(c.dueAt) })) ??
      // A new assignment starts with one checkpoint: the common case is a
      // single due date, and an empty list would only be an extra click.
      [{ name: "Final", due: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patchCheckpoint(i: number, patch: Partial<CheckpointDraft>) {
    setCheckpoints((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  function move(i: number, delta: number) {
    setCheckpoints((cur) => {
      const j = i + delta;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  async function onSubmit() {
    setError(null);
    const cleaned: CheckpointInput[] = checkpoints
      .map((c) => ({ name: c.name.trim(), dueAt: fromLocalInput(c.due) }))
      .filter((c) => c.name !== "");
    if (!title.trim()) {
      setError("Give the assignment a title.");
      return;
    }
    if (cleaned.length === 0) {
      setError("Add at least one checkpoint — it's what students submit to.");
      return;
    }
    setBusy(true);
    try {
      const saved = assignment
        ? await updateAssignment(assignment.id, {
            courseId,
            title: title.trim(),
            instructions,
            checkpoints: cleaned,
          })
        : await createAssignment({
            courseId,
            title: title.trim(),
            instructions,
            checkpoints: cleaned,
          });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prov-asg__editor">
      {error && <p className="error">{error}</p>}
      <Field label="Title">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Essay 1"
        />
      </Field>
      <Field
        label="Instructions"
        hint="Shown to students when they pick this assignment to submit to."
      >
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
        />
      </Field>

      <div className="prov-asg__cps">
        <span className="mono-label">Checkpoints</span>
        <p className="muted small">
          Each one is a moment this assignment is due. Leave a date empty and
          that checkpoint has no deadline, so nothing submitted to it is ever
          late. Late submissions are always accepted either way — the deadline
          only decides whether the roster says so.
        </p>
        {checkpoints.map((c, i) => (
          <div className="prov-asg__cp" key={i}>
            <Input
              value={c.name}
              onChange={(e) => patchCheckpoint(i, { name: e.target.value })}
              placeholder="Draft"
              aria-label={`Checkpoint ${i + 1} name`}
            />
            <Input
              type="datetime-local"
              value={c.due}
              onChange={(e) => patchCheckpoint(i, { due: e.target.value })}
              aria-label={`Checkpoint ${i + 1} deadline`}
            />
            <Button
              variant="subtle"
              size="sm"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${c.name || "checkpoint"} up`}
            >
              ↑
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => move(i, 1)}
              disabled={i === checkpoints.length - 1}
              aria-label={`Move ${c.name || "checkpoint"} down`}
            >
              ↓
            </Button>
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setCheckpoints((cur) => cur.filter((_, j) => j !== i))}
              disabled={checkpoints.length === 1}
              aria-label={`Remove ${c.name || "checkpoint"}`}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="subtle"
          size="sm"
          onClick={() => setCheckpoints((cur) => [...cur, { name: "", due: "" }])}
        >
          Add checkpoint
        </Button>
      </div>

      <div className="prov-asg__editor-actions">
        <Button variant="primary" onClick={onSubmit} loading={busy} disabled={busy}>
          {assignment ? "Save" : "Create assignment"}
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

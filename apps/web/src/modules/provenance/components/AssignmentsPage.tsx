// Assign ▸ Writing — /course/:id/instructor/assignments, and the create form
// at /course/:id/instructor/assignments/new.
//
// The AUTHORING side: one row per assignment, with its checkpoints inline, and
// Edit / Publish / Delete. What students handed in is on the REVIEW side
// (Review ▸ Submissions), where each checkpoint is listed as its own
// assignment; a row's title links there.
//
// An assignment is a title, instructions, and the ordered checkpoints students
// submit against ("draft Monday, final Wednesday" is ONE assignment the student
// keeps one document across). A one-checkpoint assignment never shows its
// checkpoint's name — it reads as "Due Oct 3", not "Final — Oct 3".
//
// Visibility is Draft / Published (stored as `archived_at`: set = students
// can't see it). New assignments start as drafts. Delete removes the
// assignment; submissions to it are kept and move to Uncategorized.
//
// Deadlines are optional. A checkpoint with no date can never be late, and
// nothing here ever blocks a late submission.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCourse } from "../../../course/useCourse.js";
import {
  createAssignment,
  deleteAssignment,
  listAgentsWithSettings,
  listAssignments,
  updateAssignment,
  type AgentSummary,
  type AssignmentDTO,
  type CheckpointDTO,
  type CheckpointInput,
  type CourseSubmissionSummary,
} from "../api.js";
import {
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Switch,
  Textarea,
  useConfirm,
} from "../../../components/index.js";

/** A checkpoint while it's being edited. The date input speaks `datetime-local`
 *  strings, so the draft holds that rather than epoch ms. */
interface CheckpointDraft {
  /** The stored checkpoint's id; absent for one added in this edit. Sent back
   *  so the server updates it in place and its submissions stay attached. */
  id?: string;
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

/** How staff name one checkpoint of an assignment: the assignment's title,
 *  plus the checkpoint's name only when there is more than one. */
export function checkpointTitle(a: AssignmentDTO, c: CheckpointDTO | null): string {
  return c && a.checkpoints.length > 1 ? `${a.title} — ${c.name}` : a.title;
}

/** Submissions no checkpoint page shows: never attached, attached to an
 *  assignment since deleted, or to a checkpoint since removed. Kept visible on
 *  their own page so nothing a student handed in is ever out of reach. */
export function uncategorized(
  subs: CourseSubmissionSummary[],
  assignments: AssignmentDTO[],
): CourseSubmissionSummary[] {
  const checkpointIds = new Set(assignments.flatMap((a) => a.checkpoints.map((c) => c.id)));
  return subs.filter((s) => s.checkpointId === null || !checkpointIds.has(s.checkpointId));
}

/** Where an assignment's submissions are read (Review ▸ Submissions): the
 *  checkpoint page when there's only one checkpoint, else the whole
 *  assignment, which links on to each checkpoint. */
export function writingSubmissionsHref(courseId: string, a: AssignmentDTO): string {
  const base = `/course/${courseId}/instructor/submissions/writing/${a.id}`;
  return a.checkpoints.length === 1 ? `${base}/${a.checkpoints[0]!.id}` : base;
}

/** The checkpoints, as one line: "Due Oct 3" for a single checkpoint (its
 *  name is never shown), "Draft due Oct 3 · Final due Oct 10" for several. */
function checkpointLine(a: AssignmentDTO): string {
  const due = (ms: number | null) => (ms === null ? "no deadline" : `due ${formatDue(ms)}`);
  if (a.checkpoints.length === 0) return "No checkpoints";
  if (a.checkpoints.length === 1) {
    const d = due(a.checkpoints[0]!.dueAt);
    return d.charAt(0).toUpperCase() + d.slice(1);
  }
  return a.checkpoints.map((c) => `${c.name} ${due(c.dueAt)}`).join(" · ");
}

/** The soonest deadline still ahead, else the latest one passed. */
function nextDue(a: AssignmentDTO, now: number): number | null {
  const dated = a.checkpoints.map((c) => c.dueAt).filter((d): d is number => d !== null);
  if (dated.length === 0) return null;
  const upcoming = dated.filter((d) => d >= now);
  return upcoming.length > 0 ? Math.min(...upcoming) : Math.max(...dated);
}

/** Drafts first (they are waiting on the instructor), then by next deadline
 *  with undated last, ties by title — stable across reloads. */
function compareAssignments(a: AssignmentDTO, b: AssignmentDTO, now: number): number {
  const aDraft = a.archivedAt !== null;
  const bDraft = b.archivedAt !== null;
  if (aDraft !== bDraft) return aDraft ? -1 : 1;
  const aDue = nextDue(a, now);
  const bDue = nextDue(b, now);
  if (aDue !== bDue) {
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue - bDue;
  }
  return a.title.localeCompare(b.title);
}

export function AssignmentsPage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const base = `/course/${courseId}/instructor/assignments`;
  const [assignments, setAssignments] = useState<AssignmentDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    setAssignments(null);
    setError(null);
    const ctrl = new AbortController();
    listAssignments(courseId, { includeArchived: true }, ctrl.signal)
      .then((a) => {
        if (!ctrl.signal.aborted) setAssignments(a);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Load failed");
      });
    return () => ctrl.abort();
  }, [courseId]);

  const sorted = useMemo(() => {
    if (assignments === null) return null;
    const now = Date.now();
    return [...assignments].sort((a, b) => compareAssignments(a, b, now));
  }, [assignments]);

  function upsert(saved: AssignmentDTO) {
    setAssignments((cur) => (cur ?? []).map((a) => (a.id === saved.id ? saved : a)));
    setEditing(null);
  }

  async function onDelete(a: AssignmentDTO) {
    if (
      !(await confirm({
        title: `Delete “${a.title}”?`,
        body: "Students stop seeing it. Everything already submitted is kept and moves to Uncategorized in Review ▸ Submissions. To take it away from students without deleting it, Unpublish instead.",
        confirmLabel: "Delete",
        danger: true,
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

  async function onTogglePublished(a: AssignmentDTO) {
    try {
      upsert(await updateAssignment(a.id, { courseId, archived: a.archivedAt === null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  const published = (assignments ?? []).filter((a) => a.archivedAt === null).length;
  const drafts = (assignments ?? []).length - published;

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Assign"
        title="Writing"
        scope="Writing assignments: instructions and checkpoints, with one document per student across all of them. What students hand in is in Review ▸ Submissions."
      />

      {error && <p className="error">{error}</p>}

      <Section
        kicker="Writing assignments"
        meta={
          sorted === null
            ? undefined
            : [
                `${published} published`,
                drafts > 0 ? `${drafts} draft${drafts === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => navigate(`${base}/new`)}>
            New
          </Button>
        }
      >
        {sorted === null ? (
          <p className="muted">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="muted">
            No writing assignments yet. Create one to give students something to
            submit against.
          </p>
        ) : (
          <div className="app-list">
            {sorted.map((a) =>
              editing === a.id ? (
                <AssignmentEditor
                  key={a.id}
                  courseId={courseId}
                  assignment={a}
                  onSaved={upsert}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <WritingRow
                  key={a.id}
                  courseId={courseId}
                  assignment={a}
                  onEdit={() => setEditing(a.id)}
                  onTogglePublished={() => onTogglePublished(a)}
                  onDelete={() => onDelete(a)}
                />
              ),
            )}
          </div>
        )}
      </Section>
      {confirmDialog}
    </div>
  );
}

/** /instructor/assignments/new — the create form on its own page, so "New"
 *  lands on the form rather than on a list. */
export function NewAssignmentPage() {
  const { courseId } = useCourse();
  const navigate = useNavigate();
  const back = `/course/${courseId}/instructor/assignments`;
  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Assign"
        title="New writing assignment"
        scope="It's saved as a draft: students see it once you publish it from the list."
      />
      <Section kicker="Assignment">
        <AssignmentEditor
          courseId={courseId}
          assignment={null}
          onSaved={() => navigate(back)}
          onCancel={() => navigate(back)}
        />
      </Section>
    </div>
  );
}

function WritingRow({
  courseId,
  assignment: a,
  onEdit,
  onTogglePublished,
  onDelete,
}: {
  courseId: string;
  assignment: AssignmentDTO;
  onEdit: () => void;
  onTogglePublished: () => void;
  onDelete: () => void;
}) {
  const draft = a.archivedAt !== null;
  return (
    <div className="app-list__row prov-asg__row">
      <div className="app-list__main">
        <div className="app-list__title">
          <Link to={writingSubmissionsHref(courseId, a)}>{a.title}</Link>
          {draft && (
            <>
              {" "}
              <Badge tone="warning">Draft</Badge>
            </>
          )}
        </div>
        <div className="app-list__sub">
          {checkpointLine(a)}
          {draft && " · students can't see this yet"}
        </div>
      </div>
      <div className="app-list__meta prov-asg__actions">
        <Button variant="subtle" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button variant="subtle" size="sm" onClick={onTogglePublished}>
          {draft ? "Publish" : "Unpublish"}
        </Button>
        <button type="button" className="danger-link" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

/**
 * Create/edit form for a writing assignment. Checkpoints are edited as an
 * ordered list; each existing one carries its id back so the server updates
 * it in place (its submissions stay attached). The order on screen is the
 * order stored. A new assignment is created as a draft.
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
    assignment?.checkpoints.map((c) => ({ id: c.id, name: c.name, due: toLocalInput(c.dueAt) })) ??
      // A new assignment starts with one checkpoint: the common case is a
      // single due date, and an empty list would only be an extra click.
      [{ name: "Final", due: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The chat beside this assignment's documents, and its voice (0033) — the
  // same pair of controls a coding assignment has. Off for a new assignment,
  // as in code: the instructor opts each one in.
  const { genaiOptOut } = useCourse();
  const [chatEnabled, setChatEnabled] = useState(assignment?.chatEnabled ?? false);
  const [lockedAgentId, setLockedAgentId] = useState<string | null>(
    assignment?.lockedAgentId ?? null,
  );
  /** Course-default agents — a personal agent can't be everyone's voice. */
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  useEffect(() => {
    if (genaiOptOut) return;
    const ctrl = new AbortController();
    listAgentsWithSettings(courseId, ctrl.signal)
      .then((l) => !ctrl.signal.aborted && setAgents(l.agents.filter((a) => !a.mine)))
      .catch(() => !ctrl.signal.aborted && setAgents([]));
    return () => ctrl.abort();
  }, [courseId, genaiOptOut]);

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
      .map((c) => ({
        ...(c.id ? { id: c.id } : {}),
        name: c.name.trim(),
        dueAt: fromLocalInput(c.due),
      }))
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
            // An instructor who opted out of generative AI never sees these
            // controls, so their edit leaves a co-instructor's choice alone.
            ...(genaiOptOut ? {} : { chatEnabled, lockedAgentId }),
          })
        : await createAssignment({
            courseId,
            title: title.trim(),
            instructions,
            checkpoints: cleaned,
            ...(genaiOptOut ? {} : { chatEnabled, lockedAgentId }),
            archived: true,
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

      {!genaiOptOut && (
        <Switch
          label="LLM chat beside the document"
          checked={chatEnabled}
          onChange={(e) => setChatEnabled(e.target.checked)}
        />
      )}
      {chatEnabled && !genaiOptOut && (
        <Field label="Voice" hint="How the chat talks to students writing this assignment.">
          <Select
            value={lockedAgentId ?? ""}
            onChange={(e) => setLockedAgentId(e.target.value === "" ? null : e.target.value)}
            disabled={agents === null}
          >
            <option value="">Let each student choose — course voices and their own</option>
            <option value="builtin:socratic">Socratic (built-in)</option>
            {(agents ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

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

// Instructor Code page: the course's coding assignments, authored inline.
//
// An assignment is a title, instructions (Markdown), an optional deadline, a
// starter notebook (edited on its own full-screen page), and one switch that
// matters more than the rest: whether students get the AI tutor beside it.
// That switch defaults off. Each row links to its roster, which lists every
// enrolled student whether or not they have submitted.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Field,
  Input,
  PageHeader,
  Section,
  Switch,
  Textarea,
  useConfirm,
} from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
  type CodeAssignmentDTO,
} from "../api.js";
import { formatDue } from "./CodeHomePage.js";

function toLocalInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function InstructorCodePage() {
  const { courseId, codeEnabled } = useCourse();
  const [assignments, setAssignments] = useState<CodeAssignmentDTO[] | null>(null);
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const base = `/course/${courseId}/instructor/code`;

  useEffect(() => {
    const ctrl = new AbortController();
    listAssignments(courseId, { includeArchived: true, signal: ctrl.signal })
      .then(setAssignments)
      .catch((e) => !ctrl.signal.aborted && setError(e instanceof Error ? e.message : "Load failed"));
    return () => ctrl.abort();
  }, [courseId]);

  function upsert(a: CodeAssignmentDTO) {
    setAssignments((cur) => {
      const list = cur ?? [];
      return list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list];
    });
    setEditing(null);
  }

  async function toggleArchive(a: CodeAssignmentDTO) {
    try {
      upsert(await updateAssignment(courseId, a.id, { archived: a.archivedAt === null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(a: CodeAssignmentDTO) {
    const ok = await confirm({
      title: `Delete “${a.title}”?`,
      body: "Students keep their work as scratch notebooks, but this assignment's submissions will no longer be listed anywhere. Archive it instead to keep the roster.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAssignment(courseId, a.id);
      setAssignments((cur) => (cur ?? []).filter((x) => x.id !== a.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const live = (assignments ?? []).filter((a) => a.archivedAt === null);
  const archived = (assignments ?? []).filter((a) => a.archivedAt !== null);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor"
        title="Code"
        scope="Python notebooks that run in each student's browser. Students bring their own data files, which stay on their machine. Turn the AI tutor on per assignment."
      />

      {!codeEnabled && (
        <p className="code-off-note">
          Code is turned off for this course, so students can't see it yet. Turn
          it on in <Link to={`/course/${courseId}/instructor/settings`}>Settings</Link> when
          you're ready.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <Section
        kicker="Coding assignments"
        meta={assignments ? `${live.length} live${archived.length ? ` · ${archived.length} archived` : ""}` : undefined}
        actions={
          editing === null && (
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              New assignment
            </Button>
          )
        }
      >
        {editing === "new" && (
          <AssignmentEditor courseId={courseId} assignment={null} onSaved={upsert} onCancel={() => setEditing(null)} />
        )}
        {assignments === null ? (
          <p className="muted">Loading…</p>
        ) : assignments.length === 0 && editing === null ? (
          <p className="muted">
            No coding assignments yet. Create one, then open its starter
            notebook to write the cells every student begins from.
          </p>
        ) : (
          <div className="app-list">
            {[...live, ...archived].map((a) =>
              editing === a.id ? (
                <AssignmentEditor
                  key={a.id}
                  courseId={courseId}
                  assignment={a}
                  onSaved={upsert}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className={`app-list__row${a.archivedAt ? " is-archived" : ""}`} key={a.id}>
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`${base}/${a.id}`}>{a.title}</Link>
                    </div>
                    <div className="app-list__sub">
                      {[
                        a.dueAt ? `Due ${formatDue(a.dueAt)}` : "No deadline",
                        a.aiEnabled ? "Tutor on" : "Tutor off",
                        a.archivedAt ? "Archived" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <div className="app-list__meta prov-asg__actions">
                    <Button variant="subtle" size="sm" href={`${base}/${a.id}/starter`}>
                      Starter notebook
                    </Button>
                    <Button variant="subtle" size="sm" href={`${base}/${a.id}`}>
                      Submissions
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(a.id)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void toggleArchive(a)}>
                      {a.archivedAt ? "Restore" : "Archive"}
                    </Button>
                    <button type="button" className="danger-link" onClick={() => void remove(a)}>
                      Delete
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </Section>
      {dialog}
    </div>
  );
}

function AssignmentEditor({
  courseId,
  assignment,
  onSaved,
  onCancel,
}: {
  courseId: string;
  assignment: CodeAssignmentDTO | null;
  onSaved: (a: CodeAssignmentDTO) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [due, setDue] = useState(toLocalInput(assignment?.dueAt ?? null));
  const [aiEnabled, setAiEnabled] = useState(assignment?.aiEnabled ?? false);
  const [aiPrompt, setAiPrompt] = useState(assignment?.aiPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Give the assignment a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      title: title.trim(),
      instructions,
      dueAt: fromLocalInput(due),
      aiEnabled,
      aiPrompt: aiPrompt.trim() || null,
    };
    try {
      onSaved(
        assignment
          ? await updateAssignment(courseId, assignment.id, input)
          : await createAssignment(courseId, input),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div className="prov-asg__editor">
      {error && <p className="error">{error}</p>}
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Linear regression from scratch" />
      </Field>
      <Field label="Instructions" hint="Shown above the notebook. Markdown and math are supported.">
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} />
      </Field>
      <Field label="Due" hint="Optional. Late submissions are accepted and shown with their time.">
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      <Switch
        label="AI tutor beside the notebook"
        checked={aiEnabled}
        onChange={(e) => setAiEnabled(e.target.checked)}
      />
      {aiEnabled && (
        <Field
          label="Guidance for the tutor"
          hint="Optional. Added to the built-in coding tutor, which already declines to write solutions."
        >
          <Textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            rows={3}
            placeholder="Students haven't seen vectorisation yet, so steer them toward loops."
          />
        </Field>
      )}
      <div className="prov-asg__editor-actions">
        <Button variant="primary" onClick={() => void save()} loading={busy}>
          {assignment ? "Save" : "Create assignment"}
        </Button>
        <Button variant="subtle" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

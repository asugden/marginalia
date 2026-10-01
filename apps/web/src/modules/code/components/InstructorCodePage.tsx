// Assign ▸ Code: the course's coding assignments — the AUTHORING side.
// Created at /instructor/code/new, edited inline here. What students handed
// in is on the Review side (Review ▸ Submissions); a row's title links there.
//
// An assignment is a title, instructions (Markdown), an optional deadline, a
// starter notebook (edited on its own full-screen page), and one switch that
// matters more than the rest: whether students get the AI chat beside it.
// That switch defaults off.
//
// Visibility is Draft / Published, as in Writing (stored as `archived_at`).
// A new assignment is a DRAFT and opens straight into its starter notebook:
// the starter can only be written once the assignment exists, so it must be
// able to exist before students can see it. Write the starter, try the chat
// against it, then Publish.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  RadioCard,
  RadioCardGroup,
  Section,
  Select,
  Switch,
  Textarea,
  useConfirm,
} from "../../../components/index.js";
import { useCourse } from "../../../course/useCourse.js";
import { listVoices, type VoiceListing } from "../../../api.js";
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
  updateAssignment,
  type AssignmentMode,
  type CodeVoiceRef,
  type CodeAssignmentDTO,
} from "../api.js";
import { formatDue } from "./CodeHomePage.js";

function toLocalInput(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The library voice an assignment uses when it names none. */
const DEFAULT_VOICE = "socratic";

/** Voices as <select> values: `library:<id>` or `custom:<voiceId>`. */
function voiceKey(ref: CodeVoiceRef | null): string {
  if (!ref) return `library:${DEFAULT_VOICE}`;
  return ref.kind === "library" ? `library:${ref.id}` : `custom:${ref.voiceId}`;
}
function voiceRef(key: string): CodeVoiceRef {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  return kind === "custom" ? { kind: "custom-ref", voiceId: id } : { kind: "library", id };
}

function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function InstructorCodePage() {
  const { courseId, codeEnabled, capabilities, genaiOptOut } = useCourse();
  // Authoring only — TAs read submissions from Review ▸ Submissions.
  const authors = capabilities.includes("author");
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<CodeAssignmentDTO[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
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
    setAssignments((cur) => (cur ?? []).map((x) => (x.id === a.id ? a : x)));
    setEditing(null);
  }

  async function togglePublished(a: CodeAssignmentDTO) {
    try {
      upsert(await updateAssignment(courseId, a.id, { archived: a.archivedAt === null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function remove(a: CodeAssignmentDTO) {
    const ok = await confirm({
      title: `Delete “${a.title}”?`,
      body: "Students stop seeing it and keep their work as scratch notebooks, but its submissions will no longer be listed anywhere. To take it away from students and keep the submissions, Unpublish instead.",
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

  // Drafts first — they are waiting on the instructor — then the server's
  // deadline order.
  const drafts = (assignments ?? []).filter((a) => a.archivedAt !== null);
  const published = (assignments ?? []).filter((a) => a.archivedAt === null);

  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Assign"
        title="Code"
        scope="Python notebooks that run in each student's browser. Students bring their own data files, which stay on their machine. What students hand in is in Review ▸ Submissions."
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
        meta={
          assignments
            ? [
                `${published.length} published`,
                drafts.length ? `${drafts.length} draft${drafts.length === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          authors && (
            <Button variant="primary" size="sm" onClick={() => navigate(`${base}/new`)}>
              New
            </Button>
          )
        }
      >
        {assignments === null ? (
          <p className="muted">Loading…</p>
        ) : assignments.length === 0 ? (
          <p className="muted">
            No coding assignments yet.{" "}
            {authors &&
              "Create one: it starts as a draft students can't see, so you can write and try its starter notebook before you publish it."}
          </p>
        ) : (
          <div className="app-list">
            {[...drafts, ...published].map((a) =>
              editing === a.id ? (
                <AssignmentEditor
                  key={a.id}
                  courseId={courseId}
                  assignment={a}
                  hideAi={genaiOptOut}
                  onSaved={upsert}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="app-list__row prov-asg__row" key={a.id}>
                  <div className="app-list__main">
                    <div className="app-list__title">
                      <Link to={`/course/${courseId}/instructor/submissions/code/${a.id}`}>
                        {a.title}
                      </Link>
                      {a.archivedAt !== null && (
                        <>
                          {" "}
                          <Badge tone="warning">Draft</Badge>
                        </>
                      )}
                    </div>
                    <div className="app-list__sub">
                      {[
                        a.mode === "practice" ? "Practice" : null,
                        a.dueAt ? `Due ${formatDue(a.dueAt)}` : "No deadline",
                        a.archivedAt !== null ? "students can't see this yet" : null,
                        a.aiEnabled
                          ? a.voiceChoice
                            ? "Chat on · students pick the voice"
                            : "Chat on"
                          : // Opted out of generative AI: don't label every row
                            // with it; a co-instructor's "Chat on" still shows.
                            genaiOptOut
                            ? null
                            : "Chat off",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  {authors && (
                    <div className="app-list__meta prov-asg__actions">
                      <Button variant="subtle" size="sm" href={`${base}/${a.id}/starter`}>
                        Starter notebook
                      </Button>
                      <Button variant="subtle" size="sm" onClick={() => setEditing(a.id)}>
                        Edit
                      </Button>
                      <Button variant="subtle" size="sm" onClick={() => void togglePublished(a)}>
                        {a.archivedAt !== null ? "Publish" : "Unpublish"}
                      </Button>
                      <button type="button" className="danger-link" onClick={() => void remove(a)}>
                        Delete
                      </button>
                    </div>
                  )}
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

/** /instructor/code/new — the create form on its own page, so "New → Coding
 *  assignment" lands on the form. Saving creates a DRAFT and opens its starter
 *  notebook, which is the next thing to write; publish from the list. */
export function NewCodeAssignmentPage() {
  const { courseId, genaiOptOut } = useCourse();
  const navigate = useNavigate();
  const base = `/course/${courseId}/instructor/code`;
  return (
    <div className="app-page">
      <PageHeader
        eyebrow="Instructor · Assign"
        title="New coding assignment"
        scope="It's saved as a draft students can't see. Next you'll write its starter notebook and can try the chat against it; publish it from the list when it's ready."
      />
      <Section kicker="Assignment">
        <AssignmentEditor
          courseId={courseId}
          assignment={null}
          hideAi={genaiOptOut}
          onSaved={(a) => navigate(`${base}/${a.id}/starter`)}
          onCancel={() => navigate(base)}
        />
      </Section>
    </div>
  );
}

function AssignmentEditor({
  courseId,
  assignment,
  hideAi = false,
  onSaved,
  onCancel,
}: {
  courseId: string;
  assignment: CodeAssignmentDTO | null;
  /** The editing instructor opted out of generative AI: no chat controls.
   *  A new assignment is saved with the chat off; an existing one keeps
   *  whatever a co-instructor set. */
  hideAi?: boolean;
  onSaved: (a: CodeAssignmentDTO) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(assignment?.title ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [due, setDue] = useState(toLocalInput(assignment?.dueAt ?? null));
  const [aiEnabled, setAiEnabled] = useState(assignment?.aiEnabled ?? false);
  const [aiPrompt, setAiPrompt] = useState(assignment?.aiPrompt ?? "");
  const [mode, setMode] = useState<AssignmentMode>(assignment?.mode ?? "submit");
  // "choice" is the students-pick policy; any other value is one assigned
  // voice, in the `library:`/`custom:` key form voiceKey/voiceRef speak.
  const [voice, setVoice] = useState<string>(
    assignment?.voiceChoice ? "choice" : voiceKey(assignment?.voice ?? null),
  );
  const [voices, setVoices] = useState<VoiceListing | null>(null);
  useEffect(() => {
    let live = true;
    listVoices()
      .then((v) => live && setVoices(v))
      .catch(() => live && setVoices({ library: [], owned: [], shared: [] }));
    return () => {
      live = false;
    };
  }, []);
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
      // Students-choose keeps the stored voice as each student's default —
      // only a concrete pick overwrites it.
      ...(voice === "choice" ? {} : { voice: voiceRef(voice) }),
      voiceChoice: voice === "choice",
      mode,
    };
    try {
      onSaved(
        assignment
          ? await updateAssignment(courseId, assignment.id, input)
          : await createAssignment(courseId, { ...input, archived: true }),
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
      <Field label="Mode">
        <RadioCardGroup inline>
          <RadioCard
            name="code-mode"
            value="submit"
            title="Submitted"
            description="Students hand it in. You see where each character came from: typed, pasted, from the LLM chat, or provided in the starter."
            selected={mode === "submit"}
            checked={mode === "submit"}
            onChange={() => setMode("submit")}
          />
          <RadioCard
            name="code-mode"
            value="practice"
            title="Practice"
            description="Nothing to hand in, and nothing is recorded. Good for in-class exercises."
            selected={mode === "practice"}
            checked={mode === "practice"}
            onChange={() => setMode("practice")}
          />
        </RadioCardGroup>
      </Field>
      <Field label="Due" hint="Optional. Late submissions are accepted and shown with their time.">
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
      </Field>
      {!hideAi && (
        <Switch
          label="LLM chat beside the notebook"
          checked={aiEnabled}
          onChange={(e) => setAiEnabled(e.target.checked)}
        />
      )}
      {aiEnabled && !hideAi && (
        <Field
          label="Voice"
          hint={
            <>
              How the chat talks: the same voices your agents use.{" "}
              <Link to={`/course/${courseId}/instructor/voices`}>Manage voices</Link>
            </>
          }
        >
          <Select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={voices === null}>
            {/* The other policy: no assigned voice — each student picks from
                the library in their chat header. Same pair of choices the
                Writing module's settings offer. */}
            <option value="choice">Let each student choose (library voices)</option>
            <optgroup label="Library">
              {(voices?.library.length ? voices.library : [{ id: DEFAULT_VOICE, name: "Socratic", description: "" }]).map(
                (v) => (
                  <option key={v.id} value={`library:${v.id}`}>
                    {v.name}
                    {v.id === DEFAULT_VOICE ? " (default)" : ""}
                  </option>
                ),
              )}
            </optgroup>
            {!!voices?.owned.length && (
              <optgroup label="Your voices">
                {voices.owned.map((v) => (
                  <option key={v.id} value={`custom:${v.id}`}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
            {!!voices?.shared.length && (
              <optgroup label="Shared with you">
                {voices.shared.map((v) => (
                  <option key={v.id} value={`custom:${v.id}`}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      )}
      {aiEnabled && !hideAi && (
        <Field
          label="Guidance for the chat"
          hint="Optional, for this assignment. Added beneath the voice. Whatever the voice, the chat already declines to write solutions."
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

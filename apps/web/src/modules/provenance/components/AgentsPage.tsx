// My-agents management page. Lists course defaults (read-only) + the
// student's own agents (editable). Course comes from useActiveCourse();
// chrome from <StandalonePage>.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveCourse } from "../../../course/useActiveCourse.js";
import { StandalonePage } from "../../../course/StandalonePage.js";
import {
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
  type AgentSummary,
} from "../api.js";
import { Badge, Button, Field, IconButton, Input, Textarea } from "../../../components/index.js";
import { PlusIcon, TrashIcon } from "../../../icons.js";

const DEFAULT_PROMPT =
  "You are a thoughtful tutor. Ask clarifying questions, suggest ideas, and help the student think — don't write their work for them.";

interface DraftState {
  id: string | null; // null = creating
  name: string;
  systemPrompt: string;
}

export function AgentsPage() {
  const { active, enrollments, setCourseId, loading, notEnrolled } = useActiveCourse();
  const courseId = active?.courseId ?? null;

  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    refresh(courseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function refresh(cid: string) {
    listAgents(cid)
      .then(setAgents)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  async function startEdit(id: string) {
    if (!courseId) return;
    setError(null);
    try {
      const agent = await getAgent(courseId, id);
      setDraft({ id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  function startCreate() {
    setError(null);
    setDraft({ id: null, name: "", systemPrompt: DEFAULT_PROMPT });
  }

  async function onSave() {
    if (!draft || !courseId) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.id === null) {
        await createAgent({ courseId, name: draft.name, systemPrompt: draft.systemPrompt });
      } else {
        await updateAgent(draft.id, { courseId, name: draft.name, systemPrompt: draft.systemPrompt });
      }
      setDraft(null);
      refresh(courseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!courseId) return;
    if (!confirm("Delete this agent? Existing conversations will keep their snapshot.")) return;
    try {
      await deleteAgent(courseId, id);
      refresh(courseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const courseDefaults = agents?.filter((a) => !a.mine) ?? [];
  const mine = agents?.filter((a) => a.mine) ?? [];

  const actions = (
    <>
      <Button variant="ghost" href="/write">
        ← Documents
      </Button>
      <Button
        variant="primary"
        icon={<PlusIcon size={16} />}
        onClick={startCreate}
        disabled={!courseId}
      >
        New agent
      </Button>
    </>
  );

  return (
    <StandalonePage
      title="Writing"
      section="Agents"
      titleTo="/write"
      actions={actions}
      course={{ active, enrollments, onSwitch: setCourseId }}
      note="Personal prompts for the chat side-panel. Course defaults are shared with everyone in the class; agents you create are yours alone."
    >
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {notEnrolled && (
        <p className="muted">
          You aren't enrolled in any course yet. Use a join code on the{" "}
          <Link to="/">home page</Link> to get started.
        </p>
      )}

      {courseId && (
        <>
          {agents === null && <p className="muted">Loading…</p>}

          <AgentSection
            heading="Course defaults"
            empty="No course-default agents yet."
            agents={courseDefaults}
            onOpen={startEdit}
          />

          <AgentSection
            heading="Mine"
            empty="No personal agents yet. Click New agent to create one."
            agents={mine}
            onOpen={startEdit}
            onDelete={onDelete}
          />

          {draft && (
            <AgentEditor
              draft={draft}
              busy={busy}
              onChange={setDraft}
              onCancel={() => setDraft(null)}
              onSave={onSave}
            />
          )}
        </>
      )}
    </StandalonePage>
  );
}

function AgentSection(props: {
  heading: string;
  empty: string;
  agents: AgentSummary[];
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const { heading, empty, agents, onOpen, onDelete } = props;
  return (
    <div className="ds-staff-section">
      <span className="mono-label ds-staff-section__label">{heading}</span>
      {agents.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <div className="ds-staff-list">
          {agents.map((a) => (
            <div className="ds-staff-list__row" key={a.id}>
              <div className="ds-staff-list__main">
                <div className="ds-staff-list__title">{a.name}</div>
                <div className="ds-staff-list__sub" style={{ marginTop: "0.3rem" }}>
                  <Badge tone={onDelete ? "ghost" : "neutral"}>
                    {onDelete ? "Personal" : "Set by an instructor"}
                  </Badge>
                </div>
              </div>
              <div className="ds-staff-list__actions">
                <Button variant="subtle" size="sm" onClick={() => onOpen(a.id)}>
                  Edit
                </Button>
                {onDelete && (
                  <IconButton
                    variant="ghost"
                    size="sm"
                    title="Delete agent"
                    onClick={() => onDelete(a.id)}
                  >
                    <TrashIcon size={16} />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentEditor(props: {
  draft: DraftState;
  busy: boolean;
  onChange: (next: DraftState) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { draft, busy, onChange, onCancel, onSave } = props;
  const canSave = draft.name.trim().length > 0 && draft.systemPrompt.trim().length > 0;
  return (
    <div
      className="ds-staff-section"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-xs)",
        padding: "1.5rem",
      }}
    >
      <span className="mono-label ds-staff-section__label">
        {draft.id === null ? "New agent" : "Edit agent"}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "0.5rem" }}>
        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g. Socratic tutor"
          />
        </Field>
        <Field label="System prompt">
          <Textarea
            rows={10}
            className="ds-input--mono"
            value={draft.systemPrompt}
            onChange={(e) => onChange({ ...draft, systemPrompt: e.target.value })}
          />
        </Field>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button variant="subtle" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} disabled={busy || !canSave}>
            {draft.id === null ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

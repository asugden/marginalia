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
      <Link to="/write" className="link-button subtle">← Documents</Link>
      <button type="button" className="link-button" onClick={startCreate} disabled={!courseId}>
        New agent
      </button>
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
    <section className="prov-agent-section">
      <h2 className="prov-agent-section-heading">{heading}</h2>
      {agents.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="assignment-list">
          {agents.map((a) => (
            <li key={a.id}>
              <div>
                <button
                  type="button"
                  className="prov-agent-row-link"
                  onClick={() => onOpen(a.id)}
                >
                  <strong>{a.name}</strong>
                </button>
                <div className="muted small">
                  {onDelete ? "Personal" : "Set by an instructor"}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="link-button subtle" onClick={() => onOpen(a.id)}>
                  Edit
                </button>
                {onDelete && (
                  <button type="button" className="danger-link" onClick={() => onDelete(a.id)}>
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
    <div className="prov-agent-editor">
      <header className="prov-agent-editor-header">
        <h2>{draft.id === null ? "New agent" : "Edit agent"}</h2>
      </header>
      <label className="prov-field">
        <span>Name</span>
        <input
          className="prov-input"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Socratic tutor"
        />
      </label>
      <label className="prov-field">
        <span>System prompt</span>
        <textarea
          className="prov-input prov-textarea"
          rows={10}
          value={draft.systemPrompt}
          onChange={(e) => onChange({ ...draft, systemPrompt: e.target.value })}
        />
      </label>
      <div className="prov-agent-editor-actions">
        <button type="button" className="link-button subtle" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="link-button" onClick={onSave} disabled={busy || !canSave}>
          {draft.id === null ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}

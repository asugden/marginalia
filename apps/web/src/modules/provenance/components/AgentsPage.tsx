// My-agents management page. Lists course defaults (read-only) +
// the student's own agents (editable). Slice 3: students can author
// personal agents; the instructor-default workflow (courseDefault: true)
// is wired through the API but not surfaced here — add an instructor
// affordance later if/when there's an instructor UI for this module.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DEMO_COURSE } from "../../../course.js";
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

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string | null; // null = creating
    name: string;
    systemPrompt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    listAgents(DEMO_COURSE)
      .then(setAgents)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  async function startEdit(id: string) {
    setError(null);
    try {
      const agent = await getAgent(DEMO_COURSE, id);
      setEditing({ id: agent.id, name: agent.name, systemPrompt: agent.systemPrompt });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  function startCreate() {
    setError(null);
    setEditing({ id: null, name: "", systemPrompt: DEFAULT_PROMPT });
  }

  async function onSave() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (editing.id === null) {
        await createAgent({
          courseId: DEMO_COURSE,
          name: editing.name,
          systemPrompt: editing.systemPrompt,
        });
      } else {
        await updateAgent(editing.id, {
          courseId: DEMO_COURSE,
          name: editing.name,
          systemPrompt: editing.systemPrompt,
        });
      }
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this agent? Existing conversations will keep their snapshot.")) return;
    try {
      await deleteAgent(DEMO_COURSE, id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const courseDefaults = agents?.filter((a) => !a.mine) ?? [];
  const mine = agents?.filter((a) => a.mine) ?? [];

  return (
    <main className="page provenance-agents-page">
      <header className="provenance-list-header">
        <h1>
          <Link to="/write" className="provenance-back">←</Link>
          {" "}My Agents
        </h1>
        <button type="button" onClick={startCreate}>New agent</button>
      </header>

      {error && <p className="error">{error}</p>}

      <section>
        <h2 className="provenance-agent-section">Course defaults</h2>
        {agents === null && <p>Loading…</p>}
        {agents !== null && courseDefaults.length === 0 && (
          <p className="muted">No course-default agents yet.</p>
        )}
        {courseDefaults.length > 0 && (
          <ul className="provenance-doc-list">
            {courseDefaults.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="provenance-doc-link"
                  onClick={() => startEdit(a.id)}
                >
                  <span className="title">{a.name}</span>
                  <span className="meta">Read-only — set by an instructor</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="provenance-agent-section">My agents</h2>
        {agents !== null && mine.length === 0 && (
          <p className="muted">No personal agents yet. Click “New agent” to create one.</p>
        )}
        {mine.length > 0 && (
          <ul className="provenance-doc-list">
            {mine.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="provenance-doc-link"
                  onClick={() => startEdit(a.id)}
                >
                  <span className="title">{a.name}</span>
                  <span className="meta">Personal</span>
                </button>
                <button
                  type="button"
                  className="provenance-doc-delete"
                  onClick={() => onDelete(a.id)}
                  aria-label={`Delete ${a.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <AgentEditor
          editing={editing}
          busy={busy}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={onSave}
        />
      )}
    </main>
  );
}

function AgentEditor(props: {
  editing: { id: string | null; name: string; systemPrompt: string };
  busy: boolean;
  onChange: (next: { id: string | null; name: string; systemPrompt: string }) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { editing, busy, onChange, onCancel, onSave } = props;
  return (
    <div className="provenance-agent-editor">
      <h3>{editing.id === null ? "New agent" : "Edit agent"}</h3>
      <label>
        Name
        <input
          value={editing.name}
          onChange={(e) => onChange({ ...editing, name: e.target.value })}
          placeholder="e.g. Socratic tutor"
        />
      </label>
      <label>
        System prompt
        <textarea
          rows={10}
          value={editing.systemPrompt}
          onChange={(e) => onChange({ ...editing, systemPrompt: e.target.value })}
        />
      </label>
      <div className="provenance-agent-editor-buttons">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" onClick={onSave} disabled={busy || !editing.name.trim() || !editing.systemPrompt.trim()}>
          {editing.id === null ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}
